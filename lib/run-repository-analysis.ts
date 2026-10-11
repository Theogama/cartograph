import "server-only";

import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";

import {
  fetchPublicGitHubArchive,
  normalizePublicGitHubRepositoryUrl,
} from "@/lib/github-archive";
import {
  parseRepository,
  type RepositoryParseResult,
} from "@/lib/repository-parser";
import { packageFrameworkAdapter } from "@/lib/package-framework-adapter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

type AnalysisStage = "fetching" | "selecting" | "parsing" | "storing" | "complete" | "failed";

const INSERT_BATCH_SIZE = 250;

function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }

  if (typeof value === "object") {
    const object: { [key: string]: Json | undefined } = {};
    for (const [key, property] of Object.entries(value)) {
      if (property !== undefined) {
        object[key] = toJson(property);
      }
    }
    return object;
  }

  throw new Error("The parser returned a value that cannot be stored as JSON.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateStage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  analysisId: string,
  stage: AnalysisStage,
  stageMessage: string,
  commitSha?: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("analyses")
    .update({
      status: stage === "complete" ? "completed" : "running",
      stage,
      stage_message: stageMessage,
      updated_at: new Date().toISOString(),
      ...(commitSha ? { commit_sha: commitSha } : {}),
    })
    .eq("id", analysisId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to update analysis stage to ${stage}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Unable to update analysis stage to ${stage}: analysis row not found.`);
  }
}

async function insertBatches<Row>(
  rows: Row[],
  insert: (batch: Row[]) => PromiseLike<{ error: { message: string } | null }>,
  description: string,
): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const { error } = await insert(rows.slice(start, start + INSERT_BATCH_SIZE));
    if (error) {
      throw new Error(`Unable to store ${description}: ${error.message}`);
    }
  }
}

async function storeParseResult(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  analysisId: string,
  result: RepositoryParseResult,
): Promise<void> {
  const fileIds = new Map<string, string>();
  const fileRows = result.files.map((file) => {
    const id = randomUUID();
    fileIds.set(file.path, id);

    return {
      id,
      organization_id: organizationId,
      analysis_id: analysisId,
      path: file.path,
      module: file.module,
      folder: file.folder,
      kind: file.kind,
      lines: file.lines,
      size: file.size,
      hash: file.hash,
      fan_in: file.fanIn,
      fan_out: file.fanOut,
    };
  });

  await insertBatches(
    fileRows,
    (batch) => supabase.from("files").insert(batch),
    "parsed files",
  );

  const edgeRows = result.edges.map((edge) => {
    const sourceFileId = fileIds.get(edge.source);
    if (!sourceFileId) {
      throw new Error(`Parser returned an import with an unknown source file: ${edge.source}`);
    }

    const targetFileId =
      edge.status === "inside" && edge.target ? fileIds.get(edge.target) : null;
    if (edge.status === "inside" && edge.target && !targetFileId) {
      throw new Error(`Parser returned an import with an unknown target file: ${edge.target}`);
    }

    return {
      organization_id: organizationId,
      analysis_id: analysisId,
      source_file_id: sourceFileId,
      target_file_id: targetFileId,
      target_path: edge.target,
      specifier: edge.specifier,
      kind: edge.kind,
      status: edge.status,
      reason: edge.reason ?? null,
      line: edge.line,
      column_number: edge.column,
    };
  });

  await insertBatches(
    edgeRows,
    (batch) => supabase.from("edges").insert(batch),
    "parsed imports",
  );

  const skippedRows = result.skippedFiles.map((file) => ({
    organization_id: organizationId,
    analysis_id: analysisId,
    path: file.path,
    reason: file.reason,
  }));
  await insertBatches(
    skippedRows,
    (batch) => supabase.from("skipped_files").insert(batch),
    "skipped-file details",
  );

  const { data, error } = await supabase
    .from("analyses")
    .update({
      framework: result.framework,
      summary: toJson(result.summary),
      coverage: toJson(result.coverage),
    })
    .eq("id", analysisId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to store repository coverage: ${error.message}`);
  }
  if (!data) {
    throw new Error("Unable to store repository coverage: analysis row not found.");
  }
}

async function findAnalysis(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  repositoryUrl: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from("analyses")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("repository_url", repositoryUrl)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to check for an existing repository analysis: ${error.message}`);
  }

  return data;
}

export interface PreparedRepositoryAnalysis {
  analysisId: string;
  organizationId: string;
  repositoryUrl: string;
  reused: boolean;
  shouldRun: boolean;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

export async function prepareRepositoryAnalysis(
  repositoryUrlInput: string,
): Promise<PreparedRepositoryAnalysis> {
  const repositoryUrl = normalizePublicGitHubRepositoryUrl(repositoryUrlInput);
  const { orgId, orgSlug } = await auth();
  if (!orgId) {
    throw new Error("A signed-in organization is required to analyse a repository.");
  }

  const supabase = await createSupabaseServerClient();
  const { error: organizationError } = await supabase
    .from("organizations")
    .upsert(
      { id: orgId, name: orgSlug ?? orgId },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (organizationError) {
    throw new Error(`Unable to prepare the organization for analysis: ${organizationError.message}`);
  }

  const analysis = await findAnalysis(supabase, orgId, repositoryUrl);
  if (analysis) {
    return {
      analysisId: analysis.id,
      organizationId: orgId,
      repositoryUrl,
      reused: true,
      shouldRun: analysis.status === "pending",
      supabase,
    };
  }

  const { data: projects, error: projectLookupError } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", orgId)
    .eq("repository_url", repositoryUrl)
    .order("created_at", { ascending: true })
    .limit(1);
  if (projectLookupError) {
    throw new Error(`Unable to find the repository project: ${projectLookupError.message}`);
  }

  let projectId = projects[0]?.id;
  if (!projectId) {
    const { data: project, error } = await supabase
      .from("projects")
      .insert({ organization_id: orgId, repository_url: repositoryUrl })
      .select("id")
      .single();
    if (error) {
      throw new Error(`Unable to create the repository project: ${error.message}`);
    }
    projectId = project.id;
  }

  const analysisId = randomUUID();
  const { data: createdAnalysis, error } = await supabase
    .from("analyses")
    .insert({
      id: analysisId,
      organization_id: orgId,
      project_id: projectId,
      repository_url: repositoryUrl,
      status: "pending",
      stage_message: "Waiting for repository analysis to start.",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const existing = await findAnalysis(supabase, orgId, repositoryUrl);
    if (existing) {
      return {
        analysisId: existing.id,
        organizationId: orgId,
        repositoryUrl,
        reused: true,
        shouldRun: existing.status === "pending",
        supabase,
      };
    }
  }
  if (error) {
    throw new Error(`Unable to create the repository analysis: ${error.message}`);
  }
  if (createdAnalysis.id !== analysisId) {
    throw new Error("The repository analysis was stored with an unexpected identifier.");
  }

  return {
    analysisId,
    organizationId: orgId,
    repositoryUrl,
    reused: false,
    shouldRun: true,
    supabase,
  };
}

export async function runPreparedRepositoryAnalysis(
  prepared: PreparedRepositoryAnalysis,
): Promise<void> {
  const { analysisId, organizationId, repositoryUrl, shouldRun, supabase } = prepared;
  if (!shouldRun) {
    return;
  }

  let stage: AnalysisStage = "fetching";

  try {
    const { data: claimed, error } = await supabase
      .from("analyses")
      .update({
        status: "running",
        stage: "fetching",
        stage_message: "Fetching the repository's current public archive.",
        failed_stage: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysisId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) {
      throw new Error(`Unable to start the repository analysis: ${error.message}`);
    }
    if (!claimed) {
      return;
    }

    const archive = await fetchPublicGitHubArchive(repositoryUrl, async (commitSha) => {
      stage = "selecting";
      await updateStage(
        supabase,
        analysisId,
        stage,
        "Selecting the repository source tree.",
        commitSha,
      );
    });

    let parseResult: RepositoryParseResult;
    stage = "parsing";
    try {
      await updateStage(supabase, analysisId, stage, "Parsing TypeScript and JavaScript files and imports.");
      parseResult = await parseRepository(archive.rootPath, packageFrameworkAdapter);
    } finally {
      await archive.cleanup();
    }

    stage = "storing";
    await updateStage(supabase, analysisId, stage, "Storing parsed files, imports, and coverage.");
    await storeParseResult(supabase, organizationId, analysisId, parseResult);
    await updateStage(
      supabase,
      analysisId,
      "complete",
      `Stored ${parseResult.summary.filesParsed} files and ${parseResult.summary.importsSeen} imports.`,
    );
  } catch (error) {
    const reason = errorMessage(error);
    const { data: failedRow, error: failureUpdateError } = await supabase
      .from("analyses")
      .update({
        status: "failed",
        stage: "failed",
        stage_message: `Failed during ${stage}: ${reason}`,
        failed_stage: stage,
        error_message: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysisId)
      .select("id")
      .maybeSingle();

    if (failureUpdateError) {
      throw new Error(
        `Analysis failed during ${stage}: ${reason}. The failed state could not be stored: ${failureUpdateError.message}`,
        { cause: error },
      );
    }
    if (!failedRow) {
      throw new Error(
        `Analysis failed during ${stage}: ${reason}. The failed state could not be stored because the analysis row was not found.`,
        { cause: error },
      );
    }
    throw new Error(`Analysis failed during ${stage}: ${reason}`, { cause: error });
  }
}
