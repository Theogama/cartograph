import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";

async function WorkspaceContent() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  let currentOrganization = null;

  if (orgId) {
    const client = await clerkClient();
    const organization = await client.organizations.getOrganization({
      organizationId: orgId,
    });

    currentOrganization = {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    };
  }

  return <AppShell currentOrganization={currentOrganization} />;
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading workspace…</div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
