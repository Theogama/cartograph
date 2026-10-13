"use client";

import { SignInButton } from "@clerk/nextjs";
import { useState } from "react";

function repoRedirectUrl(repositoryUrl: string): string {
  const trimmed = repositoryUrl.trim();
  return `/workspace${trimmed ? `?repositoryUrl=${encodeURIComponent(trimmed)}` : ""}`;
}

export function LandingHeroForm() {
  const [repositoryUrl, setRepositoryUrl] = useState("https://github.com/owner/repository");
  const redirectUrl = repoRedirectUrl(repositoryUrl);

  return (
    <div className="mt-8 max-w-xl">
      <label
        htmlFor="landing-repository-url"
        className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60"
      >
        Public repository URL
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          aria-label="Public repository URL"
          autoComplete="url"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-foreground/45 focus:border-foreground/40"
          id="landing-repository-url"
          value={repositoryUrl}
          onChange={(event) => setRepositoryUrl(event.target.value)}
          placeholder="https://github.com/owner/repository"
          type="url"
        />
        <SignInButton forceRedirectUrl={redirectUrl} signUpForceRedirectUrl={redirectUrl}>
          <button
            className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
            type="button"
          >
            Start mapping
          </button>
        </SignInButton>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-foreground/60">
        <span className="font-mono uppercase tracking-[0.14em]">No signup wall</span>
        <span aria-hidden="true">•</span>
        <span>Works with public GitHub repos</span>
      </div>
    </div>
  );
}
