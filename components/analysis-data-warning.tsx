import Link from "next/link";

import { RunAnalysisAgainButton } from "@/components/run-analysis-again-button";

export function AnalysisDataWarning({
  analysisId,
  repositoryUrl,
  message,
}: {
  analysisId: string;
  repositoryUrl: string;
  message: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <Link
        className="w-fit font-mono text-xs text-foreground/60 underline decoration-foreground/25 underline-offset-2 hover:text-foreground"
        href="/workspace"
      >
        Workspace
      </Link>
      <section className="rounded-lg border border-amber-700/25 bg-panel p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber-800 dark:text-amber-300">
          Stored analysis data is incomplete
        </p>
        <h1 className="mt-2 break-all font-mono text-sm">{repositoryUrl}</h1>
        <p className="mt-3 text-xs leading-5 text-foreground/70">{message}</p>
        <div className="mt-4">
          <RunAnalysisAgainButton analysisId={analysisId} />
        </div>
      </section>
    </main>
  );
}
