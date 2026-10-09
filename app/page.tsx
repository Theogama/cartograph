import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";

async function HomeContent() {
  const { userId } = await auth();

  if (userId) {
    redirect("/workspace");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-mono text-sm font-semibold">Cartograph</span>
        <Suspense fallback={<div className="h-9 w-24" aria-hidden="true" />}>
          <nav className="flex items-center gap-3" aria-label="Account">
            <SignInButton forceRedirectUrl="/workspace" signUpForceRedirectUrl="/workspace">
              <button
                className="rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                type="button"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton forceRedirectUrl="/workspace" signInForceRedirectUrl="/workspace">
              <button
                className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
                type="button"
              >
                Sign up
              </button>
            </SignUpButton>
          </nav>
        </Suspense>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
        <p className="mb-4 font-mono text-sm text-foreground/60">
          See how a codebase fits together
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          A map of what your code actually depends on.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-foreground/70">
          Cartograph parses public TypeScript and JavaScript repositories into a
          dependency map, so you can see what a file imports and what relies on it.
        </p>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <HomeContent />
    </Suspense>
  );
}
