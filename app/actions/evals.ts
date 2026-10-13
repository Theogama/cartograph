"use server";

import { auth } from "@clerk/nextjs/server";

import { evaluateRecentInventedPaths } from "@/lib/evals/live-invented-paths";
import { comparePromptVersions } from "@/lib/evals/prompt-versions";

async function requireEvaluationAccess(): Promise<void> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Error("Sign in and select an organization to run evaluations.");
  }
}

export async function evaluateRecentTrafficAction() {
  await requireEvaluationAccess();
  return evaluateRecentInventedPaths();
}

export async function comparePromptsAction() {
  await requireEvaluationAccess();
  return comparePromptVersions();
}
