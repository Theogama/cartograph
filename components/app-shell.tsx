import { InviteMembersButton, OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { ThemeToggle } from "@/components/theme-toggle";

type OrganizationSummary = {
  id: string;
  name: string;
  slug?: string | null;
};

export function AppShell({
  currentOrganization,
}: {
  currentOrganization: OrganizationSummary | null;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-panel/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">
              C
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/60">
                Cartograph
              </p>
              <p className="text-sm text-foreground/80">Workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <OrganizationSwitcher />
            <InviteMembersButton />
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="rounded-2xl border border-border bg-panel p-6 shadow-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/60">
            Current organization
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            {currentOrganization?.name ?? "No organization selected"}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-foreground/70">
            This workspace is tied to the organization claim carried by the signed-in token,
            so every later screen reads the same team context without asking Clerk again.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <article className="rounded-xl border border-border bg-panel p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
              Team
            </p>
            <p className="mt-3 text-xl font-semibold">{currentOrganization?.name ?? "Unassigned"}</p>
          </article>
          <article className="rounded-xl border border-border bg-panel p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
              Status
            </p>
            <p className="mt-3 text-xl font-semibold">Ready</p>
          </article>
          <article className="rounded-xl border border-border bg-panel p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
              Theme
            </p>
            <p className="mt-3 text-xl font-semibold">System-aware</p>
          </article>
        </section>
      </main>
    </div>
  );
}
