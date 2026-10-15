import { NextResponse } from "next/server";

import { loadAnalysisGraph } from "@/lib/agent/analysis-graph";
import { verifyAnalysisCredential } from "@/lib/agent/analysis-credential";
import { runRepositoryAgentQuestion } from "@/lib/agent/repository-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ analysisId: string }> },
): Promise<Response> {
  const { analysisId: routeAnalysisId } = await context.params;
  const authHeader = request.headers.get("authorization") ?? "";
  const payload = (await request.json()) as {
    question?: string;
    previousQuestion?: string | null;
    previousTarget?: string | null;
    credential?: string;
  };
  const providedCredential = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : payload.credential ?? "";

  if (!providedCredential) {
    return NextResponse.json({ error: "Signed credential required." }, { status: 401 });
  }

  let token;
  try {
    token = verifyAnalysisCredential(providedCredential);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analysis credential.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (token.analysisId !== routeAnalysisId) {
    return NextResponse.json({ error: "Credential does not match this analysis." }, { status: 403 });
  }

  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Ask a repository question." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, organization_id, repository_url")
    .eq("id", routeAnalysisId)
    .eq("organization_id", token.organizationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Unable to load this analysis: ${error.message}` }, { status: 500 });
  }
  if (!analysis) {
    return NextResponse.json({ error: "This analysis was not found for the credential's organization." }, { status: 404 });
  }

  const graph = await loadAnalysisGraph(routeAnalysisId, token.organizationId);
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
    repositoryUrl: analysis.repository_url,
  });
}
