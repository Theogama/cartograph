"use client";

import { useActionState } from "react";

import {
  retryRepositoryAnalysisAction,
  type RetryAnalysisState,
} from "@/app/actions/analysis";

const INITIAL_STATE: RetryAnalysisState = { error: null };

export function RunAnalysisAgainButton({ analysisId }: { analysisId: string }) {
  const [state, formAction, isPending] = useActionState(
    retryRepositoryAnalysisAction.bind(null, analysisId),
    INITIAL_STATE,
  );

  return (
    <form action={formAction}>
      <button
        className="rounded-md border border-border px-3 py-2 font-mono text-[11px] text-foreground/70 hover:bg-foreground/[0.04] disabled:cursor-wait disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Preparing run…" : "Re-run analysis"}
      </button>
      {state.error ? (
        <p className="mt-2 max-w-xs text-xs text-red-700 dark:text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
