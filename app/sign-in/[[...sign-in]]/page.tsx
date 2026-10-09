import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={<p>Loading sign in…</p>}>
        <SignIn forceRedirectUrl="/workspace" signUpForceRedirectUrl="/workspace" />
      </Suspense>
    </div>
  );
}
