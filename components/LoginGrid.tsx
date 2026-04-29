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
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <button
        onClick={handleSignIn}
        className="w-full rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSigningIn}
      >
        {isSigningIn ? "Redirecting to SSO..." : "Continue with provided credentials"}
      </button>
      <p className="text-center text-xs text-slate-300">
        You will be redirected to the login page and returned here after authentication.
      </p>
    </div>
  );
}
