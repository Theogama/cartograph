import { traceable } from "langsmith/traceable";
import { createHash } from "node:crypto";

import {
  buildExplanationPrompt,
  EXPLANATION_SYSTEM_PROMPT,
} from "@/lib/ai/explanation-prompt";
import { getOpenRouterClient } from "@/lib/ai/openrouter-client";
import type { ExplanationTraceSample } from "@/lib/evals/langsmith-traces";
import { loadRecentExplanationTraces } from "@/lib/evals/langsmith-traces";

export interface PromptVersion {
  name: string;
  description: string;
  kind: "current" | "phase-10-original";
}

export const currentPromptVersion: PromptVersion = {
  name: "current",
  description: "Current production explanation prompt",
  kind: "current",
};

export const previousPromptVersion: PromptVersion = {
  name: "phase-10-original",
  description: "Original phase 10 production prompt snapshot",
  kind: "phase-10-original",
};

export const promptVersions = [currentPromptVersion, previousPromptVersion] as const;

const MAX_EXPERIMENT_SAMPLES = 5;
const PHASE_10_SYSTEM_PROMPT =
  "You explain a repository file or folder from code context. Use only the provided files. Answer in the repository's language and avoid invented connections.";
const JUDGE_MODEL = process.env.OPENROUTER_EVAL_JUDGE_MODEL
  ?? process.env.OPENROUTER_MODEL
  ?? "openai/gpt-oss-20b";
const explanationCache = new Map<string, string>();
const judgeCache = new Map<string, number>();

function buildRetiredPrompt(sample: ExplanationTraceSample): string {
  const roleInstruction = "If no framework adapter or file naming gives a confident structural role, assign a non-structural role such as service, repository, model, util, config, component, or hook. Never say page, route, or controller.";

  if (sample.target.type === "file") {
    return [
      "Explain this file in the context of its actual neighbours.",
      `Target file: ${sample.target.path}`,
      `This file is immediately connected to these real neighbours: ${sample.context.map((item) => item.path).join(", ") || "none"}`,
      "Use the code of the target and the neighbours to explain what the file does, how it participates in the repository, and why it is connected to those files.",
      "Keep the answer to a short paragraph, not a long essay. Do not guess or invent imports. Name the files you rely on, and if you point to a path, it must be one that is actually in the context.",
      roleInstruction,
      "The answer should be plain prose with only inline code, bullet lists, and bold text. No headings. No markdown tables.",
      "When you mention a repository path, keep the exact relative path from the repo root and do not invent missing files.",
      "Source context:",
      ...sample.context.map((item) => `--- ${item.path} ---\n${item.text}`),
    ].join("\n\n");
  }

  return [
    "Explain this folder in the context of the repository.",
    `Folder: ${sample.target.folder}`,
    `This folder contains ${sample.context.length} relevant files and its incoming traffic points here because the repository is using it as a central dependency.`,
    "Use the files in the folder and the surrounding import relationships to explain what sits in the folder, why the project points at it, and what the folder is responsible for.",
    "Keep the answer to a short paragraph or a couple of short bullets. Do not summarize one file only.",
    roleInstruction,
    "The answer should be plain prose with only inline code, bullet lists, and bold text. No headings. No markdown tables.",
    "When you mention a repository path, keep the exact relative path from the repo root and do not invent missing files.",
    "Source context:",
    ...sample.context.map((item) => `--- ${item.path} ---\n${item.text}`),
  ].join("\n\n");
}

function parseJudgeScore(content: string | null, version: string, traceId: string): number {
  if (!content) {
    throw new Error(`Prompt judge returned no score for ${version} on trace ${traceId}.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`Prompt judge returned invalid JSON for ${version} on trace ${traceId}: ${content}`);
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("score" in value) ||
    typeof value.score !== "number" ||
    !Number.isInteger(value.score) ||
    value.score < 1 ||
    value.score > 5
  ) {
    throw new Error(`Prompt judge returned an invalid 1-5 score for ${version} on trace ${traceId}: ${content}`);
  }

  return value.score;
}

const runVersion = traceable(
  async (input: {
    version: PromptVersion;
    samples: ExplanationTraceSample[];
  }): Promise<{ score: number; sampleScores: Array<{ traceId: string; score: number }> }> => {
    const client = getOpenRouterClient();
    const sampleScores: Array<{ traceId: string; score: number }> = [];

    for (const sample of input.samples) {
      const prompt = input.version.kind === "current"
        ? buildExplanationPrompt(sample.target, sample.context)
        : buildRetiredPrompt(sample);
      const systemPrompt = input.version.kind === "current"
        ? EXPLANATION_SYSTEM_PROMPT
        : PHASE_10_SYSTEM_PROMPT;
      const generationModel = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b";
      const explanationKey = createHash("sha256")
        .update(JSON.stringify({ model: generationModel, systemPrompt, prompt }))
        .digest("hex");
      let explanation = explanationCache.get(explanationKey);

      if (!explanation) {
        const completion = await client.chat.completions.create({
          model: generationModel,
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        });
        explanation = completion.choices[0]?.message.content?.trim();
        if (explanation) {
          explanationCache.set(explanationKey, explanation);
        }
      }
      if (!explanation) {
        throw new Error(`Prompt ${input.version.name} returned no explanation for trace ${sample.traceId}.`);
      }

      const judgeInput = JSON.stringify({
        target: sample.target,
        allowedPaths: sample.allowedPaths,
        context: sample.context.map(({ path, text }) => ({ path, text })),
        explanation,
      });
      const judgeKey = createHash("sha256")
        .update(JSON.stringify({ model: JUDGE_MODEL, judgeInput }))
        .digest("hex");
      let score = judgeCache.get(judgeKey);
      if (score === undefined) {
        const judge = await client.chat.completions.create({
          model: JUDGE_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You are an evaluator comparing repository explanations. Judge usefulness and specificity based only on the target and supplied source context. Reward concrete, accurate details and relevant exact paths. Penalize vague summaries, unsupported claims, and invented paths. Return only JSON: {\"score\": integer from 1 to 5}.",
            },
            { role: "user", content: judgeInput },
          ],
        });
        score = parseJudgeScore(judge.choices[0]?.message.content, input.version.name, sample.traceId);
        judgeCache.set(judgeKey, score);
      }
      sampleScores.push({
        traceId: sample.traceId,
        score,
      });
    }

    const score = Number(
      ((sampleScores.reduce((total, item) => total + item.score, 0) / sampleScores.length) * 20).toFixed(1),
    );

    return { score, sampleScores };
  },
  {
    name: "cartograph.eval.prompt-version",
    metadata: { application: "cartograph", evaluator: "model-judge" },
  },
);

export async function comparePromptVersions(): Promise<{
  sampleCount: number;
  experiments: Array<{
    name: string;
    description: string;
    score: number;
    sampleScores: Array<{ traceId: string; score: number }>;
  }>;
  winner: { name: string; score: number };
  delta: number;
}> {
  const samples = (await loadRecentExplanationTraces())
    .filter((sample) => sample.context.length > 0)
    .slice(0, MAX_EXPERIMENT_SAMPLES);

  if (samples.length === 0) {
    throw new Error(
      "Prompt comparison needs at least one recent Cartograph explanation trace with its source context. Explain a file after deploying trace-input capture, then retry.",
    );
  }

  const [current, previous] = await Promise.all(
    promptVersions.map(async (version) => ({
      version,
      result: await runVersion({ version, samples }),
    })),
  );

  const experiments = [current, previous].map(({ version, result }) => ({
    name: version.name,
    description: version.description,
    score: result.score,
    sampleScores: result.sampleScores,
  }));
  const sorted = [...experiments].sort((left, right) => right.score - left.score);
  const winner = { name: sorted[0].name, score: sorted[0].score };
  const delta = Number((sorted[0].score - sorted[1].score).toFixed(1));

  return {
    sampleCount: samples.length,
    experiments,
    winner,
    delta,
  };
}
