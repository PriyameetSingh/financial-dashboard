"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { clearCurrentUser } from "@/lib/auth";

export default function LoginGrid() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "/dashboard";
    const envBase = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
    const path = window.location.pathname;
    const inferred =
      envBase ||
      (path.includes("/login") ? path.replace(/\/?login\/?$/, "").replace(/\/$/, "") : "");
    const basePath = inferred;
    const origin = window.location.origin; // e.g. https://product.airawat.org
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    const relativePath = redirect?.startsWith("/") ? redirect : `${basePath}/dashboard`;
    const fullPath = relativePath.startsWith(basePath) ? relativePath : `${basePath}${relativePath}`;
    console.log("fullPath", fullPath);
    console.log("origin", origin);
    return `${origin}${fullPath}`; // absolute URL avoids Auth.js misresolution
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
        // The design system's primary action: an accent outline, never a fill.
        className="btn btn-primary btn-block px-6 py-3.5 text-sm"
        disabled={isSigningIn}
        type="button"
      >
        {isSigningIn ? "Redirecting to secure login…" : "Proceed to secure sign-on"}
      </button>
      <p className="text-xs leading-relaxed" style={{ color: "var(--ax-muted)" }}>
        You will be redirected to the approved identity provider. After successful authentication you will return to this
        dashboard.
      </p>
    </div>
  );
}
