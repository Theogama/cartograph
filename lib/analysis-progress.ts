export type AnalysisStage =
  | "fetching"
  | "selecting"
  | "parsing"
  | "storing"
  | "complete"
  | "failed";

export type AnalysisStatus = "pending" | "running" | "completed" | "failed";

export interface AnalysisProgressSnapshot {
  id: string;
  repository_url: string;
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  stage_message: string | null;
  failed_stage: Exclude<AnalysisStage, "complete" | "failed"> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisStageBroadcast {
  stage: AnalysisStage | null;
  message: string | null;
}

export const ANALYSIS_STALE_AFTER_MS = 3 * 60 * 1000;

const ANALYSIS_STAGES: readonly AnalysisStage[] = [
  "fetching",
  "selecting",
  "parsing",
  "storing",
  "complete",
  "failed",
];

function isAnalysisStage(value: unknown): value is AnalysisStage {
  return typeof value === "string" && ANALYSIS_STAGES.some((stage) => stage === value);
}

export function isAnalysisStageBroadcast(value: unknown): value is AnalysisStageBroadcast {
  if (typeof value !== "object" || value === null || !("payload" in value)) {
    return false;
  }

  const payload: unknown = value.payload;
  if (typeof payload !== "object" || payload === null || !("stage" in payload) || !("message" in payload)) {
    return false;
  }

  const { stage, message } = payload;
  return (
    (stage === null || isAnalysisStage(stage)) &&
    (message === null || typeof message === "string")
  );
}

export function isAnalysisStale(updatedAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) && now - timestamp > ANALYSIS_STALE_AFTER_MS;
}

export function getAnalysisStageLabel(analysis: AnalysisProgressSnapshot): string {
  if (analysis.status === "failed" || analysis.stage === "failed") {
    return "failed";
  }
  if (analysis.status === "completed" || analysis.stage === "complete") {
    return "complete";
  }
  if (analysis.status === "pending" && !analysis.stage) {
    return "queued";
  }
  return analysis.stage ?? "starting";
}
