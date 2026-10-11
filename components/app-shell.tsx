import { InviteMembersButton, OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { LiveAnalysisTable } from "@/components/live-analysis-table";
import { RepositoryAnalysisForm } from "@/components/repository-analysis-form";
import { ThemeToggle } from "@/components/theme-toggle";
import type { AnalysisProgressSnapshot } from "@/lib/analysis-progress";

export function AppShell({
  analyses,
  organizationId,
  organizationSlug,
}: {
  analyses: AnalysisProgressSnapshot[];
  organizationId: string | null;
  organizationSlug: string | null;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-panel/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
              Cartograph
            </p>
            <p className="mt-1 font-mono text-xs text-foreground/60">
              {organizationSlug ?? organizationId ?? "No organization selected"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <OrganizationSwitcher />
            <InviteMembersButton />
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">
              Workspace
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              Repository analyses
            </h1>
          </div>
          <p className="font-mono text-xs text-foreground/60">
            {analyses.length} {analyses.length === 1 ? "analysis" : "analyses"}
          </p>
        </section>

        {organizationId ? (
          <section className="rounded-lg border border-border bg-panel p-4">
            <h2 className="mb-3 text-sm font-medium">Analyse a public repository</h2>
            <RepositoryAnalysisForm />
          </section>
        ) : null}

        <LiveAnalysisTable initialAnalyses={analyses} />
      </main>
    </div>
  );
}
