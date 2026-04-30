"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { clearCurrentUser } from "@/lib/auth";

export default function LoginGrid() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "/dashboard";
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (!redirect) return "/dashboard";
    return redirect.startsWith("/") ? redirect : "/dashboard";
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    clearCurrentUser();
    await signIn(
      "keycloak",
      { callbackUrl },
      {
        prompt: "login",
        max_age: "0",
      },
    );
    setIsSigningIn(false);
  };

  return (
    <div className="flex max-w-md flex-col gap-4">
      <button
        onClick={handleSignIn}
        className="w-full rounded-lg border border-[#0c2340] bg-[#0c2340] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#152a45] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c2340] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSigningIn}
        type="button"
      >
        {isSigningIn ? "Redirecting to secure login…" : "Proceed to secure sign-on"}
      </button>
      <p className="text-xs leading-relaxed text-slate-500">
        You will be redirected to the approved identity provider. After successful authentication you will return to this
        dashboard.
      </p>
    </div>
  );
}
