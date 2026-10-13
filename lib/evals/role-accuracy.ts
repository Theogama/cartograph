import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { traceable } from "langsmith/traceable";

import { parseRepository } from "@/lib/repository-parser";
import { packageFrameworkAdapter } from "@/lib/package-framework-adapter";
import { getOpenRouterClient } from "@/lib/ai/openrouter-client";

export const ALLOWED_CLASSIFIER_ROLES = [
  "service",
  "repository",
  "model",
  "util",
  "config",
  "component",
  "hook",
] as const;

export type ClassifierRole = (typeof ALLOWED_CLASSIFIER_ROLES)[number];

export interface RoleAccuracySample {
  path: string;
  expected: ClassifierRole;
  source: string;
}

interface RolePrediction {
  role: ClassifierRole | null;
  error: string | null;
}

const MIN_ROLE_SAMPLE_COUNT = 30;
const ROLE_BATCH_SIZE = 4;
const roleCache = new Map<string, RolePrediction>();

function isClassifierRole(value: string): value is ClassifierRole {
  return (ALLOWED_CLASSIFIER_ROLES as readonly string[]).includes(value);
}

function inferConventionalRole(filePath: string): ClassifierRole | null {
  const normalized = filePath.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const segments = lower.split("/");
  const basename = segments.at(-1) ?? "";

  if (/^use[-A-Z]/.test(basename) || /^use[A-Z]/.test(normalized.split("/").at(-1) ?? "")) {
    return "hook";
  }
  if (
    segments.includes("config") ||
    segments.includes("supabase") ||
    /\.config\.[cm]?[jt]sx?$/i.test(normalized) ||
    basename === "openrouter-client.ts"
  ) {
    return "config";
  }
  if (segments.includes("components")) {
    return "component";
  }
  if (basename === "explanation-prompt.ts") {
    return "util";
  }
  if (segments.includes("app") && /\/layout\.[jt]sx?$/i.test(normalized)) {
    return "component";
  }
  if (
    segments.includes("services") ||
    /\.service\.[cm]?[jt]sx?$/i.test(normalized) ||
    basename.startsWith("run-") ||
    segments.includes("scripts") ||
    segments.includes("ai")
  ) {
    return "service";
  }
  if (
    segments.includes("repositories") ||
    /(?:^|[-.])repository(?:[-.]|$)/i.test(basename) ||
    /(?:^|[-.])parser(?:[-.]|$)/i.test(basename)
  ) {
    return "repository";
  }
  if (segments.includes("models") || /(?:^|[-.])model(?:[-.]|$)/i.test(basename)) {
    return "model";
  }
  if (segments.includes("lib")) {
    return "util";
  }

  return null;
}

export async function buildRoleAccuracyDataset(
  repositoryRoot: string = process.cwd(),
): Promise<RoleAccuracySample[]> {
  const parsed = await parseRepository(repositoryRoot, packageFrameworkAdapter);
  const structurallyAssigned = new Set(parsed.fileRoles.map((record) => record.path));
  const samples: RoleAccuracySample[] = [];

  for (const file of parsed.files) {
    if (
      structurallyAssigned.has(file.path) ||
      file.path === "lib/evals/role-accuracy.ts" ||
      file.path === "proxy.ts" ||
      file.path.startsWith("app/") && !/\/layout\.[jt]sx?$/i.test(file.path)
    ) {
      continue;
    }

    const expected = inferConventionalRole(file.path);
    if (!expected) {
      continue;
    }

    const source = await readFile(path.join(repositoryRoot, file.path), "utf8");
    samples.push({ path: file.path, expected, source });
  }

  if (samples.length < MIN_ROLE_SAMPLE_COUNT) {
    throw new Error(
      `Role accuracy requires at least ${MIN_ROLE_SAMPLE_COUNT} held-out files assigned a conventional, allowed role; found ${samples.length} in ${repositoryRoot}. Run against a larger parsed repository.`,
    );
  }

  return samples;
}

const classifyFileRoleTraced = traceable(
  async (input: { filePath: string; source: string }): Promise<RolePrediction> => {
    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b";
    const cacheKey = createHash("sha256")
      .update(JSON.stringify({ model, filePath: input.filePath, source: input.source }))
      .digest("hex");
    const cached = roleCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await getOpenRouterClient().chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Classify one source file using only the supplied code. Return exactly one JSON object with a "role" value from this list: ${ALLOWED_CLASSIFIER_ROLES.join(", ")}. Never return a structural role such as page, route, or controller.`,
        },
        {
          role: "user",
          content: `File path: ${input.filePath}\n\nSource:\n${input.source}`,
        },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (typeof content !== "string" || content.trim() === "") {
      const prediction = { role: null, error: "Classifier returned no label." };
      roleCache.set(cacheKey, prediction);
      return prediction;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const prediction = { role: null, error: `Classifier returned invalid JSON: ${content}` };
      roleCache.set(cacheKey, prediction);
      return prediction;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("role" in parsed) ||
      typeof parsed.role !== "string"
    ) {
      const prediction = { role: null, error: `Classifier returned no role label: ${content}` };
      roleCache.set(cacheKey, prediction);
      return prediction;
    }

    if (!isClassifierRole(parsed.role)) {
      const prediction = {
        role: null,
        error: `Classifier returned a role outside the allowed set: ${parsed.role}`,
      };
      roleCache.set(cacheKey, prediction);
      return prediction;
    }

    const prediction = { role: parsed.role, error: null };
    roleCache.set(cacheKey, prediction);
    return prediction;
  },
  {
    name: "cartograph.eval.role-classifier",
    metadata: { application: "cartograph", evaluator: "held-out-role-accuracy" },
  },
);

export function classifyFileRole(
  filePath: string,
  source: string,
): Promise<RolePrediction> {
  return classifyFileRoleTraced({ filePath, source: source.slice(0, 12_000) });
}

export async function evaluateRoleAccuracy(
  samples: readonly RoleAccuracySample[],
): Promise<{
  datasetSize: number;
  correct: number;
  accuracy: number;
  results: Array<{
    path: string;
    expected: ClassifierRole;
    predicted: ClassifierRole | null;
    predictionError: string | null;
    correct: boolean;
  }>;
}> {
  if (samples.length < MIN_ROLE_SAMPLE_COUNT) {
    throw new Error(
      `Role accuracy requires at least ${MIN_ROLE_SAMPLE_COUNT} samples; received ${samples.length}.`,
    );
  }

  const results: Array<{
    path: string;
    expected: ClassifierRole;
    predicted: ClassifierRole | null;
    predictionError: string | null;
    correct: boolean;
  }> = [];

  for (let offset = 0; offset < samples.length; offset += ROLE_BATCH_SIZE) {
    const batch = samples.slice(offset, offset + ROLE_BATCH_SIZE);
    const classified = await Promise.all(
      batch.map(async (sample) => {
        const prediction = await classifyFileRole(sample.path, sample.source);
        return {
          path: sample.path,
          expected: sample.expected,
          predicted: prediction.role,
          predictionError: prediction.error,
          correct: prediction.role === sample.expected,
        };
      }),
    );
    results.push(...classified);
  }

  const correct = results.filter((result) => result.correct).length;
  const accuracy = Number(((correct / results.length) * 100).toFixed(1));

  return {
    datasetSize: results.length,
    correct,
    accuracy,
    results,
  };
}
