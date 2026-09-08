"use client";

import { useState } from "react";
import { Button, InlineAlert, TextField } from "@/components/nocturne";
import { withNextBasePath } from "@/lib/next-base-path";

/**
 * The code gate — what stands between a public page and a privileged write.
 *
 * The wizard does not start until a code checks out. This screen exists to
 * fail early: an eight-step setup that rejects your authorization at the last
 * click is worse than one that asks for it first.
 *
 * It tells the visitor exactly two things about a valid code — the plan it
 * carries, and which modules that plan reaches — both of which are already on
 * the public pricing page. About an invalid code it says one sentence, the same
 * sentence for expired, spent and never-existed, because a screen that
 * distinguishes them is an oracle for which codes exist.
 */
export type CodeGrant = {
  /** Held in memory only. Never written to storage — see the wizard's header. */
  token: string;
  tier: string;
  /** Gated module codes this tier reaches. Core modules are always included. */
  modules: string[];
};

const TIER_NAMES: Record<string, string> = {
  core: "Essential",
  standard: "Governance",
  premium: "Institution",
  addon: "Institution",
};

export function tierDisplayName(tier: string): string {
  return TIER_NAMES[tier] ?? tier;
}

export default function CodeGate({
  onVerified,
  platformHref,
  hasDraft,
  devSkipEnabled = false,
}: {
  onVerified: (grant: CodeGrant) => void;
  platformHref: string;
  hasDraft: boolean;
  /** Dev-only convenience — see `app/onboarding/page.tsx`. Never true in production. */
  devSkipEnabled?: boolean;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [skipping, setSkipping] = useState(false);

  async function check() {
    const token = code.trim();
    if (!token) {
      setError("Enter the onboarding code you were sent.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const response = await fetch(withNextBasePath("/api/onboarding/check"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.valid) {
        setError(payload?.detail ?? "That onboarding code is not valid.");
        return;
      }
      onVerified({ token, tier: payload.tier, modules: payload.modules ?? [] });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  /**
   * Mints a real, single-use onboarding token via the dev-only endpoint and
   * carries on exactly as if it had been typed in — the token still gets
   * consumed by `provision.ts` in the usual way. Only reachable when the
   * server told us `devSkipEnabled`, which is itself gated by
   * `NODE_ENV !== "production" && DEV_AUTH_ENABLED === "1"`.
   */
  async function skip() {
    setSkipping(true);
    setError(null);
    try {
      const response = await fetch(withNextBasePath("/api/dev/onboarding-token"), { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.valid) {
        setError("Could not mint a dev onboarding token.");
        return;
      }
      onVerified({ token: payload.token, tier: payload.tier, modules: payload.modules ?? [] });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="ax-lp-shell" style={{ paddingBlock: 72, maxWidth: 560 }}>
      <p className="ax-section-title">Onboarding</p>
      <h1 className="ax-lp-h2">Set up your organization</h1>
      <p className="ax-wz-hint" style={{ marginBottom: 24 }}>
        {hasDraft
          ? "Your saved answers are still here. Enter your onboarding code to carry on."
          : "Airawat sends an onboarding code when your agreement is signed. Enter it to begin."}
      </p>

      <form
        className="ax-wz-fields"
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <TextField
          id="onboarding-code"
          label="Onboarding code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          hint="43 characters, from the email that confirmed your agreement."
          error={error ?? undefined}
        />
        <div className="ax-wz-nav" style={{ paddingTop: 0 }}>
          <Button variant="primary" type="submit" disabled={checking}>
            {checking ? "Checking…" : "Continue"}
          </Button>
          <a className="btn btn-ghost" href={platformHref}>
            Back to the platform overview
          </a>
        </div>
      </form>

      <div style={{ marginTop: 32 }}>
        <InlineAlert assertive={false}>
          Do not have a code? Setting up a workspace is arranged with Airawat first, so that no
          organization&rsquo;s name and address can be claimed by someone who is not them.
        </InlineAlert>
      </div>

      {devSkipEnabled ? (
        <div style={{ marginTop: 16 }}>
          <Button variant="ghost" type="button" onClick={() => void skip()} disabled={skipping}>
            {skipping ? "Minting a dev code…" : "Skip — dev only"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
