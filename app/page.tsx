import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LandingHeroForm } from "@/components/landing-hero-form";
import { ThemeToggle } from "@/components/theme-toggle";

function LandingFigure() {
  return (
    <div className="landing-figure overflow-hidden rounded-[30px] border border-[#24262d] bg-[#09090b] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)]">
      <div className="overflow-hidden rounded-[20px] border border-[#1d1e23] bg-[#09090b] p-2">
        <svg
          viewBox="0 0 600 400"
          className="h-full w-full"
          role="img"
          aria-label="Repository dependency map illustration"
        >
          <g className="graph-links" fill="none" strokeLinecap="round">
            <path className="graph-link-muted" d="M154 175 C193 175 180 229 215 229" />
            <path className="graph-link-muted" d="M154 350 C192 350 180 282 215 282" />
            <path className="graph-link-muted" d="M347 238 C390 238 372 301 408 301" />
            <path className="graph-link-muted" d="M347 282 C381 282 379 365 408 365" />
            <path className="graph-link-green" d="M154 112 C194 112 184 164 215 164" />
            <path className="graph-link-green" d="M154 258 C190 258 181 218 215 218" />
            <path className="graph-link-amber" d="M347 164 C382 164 374 120 408 120" />
            <path className="graph-link-amber" d="M347 187 C381 187 378 215 408 215" />
          </g>

          <g className="graph-card graph-card-muted">
            <rect className="graph-surface" x="30" y="157" width="124" height="36" rx="5" />
            <rect x="38" y="167" width="52" height="4" rx="2" className="graph-card-line" />
            <rect x="38" y="176" width="38" height="4" rx="2" className="graph-card-line-short" />
            <rect className="graph-surface" x="215" y="246" width="132" height="48" rx="5" />
            <rect x="224" y="258" width="48" height="4" rx="2" className="graph-card-line" />
            <rect x="224" y="269" width="84" height="4" rx="2" className="graph-card-line-short" />
            <rect className="graph-surface" x="408" y="345" width="128" height="40" rx="5" />
            <rect x="417" y="357" width="52" height="4" rx="2" className="graph-card-line" />
            <rect x="417" y="368" width="37" height="4" rx="2" className="graph-card-line-short" />
          </g>

          <g className="graph-card">
            <rect className="graph-surface" x="30" y="93" width="124" height="36" rx="5" />
            <rect x="38" y="103" width="52" height="4" rx="2" className="graph-card-line" />
            <rect x="38" y="112" width="34" height="4" rx="2" className="graph-card-line-short" />
            <rect className="graph-surface" x="30" y="221" width="124" height="76" rx="5" />
            <rect x="38" y="231" width="48" height="4" rx="2" className="graph-card-line" />
            <rect x="38" y="240" width="60" height="4" rx="2" className="graph-card-line-short" />
            <rect x="38" y="256" width="7" height="7" rx="2" className="graph-icon-purple" />
            <rect x="51" y="257" width="58" height="4" rx="2" className="graph-card-line" />
            <rect x="38" y="272" width="7" height="7" rx="2" className="graph-icon-blue" />
            <rect x="51" y="273" width="48" height="4" rx="2" className="graph-card-line-short" />
            <rect x="38" y="288" width="7" height="7" rx="2" className="graph-icon-muted" />
            <rect x="51" y="289" width="35" height="4" rx="2" className="graph-card-line-short" />

            <rect className="graph-surface" x="408" y="83" width="128" height="76" rx="5" />
            <rect x="417" y="93" width="48" height="4" rx="2" className="graph-card-line" />
            <rect x="417" y="102" width="60" height="4" rx="2" className="graph-card-line-short" />
            <rect x="417" y="118" width="7" height="7" rx="2" className="graph-icon-purple" />
            <rect x="430" y="119" width="58" height="4" rx="2" className="graph-card-line" />
            <rect x="417" y="134" width="7" height="7" rx="2" className="graph-icon-muted" />
            <rect x="430" y="135" width="48" height="4" rx="2" className="graph-card-line-short" />
            <rect x="417" y="150" width="7" height="7" rx="2" className="graph-icon-red" />

            <rect className="graph-surface" x="408" y="195" width="128" height="40" rx="5" />
            <rect x="417" y="207" width="52" height="4" rx="2" className="graph-card-line" />
            <rect x="417" y="218" width="36" height="4" rx="2" className="graph-card-line-short" />
            <rect className="graph-surface" x="30" y="326" width="124" height="48" rx="5" />
            <rect x="38" y="339" width="48" height="4" rx="2" className="graph-card-line" />
            <rect x="38" y="350" width="58" height="4" rx="2" className="graph-card-line-short" />
            <rect x="38" y="362" width="7" height="7" rx="2" className="graph-icon-muted" />

            <rect x="200" y="100" width="170" height="120" rx="8" className="graph-card-selected" />
            <rect x="209" y="110" width="50" height="4" rx="2" className="graph-card-line" />
            <rect x="209" y="119" width="35" height="4" rx="2" className="graph-card-line-short" />
            <rect x="209" y="135" width="7" height="7" rx="2" className="graph-icon-purple" />
            <rect x="222" y="136" width="63" height="4" rx="2" className="graph-card-line-bright" />
            <rect x="209" y="153" width="7" height="7" rx="2" className="graph-icon-muted" />
            <rect x="222" y="154" width="47" height="4" rx="2" className="graph-card-line-short" />
            <rect x="209" y="171" width="7" height="7" rx="2" className="graph-icon-teal" />
            <rect x="222" y="172" width="58" height="4" rx="2" className="graph-card-line-short" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function FeatureBlock({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-20 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1.1fr] lg:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">{eyebrow}</p>
          <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
            {title}
          </h2>
          <p className="mt-5 max-w-[32rem] text-base leading-7 text-foreground/70">{description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

async function HomeContent() {
  const { userId } = await auth();

  if (userId) {
    redirect("/workspace");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1140px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold">Cartograph</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignInButton forceRedirectUrl="/workspace" signUpForceRedirectUrl="/workspace">
              <button
                type="button"
                className="rounded-full border border-border px-3 py-2 text-sm text-foreground/80 transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton forceRedirectUrl="/workspace" signInForceRedirectUrl="/workspace">
              <button
                type="button"
                className="rounded-full bg-foreground px-3 py-2 text-sm font-medium text-background"
              >
                Sign up
              </button>
            </SignUpButton>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1140px] px-6 pb-16 pt-12 sm:pt-16">
        <section className="grid gap-10 pb-8 pt-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pb-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/60">
              Dependency map for public repositories
            </p>
            <h1 className="mt-4 max-w-[18ch] text-5xl font-semibold tracking-[-0.07em] text-foreground sm:text-6xl lg:text-7xl">
              See what a codebase actually depends on.
            </h1>
            <p className="mt-6 max-w-[36rem] text-lg leading-8 text-foreground/70">
              Cartograph reads a public repository and turns the imports into a navigable graph, so you can see how the app fits together without reading every file in sequence.
            </p>
            <LandingHeroForm />
          </div>

          <LandingFigure />
        </section>

        <FeatureBlock
          eyebrow="What it does"
          title="Map the real edges between files."
          description="It resolves imports against the repository tree and shows which modules depend on which, how routes connect to source, and what the system actually exposes."
        >
          <div className="rounded-[28px] border border-border bg-panel p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Files", "Parsed and weighted"],
                ["Imports", "Resolved to real edges"],
                ["Routes", "Connected to entry points"],
              ].map(([label, detail]) => (
                <div key={label} className="rounded-2xl border border-border bg-background p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/60">{label}</p>
                  <p className="mt-3 text-xl font-semibold tracking-[-0.04em]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </FeatureBlock>

        <FeatureBlock
          eyebrow="How it works"
          title="Fetch, parse, explain."
          description="The analysis follows the public archive, reads the TypeScript and JavaScript source, and labels the files by role before turning the result into a dependency graph."
        >
          <div className="rounded-[28px] border border-border bg-panel p-5">
            <ol className="space-y-4">
              {[
                "Fetch the repository archive and normalise the public GitHub URL.",
                "Parse source files, imports, routes and framework roles.",
                "Store the graph so the app can explain the shape of the codebase.",
              ].map((step, index) => (
                <li key={step} className="flex gap-4 rounded-2xl border border-border bg-background p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-foreground/70">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </FeatureBlock>

        <FeatureBlock
          eyebrow="Frameworks it understands"
          title="The graph is specific, not generic."
          description="Cartograph recognises the frameworks and route conventions a repo uses so the map includes the files that shape the application, not just the raw import tree."
        >
          <div className="rounded-[28px] border border-border bg-panel p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Next.js",
                "React",
                "Express",
                "Fastify",
                "Astro",
                "Vite",
              ].map((framework) => (
                <div key={framework} className="rounded-2xl border border-border bg-background p-4 font-mono text-sm uppercase tracking-[0.14em] text-foreground/80">
                  {framework}
                </div>
              ))}
            </div>
          </div>
        </FeatureBlock>

        <FeatureBlock
          eyebrow="What it does not do"
          title="It does not guess where the architecture is."
          description="This app does not invent edges, fill in missing files, or claim a relationship that the parser could not resolve. If a file is absent or a dependency cannot be recovered, the graph shows that rather than pretending it knows."
        >
          <div className="rounded-[28px] border border-border bg-panel p-5">
            <ul className="space-y-3 text-sm leading-6 text-foreground/70">
              {[
                "No invented imports or hidden dependencies.",
                "No screenshot-based claims about somebody else’s repo.",
                "No marketing fluff or social proof; just what the source says.",
              ].map((item) => (
                <li key={item} className="flex gap-3 rounded-2xl border border-border bg-background p-4">
                  <span aria-hidden="true" className="mt-1 text-foreground/60">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </FeatureBlock>
      </main>

      <footer className="border-t border-border text-center text-xs text-foreground/50">
        <div className="mx-auto max-w-[1140px] px-6 py-8">
          Cartograph shows the dependency map that the codebase actually contains.
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-foreground/60">Loading…</div>}>
      <HomeContent />
    </Suspense>
  );
}
