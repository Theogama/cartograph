import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={<p>Loading sign up…</p>}>
        <SignUp forceRedirectUrl="/workspace" signInForceRedirectUrl="/workspace" />
      </Suspense>
    </div>
  );
}
