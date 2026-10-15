import { Client } from "langsmith";

import type { ExplanationContextFile, ExplanationTarget } from "@/lib/ai/explanation-prompt";

export interface ExplanationTraceSample {
  traceId: string;
  startedAt: string | null;
  target: ExplanationTarget;
  context: ExplanationContextFile[];
  allowedPaths: string[];
  explanation: string;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function parseTarget(value: unknown): ExplanationTarget | null {
  const target = objectValue(value);
  if (target?.type === "file" && typeof target.path === "string") {
    return { type: "file", path: target.path };
  }
  if (target?.type === "folder" && typeof target.folder === "string") {
    return { type: "folder", folder: target.folder };
  }
  return null;
}

function parseContext(value: unknown): ExplanationContextFile[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const context: ExplanationContextFile[] = [];
  for (const item of value) {
    const record = objectValue(item);
    if (typeof record?.path !== "string" || typeof record.text !== "string") {
      return null;
    }
    context.push({ path: record.path, text: record.text });
  }
  return context;
}

function parseExplanation(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  const output = objectValue(value);
  if (typeof output?.text === "string") {
    return output.text;
  }

  if (output?.output !== undefined) {
    const nestedOutput = parseExplanation(output.output);
    if (nestedOutput !== null) {
      return nestedOutput;
    }
  }
  if (output?.outputs !== undefined) {
    return parseExplanation(output.outputs);
  }
  return null;
}

export async function loadRecentExplanationTraces(
  limit: number = 50,
  days: number = 7,
): Promise<ExplanationTraceSample[]> {
  const apiKey = process.env.LANGSMITH_API_KEY;
  const projectId = process.env.LANGSMITH_PROJECT_ID;
  const projectName = process.env.LANGSMITH_PROJECT;
  if (!apiKey) {
    throw new Error("Set LANGSMITH_API_KEY to evaluate real explanation traffic.");
  }
  const projectScope = projectId
    ? { projectId }
    : projectName
      ? { projectName }
      : null;
  if (!projectScope) {
    throw new Error(
      "Set LANGSMITH_PROJECT_ID or LANGSMITH_PROJECT to the project containing Cartograph explanation traces.",
    );
  }

  const client = new Client({
    apiKey,
    ...(process.env.LANGSMITH_ENDPOINT ? { apiUrl: process.env.LANGSMITH_ENDPOINT } : {}),
    ...(process.env.LANGSMITH_WORKSPACE_ID
      ? { workspaceId: process.env.LANGSMITH_WORKSPACE_ID }
      : {}),
  });
  const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const samples: ExplanationTraceSample[] = [];

  for await (const run of client.listRuns({
    ...projectScope,
    isRoot: true,
    filter: 'eq(name, "cartograph.explain")',
    startTime,
    order: "desc",
    limit,
  })) {
    const target = parseTarget(run.inputs.target);
    const context = parseContext(run.inputs.context);
    const allowedPaths = run.inputs.allowedPaths;
    const explanation = parseExplanation(run.outputs);

    if (
      !target ||
      !context ||
      !Array.isArray(allowedPaths) ||
      !allowedPaths.every((path): path is string => typeof path === "string") ||
      explanation === null
    ) {
      continue;
    }

    samples.push({
      traceId: run.id,
      startedAt: run.start_time ? new Date(run.start_time).toISOString() : null,
      target,
      context,
      allowedPaths,
      explanation,
    });
  }

  return samples;
}
