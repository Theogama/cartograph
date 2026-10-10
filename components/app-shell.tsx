import { InviteMembersButton, OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { ThemeToggle } from "@/components/theme-toggle";

type AnalysisSummary = {
  id: string;
  repository_url: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
};

export function AppShell({
  analyses,
  organizationId,
  organizationSlug,
}: {
  analyses: AnalysisSummary[];
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

        {analyses.length === 0 ? (
          <section className="rounded-lg border border-border bg-panel px-5 py-8">
            <h2 className="text-sm font-medium">No analyses yet</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Analyses for this organization will appear here.
            </p>
          </section>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-panel">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[11px] uppercase tracking-wide text-foreground/60">
                  <th className="px-4 py-3 font-medium">Repository</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((analysis) => (
                  <tr key={analysis.id} className="border-b border-border last:border-0">
                    <td className="max-w-xl truncate px-4 py-3 font-mono text-xs">
                      {analysis.repository_url}
                    </td>
                    <td className="px-4 py-3">{analysis.status}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground/60">
                      <time dateTime={analysis.created_at}>
                        {new Date(analysis.created_at).toLocaleString()}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
