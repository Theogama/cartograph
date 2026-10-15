import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mintAnalysisCredential } from "@/lib/agent/analysis-credential";
import { loadAnalysisGraph } from "@/lib/agent/analysis-graph";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Signed in access required." }, { status: 401 });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid JSON request." }, { status: 400 });
  }
  if (typeof requestBody !== "object" || requestBody === null || Array.isArray(requestBody)) {
    return NextResponse.json({ error: "Provide a valid JSON request." }, { status: 400 });
  }
  const analysisId = "analysisId" in requestBody && typeof requestBody.analysisId === "string"
    ? requestBody.analysisId
    : "";
  const question = "question" in requestBody && typeof requestBody.question === "string"
    ? requestBody.question.trim()
    : "";

  if (!analysisId || !question || question.length > 4000) {
    return NextResponse.json({ error: "Provide an analysisId and a repository question." }, { status: 400 });
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

  let graph: Awaited<ReturnType<typeof loadAnalysisGraph>>;
  try {
    graph = await loadAnalysisGraph(analysisId, orgId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the repository graph.";
    console.error("Unable to load the repository graph for an agent question.", error);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }

  const agentUrl = process.env.DEEP_AGENT_URL ?? "http://127.0.0.1:4318/ask";
  let agentResponse: Response;
  try {
    agentResponse = await fetch(agentUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        credential: mintAnalysisCredential(analysisId, orgId),
        question,
        previousQuestion:
          "previousQuestion" in requestBody && typeof requestBody.previousQuestion === "string"
            ? requestBody.previousQuestion
            : null,
        previousTarget:
          "previousTarget" in requestBody && typeof requestBody.previousTarget === "string"
            ? requestBody.previousTarget
            : null,
        graph,
      }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    console.error("Unable to reach the Deep Agent service.", error);
    return NextResponse.json(
      { error: "Deep Agent is unavailable. Start it with `pnpm --dir deep-agent start`." },
      { status: 503 },
    );
  }

  if (!agentResponse.ok) {
    const responseText = await agentResponse.text();
    let errorMessage = `Deep Agent returned HTTP ${agentResponse.status}.`;
    try {
      const responseData: unknown = JSON.parse(responseText);
      if (
        typeof responseData === "object" &&
        responseData !== null &&
        "error" in responseData &&
        typeof responseData.error === "string"
      ) {
        errorMessage = responseData.error;
      }
    } catch {
      console.error("Deep Agent service returned an invalid error response.", {
        status: agentResponse.status,
      });
    }
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  if (!agentResponse.body || !agentResponse.headers.get("content-type")?.includes("text/event-stream")) {
    console.error("Deep Agent service did not return a streaming response.", {
      status: agentResponse.status,
    });
    return NextResponse.json({ error: "Deep Agent returned an invalid response." }, { status: 502 });
  }

  return new Response(agentResponse.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
