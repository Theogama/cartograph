export type ExplanationTarget =
  | { type: "file"; path: string }
  | { type: "folder"; folder: string };

export interface ExplanationContextFile {
  path: string;
  text: string;
}

export const EXPLANATION_SYSTEM_PROMPT =
  "You explain a repository file or folder from code context. Use only the provided files. Answer in the repository's language and avoid invented connections.";

export function buildExplanationPrompt(
  target: ExplanationTarget,
  context: ExplanationContextFile[],
): string {
  const roleInstruction = "If no framework adapter or file naming gives a confident structural role, assign a non-structural role such as service, repository, model, util, config, component, or hook. Never say page, route, or controller.";

  if (target.type === "file") {
    return [
      `Explain this file in the context of its actual neighbours.`,
      `Target file: ${target.path}`,
      `This file is immediately connected to these real neighbours: ${context.map((item) => item.path).join(", ") || "none"}`,
      `Use the code of the target and the neighbours to explain what the file does, how it participates in the repository, and why it is connected to those files.`,
      `Keep the answer to a short paragraph, not a long essay. Do not guess or invent imports. Name the files you rely on, and if you point to a path, it must be one that is actually in the context.`,
      roleInstruction,
      "The answer should be plain prose with only inline code, bullet lists, and bold text. No headings. No markdown tables.",
      "When you mention a repository path, keep the exact relative path from the repo root and do not invent missing files.",
      "Source context:",
      ...context.map((item) => `--- ${item.path} ---\n${item.text}`),
    ].join("\n\n");
  }

  return [
    `Explain this folder in the context of the repository.`,
    `Folder: ${target.folder}`,
    `This folder contains ${context.length} relevant files and its incoming traffic points here because the repository is using it as a central dependency.`,
    `Use the files in the folder and the surrounding import relationships to explain what sits in the folder, why the project points at it, and what the folder is responsible for.`,
    `Keep the answer to a short paragraph or a couple of short bullets. Do not summarize one file only.`,
    roleInstruction,
    "The answer should be plain prose with only inline code, bullet lists, and bold text. No headings. No markdown tables.",
    "When you mention a repository path, keep the exact relative path from the repo root and do not invent missing files.",
    "Source context:",
    ...context.map((item) => `--- ${item.path} ---\n${item.text}`),
  ].join("\n\n");
}
