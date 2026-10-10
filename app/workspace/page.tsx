import { readFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import type { RepositoryParseResult } from "@/lib/repository-parser";
import { seedSampleAnalysis } from "@/lib/seed-sample-analysis";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

async function WorkspaceContent() {
  const { userId, orgId, orgSlug } = await auth();

  if (!userId) {
    redirect("/sign-in");
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
  const parseOutputPath = path.join(process.cwd(), ".cartograph", "repo-parse-output.json");
  const parseOutput = JSON.parse(
    await readFile(parseOutputPath, "utf8"),
  ) as RepositoryParseResult;

  await seedSampleAnalysis(
    supabase,
    orgId,
    orgSlug ?? orgId,
    parseOutput,
  );

  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("id, repository_url, status, created_at")
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

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-foreground/60">
          Loading workspace…
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
