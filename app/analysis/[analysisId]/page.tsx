import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { AnalysisProgress } from "@/components/analysis-progress";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AnalysisProgressPage({
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
      "id, repository_url, status, stage, stage_message, failed_stage, error_message, created_at, updated_at",
    )
    .eq("id", analysisId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load analysis progress: ${error.message}`);
  }
  if (!analysis) {
    notFound();
  }
  if (analysis.status === "completed") {
    redirect(`/analysis/${analysisId}/map`);
  }

  return <AnalysisProgress initialAnalysis={analysis} />;
}
