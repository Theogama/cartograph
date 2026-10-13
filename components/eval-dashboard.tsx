"use client";

import { useState, useTransition } from "react";

import {
  comparePromptsAction,
  evaluateRecentTrafficAction,
} from "@/app/actions/evals";

type TrafficResult = Awaited<ReturnType<typeof evaluateRecentTrafficAction>>;
type PromptResult = Awaited<ReturnType<typeof comparePromptsAction>>;

function RunButton({
  label,
  pendingLabel,
  pending,
  onClick,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="mt-3 rounded border border-border px-3 py-2 text-xs font-medium hover:bg-black/5 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-white/10"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function EvaluationDashboard() {
  const [traffic, setTraffic] = useState<TrafficResult | null>(null);
  const [trafficError, setTrafficError] = useState<string | null>(null);
  const [trafficPending, startTraffic] = useTransition();
  const [prompts, setPrompts] = useState<PromptResult | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptPending, startPrompt] = useTransition();

  const runTraffic = () => {
    setTrafficError(null);
    startTraffic(async () => {
      try {
        setTraffic(await evaluateRecentTrafficAction());
      } catch (error) {
        setTrafficError(error instanceof Error ? error.message : String(error));
      }
    });
  };

  const runPrompts = () => {
    setPromptError(null);
    startPrompt(async () => {
      try {
        setPrompts(await comparePromptsAction());
      } catch (error) {
        setPromptError(error instanceof Error ? error.message : String(error));
      }
    });
  };

  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">
          Evaluations
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Explanation quality</h2>
        <p className="mt-2 text-xs text-foreground/60">
          Evaluators use recent LangSmith traces and real source context. Prompt comparisons and role checks make model calls.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded border border-border bg-background/60 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">
            Invented paths · last 7 days
          </p>
          {traffic ? (
            <>
              <p className="mt-3 text-3xl font-semibold">
                {traffic.score === null ? "—" : `${traffic.score.toFixed(1)}%`}
              </p>
              <p className="mt-2 text-xs text-foreground/60">
                {traffic.traceCount} explanations; {traffic.totalChecked} path mentions checked.
              </p>
              {traffic.invented.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-300">
                  {traffic.invented.map((item, index) => (
                    <li key={`${item.traceId}:${item.path}:${index}`}>
                      {item.target}: <code>{item.path}</code>
                    </li>
                  ))}
                </ul>
              ) : traffic.score !== null ? (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                  No invented paths found.
                </p>
              ) : (
                <p className="mt-2 text-xs text-foreground/60">
                  No path mentions to score yet.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-xs text-foreground/60">
              Check recent real explanations against the exact paths shown to the model.
            </p>
          )}
          <RunButton
            label="Evaluate recent traffic"
            pendingLabel="Checking traces…"
            pending={trafficPending}
            onClick={runTraffic}
          />
          {trafficError ? <p className="mt-2 text-xs text-red-700" role="alert">{trafficError}</p> : null}
        </article>

        <article className="rounded border border-border bg-background/60 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">
            Role accuracy
          </p>
          <p className="mt-3 text-xs text-foreground/60">
            Run the standalone held-out evaluation from the repository root:
          </p>
          <code className="mt-2 block rounded bg-black/5 px-2 py-1 font-mono text-xs dark:bg-white/10">
            pnpm eval:roles
          </code>
          <p className="mt-2 text-xs text-foreground/60">
            It prints accuracy over at least 30 convention-labelled files.
          </p>
        </article>

        <article className="rounded border border-border bg-background/60 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">
            Prompt versions
          </p>
          {prompts ? (
            <>
              <p className="mt-3 text-sm text-foreground/80">
                {prompts.sampleCount} shared real examples; judge scores are subjective.
              </p>
              <p className="mt-2 text-xs font-medium">
                {prompts.winner.name} leads by {prompts.delta.toFixed(1)} points.
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-foreground/60">
              Replay both prompts over the same real traces and score with a model judge.
            </p>
          )}
          <RunButton
            label="Run prompt comparison"
            pendingLabel="Running model experiments…"
            pending={promptPending}
            onClick={runPrompts}
          />
          {prompts ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {prompts.experiments.map((experiment) => (
                <div key={experiment.name} className="rounded border border-border p-2">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="font-mono">{experiment.name}</span>
                    <span>{experiment.score.toFixed(1)} / 100</span>
                  </div>
                  <p className="mt-1 text-[11px] text-foreground/60">{experiment.description}</p>
                </div>
              ))}
            </div>
          ) : null}
          {promptError ? <p className="mt-2 text-xs text-red-700" role="alert">{promptError}</p> : null}
        </article>
      </div>

      <p className="mt-5 text-xs text-foreground/60">
        Prompt scores come from an LLM judge and are subjective, not ground truth. Role scoring excludes convention-assigned structural roles.
      </p>
    </section>
  );
}
