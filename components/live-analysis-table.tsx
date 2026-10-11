"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getAnalysisStageLabel,
  isAnalysisStale,
  type AnalysisProgressSnapshot,
} from "@/lib/analysis-progress";
import { useLiveAnalyses } from "@/components/use-live-analyses";

export function LiveAnalysisTable({
  initialAnalyses,
}: {
  initialAnalyses: AnalysisProgressSnapshot[];
}) {
  const { analyses, connectionError } = useLiveAnalyses(initialAnalyses);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);

  if (analyses.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-panel px-5 py-8">
        <h2 className="text-sm font-medium">No analyses yet</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Submit a public GitHub repository above to start an analysis.
        </p>
      </section>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      {connectionError ? (
        <p className="border-b border-border px-4 py-2 text-xs text-red-700 dark:text-red-300" role="status">
          Live updates unavailable: {connectionError}
        </p>
      ) : null}
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border font-mono text-[11px] uppercase tracking-wide text-foreground/60">
            <th className="px-4 py-3 font-medium">Repository</th>
            <th className="px-4 py-3 font-medium">State</th>
            <th className="px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((analysis) => {
            const stale =
              (analysis.status === "pending" || analysis.status === "running") &&
              isAnalysisStale(analysis.updated_at, now);
            const state = stale ? "stale" : getAnalysisStageLabel(analysis);
            const detail = stale
              ? "No update for more than three minutes."
              : analysis.stage_message ?? analysis.error_message;

            return (
              <tr key={analysis.id} className="border-b border-border last:border-0">
                <td className="max-w-xl truncate px-4 py-3 font-mono text-xs">
                  <Link
                    className="text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground"
                    href={`/analysis/${analysis.id}`}
                  >
                    {analysis.repository_url}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs font-medium">{state}</p>
                  {detail ? (
                    <p className="mt-1 max-w-xl text-xs text-foreground/60">{detail}</p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground/60">
                  <time dateTime={analysis.updated_at}>
                    {new Date(analysis.updated_at).toLocaleString()}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
