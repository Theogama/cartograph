import "server-only";

import { createHash } from "node:crypto";

import type { RepositoryParseResult } from "@/lib/repository-parser";
import { SAMPLE_REPOSITORY_URL } from "@/lib/sample-repository";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const SAMPLE_SEED_KIND = "sample-data-seed";
const UUID_NAMESPACE = Buffer.from("00000000000000000000000000000000", "hex");
const UPSERT_BATCH_SIZE = 250;

function stableUuid(value: string): string {
  const hex = createHash("sha1")
    .update(UUID_NAMESPACE)
    .update(value)
    .digest("hex")
    .slice(0, 32);
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13)}`;
  const variant = (parseInt(versioned[16], 16) & 0x3) | 0x8;
  const variantHex = variant.toString(16);
  const formatted = `${versioned.slice(0, 16)}${variantHex}${versioned.slice(17)}`;

  return `${formatted.slice(0, 8)}-${formatted.slice(8, 12)}-${formatted.slice(12, 16)}-${formatted.slice(16, 20)}-${formatted.slice(20)}`;
}

async function throwOnError(
  result: { error: { message: string } | null },
  operation: string,
): Promise<void> {
  if (result.error) {
    throw new Error(`Unable to seed sample analysis ${operation}: ${result.error.message}`);
  }
}

export async function seedSampleAnalysis(
  supabase: SupabaseServerClient,
  organizationId: string,
  organizationName: string,
  parseResult: RepositoryParseResult,
): Promise<void> {
  const projectId = stableUuid(`${organizationId}:sample-project`);
  const analysisId = stableUuid(`${organizationId}:sample-analysis`);
  const seedId = stableUuid(`${organizationId}:${analysisId}:${SAMPLE_SEED_KIND}`);
  const seedVersion = `${SAMPLE_REPOSITORY_URL}:${parseResult.generatedAt}`;

  const { data: existingSeed, error: seedLookupError } = await supabase
    .from("insights")
    .select("content")
    .eq("id", seedId)
    .maybeSingle();

  if (seedLookupError) {
    throw new Error(`Unable to check sample analysis seed: ${seedLookupError.message}`);
  }

  if (existingSeed?.content === seedVersion) {
    return;
  }

  await throwOnError(
    await supabase
      .from("organizations")
      .upsert(
        { id: organizationId, name: organizationName },
        { onConflict: "id", ignoreDuplicates: true },
      ),
    "organization",
  );

  await throwOnError(
    await supabase.from("analyses").delete().eq("id", analysisId),
    "previous analysis data",
  );

  await throwOnError(
    await supabase
      .from("projects")
      .upsert(
        {
          id: projectId,
          organization_id: organizationId,
          repository_url: SAMPLE_REPOSITORY_URL,
        },
        { onConflict: "id" },
      ),
    "project",
  );

  await throwOnError(
    await supabase
      .from("analyses")
      .upsert(
        {
          id: analysisId,
          organization_id: organizationId,
          project_id: projectId,
          repository_url: SAMPLE_REPOSITORY_URL,
          status: "completed",
        },
        { onConflict: "id" },
      ),
    "analysis",
  );

  const fileIds = new Map(
    parseResult.files.map((file) => [
      file.path,
      stableUuid(`${organizationId}:${analysisId}:file:${file.path}`),
    ]),
  );

  const fileRows = parseResult.files.map((file) => ({
    id: stableUuid(`${organizationId}:${analysisId}:file:${file.path}`),
    organization_id: organizationId,
    analysis_id: analysisId,
    path: file.path,
  }));

  for (let start = 0; start < fileRows.length; start += UPSERT_BATCH_SIZE) {
    await throwOnError(
      await supabase
        .from("files")
        .upsert(fileRows.slice(start, start + UPSERT_BATCH_SIZE), {
          onConflict: "id",
        }),
      "files",
    );
  }

  const insideEdges = parseResult.edges.filter((edge) => edge.status === "inside");
  const resolvedEdges: {
    edge: (typeof insideEdges)[number];
    sourceFileId: string;
    targetFileId: string;
  }[] = [];

  for (const edge of insideEdges) {
    const sourceFileId = fileIds.get(edge.source);
    const targetFileId = edge.target ? fileIds.get(edge.target) : undefined;

    if (sourceFileId && targetFileId) {
      resolvedEdges.push({ edge, sourceFileId, targetFileId });
    }
  }

  if (resolvedEdges.length !== insideEdges.length) {
    console.info(
      `[sample-analysis-seed] Skipped ${
        insideEdges.length - resolvedEdges.length
      } resolved imports without parser file records.`,
    );
  }

  const edgeRows = resolvedEdges.map(({ edge, sourceFileId, targetFileId }) => ({
    id: stableUuid(
      `${organizationId}:${analysisId}:edge:${edge.source}:${edge.line}:${edge.column}:${edge.specifier}`,
    ),
    organization_id: organizationId,
    analysis_id: analysisId,
    source_file_id: sourceFileId,
    target_file_id: targetFileId,
    specifier: edge.specifier,
    kind: edge.kind,
  }));

  for (let start = 0; start < edgeRows.length; start += UPSERT_BATCH_SIZE) {
    await throwOnError(
      await supabase
        .from("edges")
        .upsert(edgeRows.slice(start, start + UPSERT_BATCH_SIZE), {
          onConflict: "id",
        }),
      "edges",
    );
  }

  await throwOnError(
    await supabase.from("insights").upsert(
      {
        id: seedId,
        organization_id: organizationId,
        analysis_id: analysisId,
        kind: SAMPLE_SEED_KIND,
        content: seedVersion,
      },
      { onConflict: "id" },
    ),
    "seed marker",
  );
}
