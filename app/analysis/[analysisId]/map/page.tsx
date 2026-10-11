import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { AnalysisDataWarning } from "@/components/analysis-data-warning";
import { AnalysisExplorer } from "@/components/analysis-explorer";
import type { FileRecord, ImportRecord } from "@/lib/repository-parser";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

const MAX_MAP_ROWS = 1000;

type StoredFileRow = Pick<
  Database["public"]["Tables"]["files"]["Row"],
  "id" | "path" | "module" | "folder" | "kind" | "lines" | "size" | "hash" | "fan_in" | "fan_out"
>;

type CompleteStoredFileRow = Omit<
  StoredFileRow,
  "module" | "folder" | "kind" | "lines" | "size" | "hash" | "fan_in" | "fan_out"
> & {
  module: string;
  folder: string;
  kind: FileRecord["kind"];
  lines: number;
  size: number;
  hash: string;
  fan_in: number;
  fan_out: number;
};

function hasCompleteFileMetadata(
  file: StoredFileRow,
): file is CompleteStoredFileRow {
  return (
    file.module !== null &&
    file.folder !== null &&
    file.kind !== null &&
    file.lines !== null &&
    file.size !== null &&
    file.hash !== null &&
    file.fan_in !== null &&
    file.fan_out !== null
  );
}

function requireCompleteRows<Row>(
  label: string,
  result: {
    data: Row[] | null;
    error: { message: string } | null;
    count: number | null;
  },
): Row[] {
  if (result.error) {
    throw new Error(`Unable to load analysis ${label}: ${result.error.message}`);
  }

  const rows = result.data ?? [];
  if (result.count === null || result.count !== rows.length) {
    throw new Error(
      `Unable to load a complete analysis ${label} set in one request (loaded ${rows.length} of ${result.count ?? "an unknown number"}). The map was not drawn from partial data.`,
    );
  }

  return rows;
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { userId, orgId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  if (!orgId) {
    notFound();
  }

  const { analysisId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select(
      "id, repository_url, status, stage, stage_message, failed_stage, error_message, created_at, updated_at, commit_sha, framework",
    )
    .eq("id", analysisId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load analysis progress: ${error.message}`);
  }
  if (!analysis) {
    notFound();
  }

  if (analysis.status !== "completed") {
    redirect(`/analysis/${analysisId}`);
  }

  const [filesResult, edgesResult, skippedResult] = await Promise.all([
      supabase
        .from("files")
        .select(
          "id, path, module, folder, kind, lines, size, hash, fan_in, fan_out",
          { count: "exact" },
        )
        .eq("analysis_id", analysisId)
        .order("path")
        .limit(MAX_MAP_ROWS),
      supabase
        .from("edges")
        .select(
          "source_file_id, target_file_id, target_path, specifier, kind, status, reason, line, column_number",
          { count: "exact" },
        )
        .eq("analysis_id", analysisId)
        .order("source_file_id")
        .limit(MAX_MAP_ROWS),
      supabase
        .from("skipped_files")
        .select("path, reason", { count: "exact" })
        .eq("analysis_id", analysisId)
        .order("path")
        .limit(MAX_MAP_ROWS),
  ]);

  const fileRows = requireCompleteRows<StoredFileRow>("files", filesResult);
  const edgeRows = requireCompleteRows("imports", edgesResult);
  const skippedFiles = requireCompleteRows("skipped files", skippedResult);

  const completeFileRows = fileRows.filter(hasCompleteFileMetadata);
  const incompleteFile = fileRows.find((file) => !hasCompleteFileMetadata(file));
  if (incompleteFile) {
    return (
      <AnalysisDataWarning
        analysisId={analysisId}
        repositoryUrl={analysis.repository_url}
        message={`Stored metadata for ${incompleteFile.path} is incomplete. Re-run this analysis to parse and store the repository with the current format.`}
      />
    );
  }

  const files: FileRecord[] = completeFileRows.map((file) => ({
    path: file.path,
    module: file.module,
    folder: file.folder,
    kind: file.kind,
    lines: file.lines,
    size: file.size,
    hash: file.hash,
    fanIn: file.fan_in,
    fanOut: file.fan_out,
  }));
  const filePathsById = new Map(fileRows.map((file) => [file.id, file.path]));
  const imports: ImportRecord[] = edgeRows.map((edge) => {
    const source = filePathsById.get(edge.source_file_id);
    if (!source) {
      throw new Error(
        `Unable to load analysis imports: source file ${edge.source_file_id} is missing.`,
      );
    }

    let target = edge.target_path;
    if (edge.status === "inside") {
      if (!edge.target_file_id) {
        throw new Error(
          `Unable to load analysis imports: resolved import "${edge.specifier}" has no target file.`,
        );
      }
      target = filePathsById.get(edge.target_file_id) ?? null;
      if (!target) {
        throw new Error(
          `Unable to load analysis imports: target file ${edge.target_file_id} is missing.`,
        );
      }
    }

    return {
      source,
      target,
      specifier: edge.specifier,
      kind: edge.kind,
      status: edge.status,
      ...(edge.reason ? { reason: edge.reason } : {}),
      line: edge.line,
      column: edge.column_number,
    };
  });

  return (
    <AnalysisExplorer
      analysisId={analysis.id}
      repositoryUrl={analysis.repository_url}
      commitSha={analysis.commit_sha}
      framework={analysis.framework}
      files={files}
      imports={imports}
      skippedFiles={skippedFiles}
    />
  );
}
