"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";

import {
  explainSelection,
  type ExplainSelectionRequest,
  type ExplainSelectionResult,
} from "@/lib/ai/explain-selection";
import {
  prepareRepositoryAnalysis,
  runPreparedRepositoryAnalysis,
  type PreparedRepositoryAnalysis,
} from "@/lib/run-repository-analysis";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface StartAnalysisState {
  error: string | null;
}

export interface RetryAnalysisState {
  error: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function deleteAnalysisRows(
  description: string,
  operation: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await operation;
  if (error) {
    throw new Error(`Unable to clear ${description} before retry: ${error.message}`);
  }
}

export async function startRepositoryAnalysisAction(
  _previousState: StartAnalysisState,
  formData: FormData,
): Promise<StartAnalysisState> {
  const repositoryUrl = formData.get("repositoryUrl");
  if (typeof repositoryUrl !== "string" || !repositoryUrl.trim()) {
    return { error: "Enter a public GitHub repository URL." };
  }

  let prepared;
  try {
    prepared = await prepareRepositoryAnalysis(repositoryUrl);
  } catch (error) {
    return { error: getErrorMessage(error) };
  }

  if (prepared.shouldRun) {
    after(async () => {
      try {
        await runPreparedRepositoryAnalysis(prepared);
      } catch (error) {
        console.error(
          `[repository-analysis:${prepared.analysisId}] ${getErrorMessage(error)}`,
        );
      }
    });
  }

  redirect(`/analysis/${prepared.analysisId}`);
}

export async function explainSelectionAction(
  request: ExplainSelectionRequest,
): Promise<ExplainSelectionResult> {
  try {
    return await explainSelection(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      targetKey: request.target.type === "file" ? `file:${request.target.path}` : `folder:${request.target.folder}`,
      text: `Unable to explain this ${request.target.type}. ${message}`,
      stale: false,
      source: "model",
      cacheKey: "",
    };
  }
}

export async function retryRepositoryAnalysisAction(
  analysisId: string,
  _previousState: RetryAnalysisState,
  _formData: FormData,
): Promise<RetryAnalysisState> {
  void _previousState;
  void _formData;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    return { error: getErrorMessage(error) };
  }

  const { data: claimedAnalysis, error: claimError } = await supabase
    .from("analyses")
    .update({
      status: "running",
      stage: "storing",
      stage_message: "Preparing a clean run of this repository analysis.",
      failed_stage: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", analysisId)
    .in("status", ["failed", "completed"])
    .select("id, organization_id, repository_url")
    .maybeSingle();

  if (claimError) {
    return { error: `Unable to prepare analysis run: ${claimError.message}` };
  }
  if (!claimedAnalysis) {
    return { error: "This analysis is no longer eligible to run again." };
  }

  try {
    await deleteAnalysisRows(
      "stored insights",
      supabase.from("insights").delete().eq("analysis_id", analysisId),
    );
    await deleteAnalysisRows(
      "skipped-file details",
      supabase.from("skipped_files").delete().eq("analysis_id", analysisId),
    );
    await deleteAnalysisRows(
      "parsed files",
      supabase.from("files").delete().eq("analysis_id", analysisId),
    );
  } catch (error) {
    const reason = getErrorMessage(error);
    const { error: recoveryError } = await supabase
      .from("analyses")
      .update({
        status: "failed",
        stage: "failed",
        stage_message: `Unable to prepare analysis run: ${reason}`,
        failed_stage: "storing",
        error_message: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysisId)
      .eq("status", "running");

    if (recoveryError) {
      return {
        error: `Unable to prepare analysis run: ${reason}. The failed state could not be restored: ${recoveryError.message}`,
      };
    }
    return { error: `Unable to prepare analysis run: ${reason}` };
  }

  const { data: resetAnalysis, error: resetError } = await supabase
    .from("analyses")
    .update({
      status: "pending",
      stage: null,
      stage_message: "Waiting for repository analysis to start.",
      failed_stage: null,
      error_message: null,
      commit_sha: null,
      framework: null,
      summary: null,
      coverage: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", analysisId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  if (resetError || !resetAnalysis) {
    const reason = resetError?.message ?? "analysis row was not found";
    const { error: recoveryError } = await supabase
      .from("analyses")
      .update({
        status: "failed",
        stage: "failed",
        stage_message: `Unable to prepare analysis run: ${reason}`,
        failed_stage: "storing",
        error_message: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysisId)
      .eq("status", "running");

    if (recoveryError) {
      return {
        error: `Unable to prepare analysis run: ${reason}. The failed state could not be restored: ${recoveryError.message}`,
      };
    }
    return { error: `Unable to prepare analysis run: ${reason}` };
  }

  const prepared: PreparedRepositoryAnalysis = {
    analysisId: claimedAnalysis.id,
    organizationId: claimedAnalysis.organization_id,
    repositoryUrl: claimedAnalysis.repository_url,
    reused: true,
    shouldRun: true,
    supabase,
  };

  after(async () => {
    try {
      await runPreparedRepositoryAnalysis(prepared);
    } catch (error) {
      console.error(
        `[repository-analysis:${prepared.analysisId}] ${getErrorMessage(error)}`,
      );
    }
  });

  redirect(`/analysis/${analysisId}`);
}
