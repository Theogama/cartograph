import { auth } from "@clerk/nextjs/server";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

import { runRepositoryAgentQuestion } from "@/lib/agent/repository-agent";
import type {
  FileRecord,
  FileRoleRecord,
  ImportRecord,
  RouteRecord,
} from "@/lib/repository-parser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TOKEN_TTL_MS = 5 * 60 * 1000;

function createAnalysisCredential(analysisId: string, organizationId: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.CLERK_SECRET_KEY ?? "cartograph-local-agent-secret";
  const payload = {
    analysisId,
    organizationId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function toFileRecord(row: {
  path: string;
  module: string | null;
  folder: string | null;
  kind: FileRecord["kind"] | null;
  lines: number | null;
  size: number | null;
  hash: string | null;
  fan_in: number | null;
  fan_out: number | null;
}): FileRecord {
  if (
    row.module === null ||
    row.folder === null ||
    row.kind === null ||
    row.lines === null ||
    row.size === null ||
    row.hash === null ||
    row.fan_in === null ||
    row.fan_out === null
  ) {
    throw new Error(`Stored metadata for ${row.path} is incomplete.`);
  }

  return {
    path: row.path,
    module: row.module,
    folder: row.folder,
    kind: row.kind,
    lines: row.lines,
    size: row.size,
    hash: row.hash,
    fanIn: row.fan_in,
    fanOut: row.fan_out,
  };
}

async function loadAnalysisGraph(analysisId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [filesResult, edgesResult, routesResult, fileRolesResult] = await Promise.all([
    supabase
      .from("files")
      .select("id, path, module, folder, kind, lines, size, hash, fan_in, fan_out")
      .eq("analysis_id", analysisId)
      .eq("organization_id", organizationId)
      .order("path"),
    supabase
      .from("edges")
      .select("source_file_id, target_file_id, target_path, specifier, kind, status, reason, line, column_number")
      .eq("analysis_id", analysisId)
      .eq("organization_id", organizationId)
      .order("source_file_id"),
    supabase
      .from("routes")
      .select("file_id, method, path")
      .eq("analysis_id", analysisId)
      .eq("organization_id", organizationId)
      .order("path"),
    supabase
      .from("file_roles")
      .select("file_id, role, source")
      .eq("analysis_id", analysisId)
      .eq("organization_id", organizationId)
      .order("role"),
  ]);

  if (filesResult.error) {
    throw new Error(`Unable to load files: ${filesResult.error.message}`);
  }
  if (edgesResult.error) {
    throw new Error(`Unable to load edges: ${edgesResult.error.message}`);
  }
  if (routesResult.error) {
    throw new Error(`Unable to load routes: ${routesResult.error.message}`);
  }
  if (fileRolesResult.error) {
    throw new Error(`Unable to load file roles: ${fileRolesResult.error.message}`);
  }

  const fileRows = filesResult.data ?? [];
  const routeRows = routesResult.data ?? [];
  const fileRoleRows = fileRolesResult.data ?? [];
  const fileById = new Map(fileRows.map((file) => [file.id, file]));

  const files: FileRecord[] = fileRows.map((file) => toFileRecord(file));
  const routes: RouteRecord[] = routeRows.map((route) => {
    const file = fileById.get(route.file_id);
    return {
      filePath: file?.path ?? route.file_id,
      method: route.method,
      path: route.path,
    };
  });
  const fileRoles: FileRoleRecord[] = fileRoleRows.map((record) => {
    const file = fileById.get(record.file_id);
    return {
      path: file?.path ?? record.file_id,
      role: record.role,
      source: record.source as FileRoleRecord["source"],
    };
  });

  const imports: ImportRecord[] = (edgesResult.data ?? []).map((edge) => {
    const source = fileById.get(edge.source_file_id)?.path ?? "unknown";
    let target: string | null = edge.target_path ?? null;
    if (edge.status === "inside" && edge.target_file_id) {
      target = fileById.get(edge.target_file_id)?.path ?? null;
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

  return { files, imports, routes, fileRoles };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ analysisId: string }> },
): Promise<Response> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Signed in access required." }, { status: 401 });
  }

  const { analysisId } = await context.params;
  const payload = (await request.json()) as { question?: string; previousQuestion?: string | null; previousTarget?: string | null };
  const question = typeof payload.question === "string" ? payload.question.trim() : "";

  if (!question) {
    return NextResponse.json({ error: "Ask a repository question." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, organization_id, repository_url")
    .eq("id", analysisId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Unable to load this analysis: ${error.message}` }, { status: 500 });
  }
  if (!analysis) {
    return NextResponse.json({ error: "This analysis was not found for your organization." }, { status: 404 });
  }

  const graph = await loadAnalysisGraph(analysisId, orgId);
  const answer = runRepositoryAgentQuestion(
    question,
    payload.previousQuestion ?? null,
    payload.previousTarget ?? null,
    graph.files,
    graph.imports,
    graph.routes,
    graph.fileRoles,
  );

  return NextResponse.json({
    ...answer,
    credential: createAnalysisCredential(analysisId, orgId),
    repositoryUrl: analysis.repository_url,
  });
}
