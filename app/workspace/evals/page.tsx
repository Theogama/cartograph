import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { EvaluationDashboard } from "@/components/eval-dashboard";

export const instant = false;

export default async function WorkspaceEvalDashboardPage() {
  const { userId, orgId, orgSlug } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <AppShell analyses={[]} organizationId={orgId ?? null} organizationSlug={orgSlug ?? null}>
      <EvaluationDashboard />
    </AppShell>
  );
}
