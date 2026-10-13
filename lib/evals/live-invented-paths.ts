import { evaluateInventedPaths } from "@/lib/evals/invented-paths";
import { loadRecentExplanationTraces } from "@/lib/evals/langsmith-traces";

export interface LiveInventedPathResult {
  traceCount: number;
  totalChecked: number;
  score: number | null;
  invented: Array<{ traceId: string; target: string; path: string }>;
}

export async function evaluateRecentInventedPaths(): Promise<LiveInventedPathResult> {
  const traces = await loadRecentExplanationTraces();
  let totalChecked = 0;
  let validPathMentions = 0;
  const invented: LiveInventedPathResult["invented"] = [];

  for (const trace of traces) {
    const result = evaluateInventedPaths(trace.explanation, trace.allowedPaths);
    totalChecked += result.totalChecked;
    validPathMentions += result.totalChecked - result.inventedCount;
    invented.push(
      ...result.invented.map((path) => ({
        traceId: trace.traceId,
        target: trace.target.type === "file" ? trace.target.path : trace.target.folder,
        path,
      })),
    );
  }

  return {
    traceCount: traces.length,
    totalChecked,
    score: totalChecked === 0
      ? null
      : Number(((validPathMentions / totalChecked) * 100).toFixed(1)),
    invented,
  };
}
