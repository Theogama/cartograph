"use client";

import { useActionState } from "react";

import {
  startRepositoryAnalysisAction,
  type StartAnalysisState,
} from "@/app/actions/analysis";

const INITIAL_STATE: StartAnalysisState = { error: null };

export function RepositoryAnalysisForm() {
  const [state, formAction, isPending] = useActionState(
    startRepositoryAnalysisAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="repositoryUrl">
        Public GitHub repository URL
      </label>
      <input
        autoComplete="url"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-foreground/40 focus:border-foreground/40"
        id="repositoryUrl"
        name="repositoryUrl"
        placeholder="https://github.com/owner/repository"
        required
        type="url"
      />
      <button
        className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background disabled:cursor-wait disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Starting…" : "Analyse repository"}
      </button>
      {state.error ? (
        <p className="basis-full text-xs text-red-700 dark:text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
