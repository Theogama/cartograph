import "server-only";

import { createHash } from "node:crypto";
import { traceable } from "langsmith/traceable";

import {
  buildExplanationPrompt,
  EXPLANATION_SYSTEM_PROMPT,
  type ExplanationTarget,
} from "@/lib/ai/explanation-prompt";
import { getOpenRouterClient } from "@/lib/ai/openrouter-client";

export const EXPLANATION_MODEL =
  process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b";

export interface ExplainSelectionRequest {
  analysisId: string;
  repositoryUrl: string;
  commitSha: string | null;
  target: ExplanationTarget;
  neighboringPaths: string[];
}

export interface ExplainSelectionResult {
  targetKey: string;
  text: string;
  stale: boolean;
  source: "cache" | "model";
  cacheKey: string;
}

const explanationCache = new Map<string, ExplainSelectionResult>();

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function getTargetKey(target: ExplanationTarget): string {
  return target.type === "file" ? `file:${target.path}` : `folder:${target.folder}`;
}

function parseRepositorySlug(repositoryUrl: string): { owner: string; repo: string } {
  try {
    const url = new URL(repositoryUrl);
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    if (!match) {
      throw new Error(`Unsupported repo URL: ${repositoryUrl}`);
    }
    return { owner: match[1], repo: match[2] };
  } catch {
    throw new Error(`Unable to resolve repository details from ${repositoryUrl}.`);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Cartograph",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status} ${response.statusText}) for ${url}.`);
  }

  return (await response.json()) as T;
}

async function fetchRawText(repositoryUrl: string, commitSha: string | null, filePath: string): Promise<string> {
  const { owner, repo } = parseRepositorySlug(repositoryUrl);
  const ref = commitSha ?? "HEAD";
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${normalizeRepoPath(filePath)}`;
  const response = await fetch(rawUrl, { next: { revalidate: 60 } });

  if (!response.ok) {
    throw new Error(`Unable to load ${filePath} from ${repositoryUrl}.`);
  }

  return await response.text();
}

async function fetchHeadCommitSha(repositoryUrl: string): Promise<string | null> {
  const { owner, repo } = parseRepositorySlug(repositoryUrl);
  try {
    const details = await fetchJson<{ default_branch: string }>(`https://api.github.com/repos/${owner}/${repo}`);
    const branch = details.default_branch ?? "main";
    const branchInfo = await fetchJson<{ object?: { sha?: string } }>(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return branchInfo.object?.sha ?? null;
  } catch {
    return null;
  }
}

function computeContentHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function collectContext(
  repositoryUrl: string,
  commitSha: string | null,
  target: ExplanationTarget,
  neighboringPaths: string[],
): Promise<{ path: string; text: string }[]> {
  const uniquePaths = new Set<string>();
  if (target.type === "file") {
    uniquePaths.add(target.path);
  } else {
    for (const path of neighboringPaths) {
      uniquePaths.add(path);
    }
  }

  for (const path of neighboringPaths) {
    uniquePaths.add(path);
  }

  const contexts: { path: string; text: string }[] = [];
  for (const value of [...uniquePaths].sort()) {
    const text = await fetchRawText(repositoryUrl, commitSha, value);
    contexts.push({ path: value, text: text.slice(0, 12_000) });
  }

  return contexts;
}

async function needsStaleCheck(
  repositoryUrl: string,
  commitSha: string | null,
  target: ExplanationTarget,
  context: { path: string; text: string }[],
): Promise<boolean> {
  if (!commitSha) {
    return false;
  }

  const headSha = await fetchHeadCommitSha(repositoryUrl);
  if (headSha && headSha !== commitSha) {
    return true;
  }

  const contentHash = computeContentHash(
    JSON.stringify(
      context.map((item) => ({ path: item.path, text: item.text })),
    ),
  );

  const targetHash = computeContentHash(
    JSON.stringify({ target, contentHash }),
  );

  const cached = explanationCache.get(targetHash);
  if (cached && cached.cacheKey.includes(targetHash)) {
    return false;
  }

  return false;
}

async function explainSelectionValue(
  request: ExplainSelectionRequest,
): Promise<ExplainSelectionResult> {
  const targetKey = getTargetKey(request.target);
  const context = await collectContext(
    request.repositoryUrl,
    request.commitSha,
    request.target,
    request.neighboringPaths,
  );
  const payload = JSON.stringify(context.map((item) => ({ path: item.path, text: item.text })));
  const contentHash = computeContentHash(payload);
  const cacheKey = `${EXPLANATION_MODEL}:${targetKey}:${contentHash}`;
  const allowedPaths = [...new Set([
    ...context.map((item) => item.path),
    ...(request.target.type === "folder" ? [request.target.folder] : []),
  ])];
  const traceInput = {
    target: request.target,
    context,
    allowedPaths,
  };

  return traceable(
    async (input: typeof traceInput): Promise<ExplainSelectionResult> => {
      const cached = explanationCache.get(cacheKey);
      if (cached) {
        return { ...cached, source: "cache" };
      }

      const stale = await needsStaleCheck(
        request.repositoryUrl,
        request.commitSha,
        request.target,
        context,
      );

      const client = getOpenRouterClient();
      const prompt = buildExplanationPrompt(input.target, input.context);
      const completion = await client.chat.completions.create({
        model: EXPLANATION_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: EXPLANATION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const text = completion.choices[0]?.message.content?.trim() ?? "No explanation available.";
      const result: ExplainSelectionResult = {
        targetKey,
        text,
        stale,
        source: "model",
        cacheKey,
      };

      explanationCache.set(cacheKey, result);
      return result;
    },
    {
      name: "cartograph.explain",
      metadata: {
        application: "cartograph",
        model: EXPLANATION_MODEL,
        targetKey,
        repository: request.repositoryUrl,
      },
    },
  )(traceInput);
}

export async function explainSelection(
  request: ExplainSelectionRequest,
): Promise<ExplainSelectionResult> {
  return explainSelectionValue(request);
}
