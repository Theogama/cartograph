import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
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
