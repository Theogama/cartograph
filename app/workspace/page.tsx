import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import {
  prepareRepositoryAnalysis,
  runPreparedRepositoryAnalysis,
} from "@/lib/run-repository-analysis";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

async function WorkspaceContent({ repositoryUrl }: { repositoryUrl?: string | null }) {
  const { userId, orgId, orgSlug } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (repositoryUrl) {
    const prepared = await prepareRepositoryAnalysis(repositoryUrl);
    if (prepared.shouldRun) {
      after(async () => {
        await runPreparedRepositoryAnalysis(prepared);
      });
    }
    redirect(`/analysis/${prepared.analysisId}`);
  }

  if (!orgId) {
    return (
      <AppShell
        analyses={[]}
        organizationId={null}
        organizationSlug={null}
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select(
      "id, repository_url, status, stage, stage_message, failed_stage, error_message, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Unable to load workspace analyses: ${error.message}`);
  }

  return (
    <AppShell
      analyses={analyses}
      organizationId={orgId}
      organizationSlug={orgSlug ?? null}
    />
  );
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{ repositoryUrl?: string | string[] | undefined }> | { repositoryUrl?: string | string[] | undefined };
}) {
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams
      ? await searchParams
      : searchParams;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-foreground/60">
          Loading workspace…
        </div>
      }
    >
      <WorkspaceContent
        repositoryUrl={
          resolvedSearchParams && typeof resolvedSearchParams === "object"
            ? Array.isArray(resolvedSearchParams.repositoryUrl)
              ? resolvedSearchParams.repositoryUrl[0]
              : resolvedSearchParams.repositoryUrl
            : undefined
        }
      />
    </Suspense>
  );
}
