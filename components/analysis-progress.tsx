"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getAnalysisStageLabel,
  isAnalysisStale,
  type AnalysisProgressSnapshot,
} from "@/lib/analysis-progress";
import { useLiveAnalyses } from "@/components/use-live-analyses";
import { RunAnalysisAgainButton } from "@/components/run-analysis-again-button";

const STAGE_ORDER = ["fetching", "selecting", "parsing", "storing", "complete", "failed"] as const;

export function AnalysisProgress({
  initialAnalysis,
}: {
  initialAnalysis: AnalysisProgressSnapshot;
}) {
  const initialAnalyses = useMemo(() => [initialAnalysis], [initialAnalysis]);
  const { analyses, connectionError, connectionStatus } = useLiveAnalyses(initialAnalyses);
  const router = useRouter();
  const analysis = analyses[0] ?? initialAnalysis;
  const [now, setNow] = useState(() => Date.now());
  const stale =
    (analysis.status === "pending" || analysis.status === "running") &&
    isAnalysisStale(analysis.updated_at, now);
  const currentStage = getAnalysisStageLabel(analysis);
  const finished = analysis.status === "completed";
  const failed = analysis.status === "failed";

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (finished) {
      router.replace(`/analysis/${analysis.id}/map`);
    }
  }, [analysis.id, finished, router]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
      <Link
        className="w-fit font-mono text-xs text-foreground/60 underline decoration-foreground/25 underline-offset-2 hover:text-foreground"
        href="/workspace"
      >
        ← Workspace
      </Link>

      <section className="rounded-lg border border-border bg-panel p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">
          Repository analysis
        </p>
        <h1 className="mt-2 break-all font-mono text-sm font-medium">
          {analysis.repository_url}
        </h1>
        <p className="mt-2 text-xs text-foreground/60">
          {analysis.stage_message ??
            (analysis.status === "pending"
              ? "Waiting for repository analysis to start."
              : "Preparing analysis.")}
        </p>

        {connectionStatus === "error" ? (
          <p className="mt-4 rounded border border-red-700/20 bg-red-700/5 px-3 py-2 text-xs text-red-700 dark:text-red-300" role="status">
            Live progress unavailable: {connectionError}
          </p>
        ) : connectionStatus === "connected" ? (
          <p className="mt-4 font-mono text-[11px] text-foreground/50" aria-live="polite">
            Live progress connected
          </p>
        ) : connectionStatus === "connecting" ? (
          <p className="mt-4 font-mono text-[11px] text-foreground/50" aria-live="polite">
            Connecting to live progress…
          </p>
        ) : null}

        {connectionStatus === "idle" && finished ? (
          <p className="mt-4 font-mono text-[11px] text-foreground/50">
            Analysis complete
          </p>
        ) : null}

        {stale ? (
          <p className="mt-4 rounded border border-amber-700/20 bg-amber-700/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" role="status">
            No update for more than three minutes. This run may be stale.
          </p>
        ) : null}

        <ol className="mt-6 grid gap-2 sm:grid-cols-3 md:grid-cols-6" aria-label="Analysis stages">
          {STAGE_ORDER.map((stage) => {
            const stageIndex = STAGE_ORDER.indexOf(stage);
            const currentIndex = STAGE_ORDER.findIndex((stage) => stage === currentStage);
            const failedStageIndex = STAGE_ORDER.findIndex(
              (candidate) => candidate === analysis.failed_stage,
            );
            const complete =
              finished ||
              (!failed && currentIndex >= 0 && stageIndex < currentIndex) ||
              (failed && failedStageIndex >= 0 && stageIndex < failedStageIndex);
            const active = analysis.stage === stage && !finished && !failed;
            const stageFailed =
              failed && (stage === "failed" || stage === analysis.failed_stage);

            return (
              <li
                className={[
                  "rounded border px-2 py-2 font-mono text-[10px] uppercase",
                  stageFailed
                    ? "border-red-700/30 text-red-700 dark:text-red-300"
                    : active
                      ? "border-foreground/50 text-foreground"
                      : complete
                        ? "border-foreground/20 text-foreground/70"
                        : "border-border text-foreground/40",
                ].join(" ")}
                key={stage}
              >
                {stage}
                {active ? " · current" : complete ? " · done" : ""}
              </li>
            );
          })}
        </ol>
      </section>

      {failed ? (
        <section className="rounded-lg border border-red-700/20 bg-panel p-5">
          <h2 className="text-sm font-medium text-red-700 dark:text-red-300">
            {analysis.failed_stage
              ? `Analysis failed during ${analysis.failed_stage}`
              : "Analysis failed"}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-xs text-foreground/70">
            {analysis.error_message ?? analysis.stage_message ?? "The analysis failed without an error message."}
          </p>
          <div className="mt-4">
            <RunAnalysisAgainButton analysisId={analysis.id} />
          </div>
        </section>
      ) : null}

      {finished ? (
        <section className="rounded-lg border border-border bg-panel p-5">
          <h2 className="text-sm font-medium">Analysis stored</h2>
          <p className="mt-2 text-xs text-foreground/60">
            Opening the repository map…
          </p>
        </section>
      ) : null}
    </main>
  );
}
