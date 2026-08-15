"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, InlineAlert, Toast } from "@/components/nocturne";
import { withNextBasePath } from "@/lib/next-base-path";
import {
  emptyDraft,
  validateDraft,
  type OnboardingDraft,
} from "@/lib/onboarding/draft";
import CodeGate, { type CodeGrant } from "./CodeGate";
import LaunchedPanel, { type LaunchResult } from "./LaunchedPanel";
import StepOrg from "./steps/StepOrg";
import StepBranding from "./steps/StepBranding";
import StepLocale from "./steps/StepLocale";
import StepModules from "./steps/StepModules";
import StepAi from "./steps/StepAi";
import StepStarter from "./steps/StepStarter";
import StepPeople from "./steps/StepPeople";
import StepReview from "./steps/StepReview";

/**
 * S2 — the onboarding wizard.
 *
 * Eight steps, as designed, plus one thing the design does not have: a code
 * gate in front of them. Creating a tenant is a privileged write reachable from
 * a public page, so it is authorized by a code Airawat issues out of band. The
 * reasoning is in `lib/onboarding/token.ts`; the consequence here is that the
 * wizard does not start until a code checks out.
 *
 * TWO THINGS ARE DELIBERATELY NOT PERSISTED, and both are departures from the
 * mockup's draft shape:
 *
 *   - the AI API key. The draft is written to `localStorage` for
 *     save-and-resume, and a credential sitting in browser storage until
 *     somebody clears it is a real leak — on a shared government desktop
 *     especially. It lives in React state for the life of the tab, is posted
 *     once, and is never read back from the server either.
 *   - the onboarding code, for the same reason and one more: it is single-use
 *     authorization to create an organization. Resuming a draft therefore asks
 *     for the code again, which is a small cost for not leaving a provisioning
 *     credential on disk.
 *
 * Everything else resumes. `tests/onboarding.test.ts` pins that the persisted
 * shape cannot carry either secret.
 */

const DRAFT_KEY = "airawat-onboarding-draft";

export type StepDef = {
  id: string;
  label: string;
  sub: string;
  hint: string;
};

export const STEPS: readonly StepDef[] = [
  {
    id: "org",
    label: "Org profile",
    sub: "Name, address, contact",
    hint: "Tell us who this workspace is for. The address becomes your permanent sign-in URL.",
  },
  {
    id: "branding",
    label: "Branding",
    sub: "Logo and brand colour",
    hint: "Your identity, applied everywhere — screens, report packs, invitation emails.",
  },
  {
    id: "locale",
    label: "Localization",
    sub: "Language, currency, fiscal year",
    hint: "Amounts, dates and the fiscal year follow your organization, not ours.",
  },
  {
    id: "modules",
    label: "Modules",
    sub: "What your teams get",
    hint: "Your plan sets the ceiling; choose what to switch on inside it. Everything here is changeable later.",
  },
  {
    id: "ai",
    label: "AI setup",
    sub: "Models, keys, data controls",
    hint: "Choose how the assistant runs — hosted by us, on your own key, or inside your network.",
  },
  {
    id: "starter",
    label: "Starter data",
    sub: "Empty or sample",
    hint: "Choose how the workspace should look on day one.",
  },
  {
    id: "people",
    label: "People",
    sub: "Your first administrators",
    hint: "Invite the administrators first — they can bring in everyone else.",
  },
  {
    id: "review",
    label: "Review & launch",
    sub: "Check everything, go live",
    hint: "Everything below is editable after launch, from your workspace settings.",
  },
];

/** Client-side validity per step. The server re-validates the whole draft. */
function stepIsValid(index: number, draft: OnboardingDraft, aiKey: string): boolean {
  if (index === 0) {
    return (
      validateDraft({ ...emptyDraft(), orgName: draft.orgName, slug: draft.slug, contactEmail: draft.contactEmail })
        ?.kind !== "field" &&
      draft.orgName.trim().length >= 2 &&
      /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(draft.slug)
    );
  }
  if (index === 4) {
    if (draft.aiMode === "byok") return aiKey.trim().length >= 12;
    if (draft.aiMode === "selfhost") return /^https?:\/\/\S+$/.test(draft.aiEndpoint);
  }
  if (index === 6) {
    return draft.invites.every((p) => p.email.trim() === "" || /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(p.email));
  }
  return true;
}

export default function OnboardingWizard({ platformHref }: { platformHref: string }) {
  const [grant, setGrant] = useState<CodeGrant | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const [aiKey, setAiKey] = useState("");
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<LaunchResult | null>(null);
  /**
   * Set once on mount, and exposed as `data-hydrated` on the wrapper below.
   *
   * The page is server-rendered, so its form exists and is clickable before
   * React has attached anything to it — click "Continue" in that window and the
   * browser performs a plain form submission, reloading the page and losing the
   * code. A human is unlikely to be that fast; the accessibility leg, which
   * drives this wizard with a real browser, is not. The attribute gives it
   * something honest to wait for instead of sniffing React's internals.
   */
  const [hydrated, setHydrated] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore a draft on first mount. A launched draft is not restored: the
  // workspace exists and its code is spent, so offering to resume would only
  // walk someone into a rejection.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { draft?: OnboardingDraft; step?: number; furthest?: number };
      if (!parsed?.draft || typeof parsed.draft !== "object") return;
      setDraft({ ...emptyDraft(), ...parsed.draft });
      setStep(Math.min(STEPS.length - 1, Math.max(0, parsed.step ?? 0)));
      setFurthest(Math.min(STEPS.length - 1, Math.max(0, parsed.furthest ?? 0)));
      setResumed(true);
    } catch {
      /* A corrupt draft is not worth an error message. Start fresh. */
    } finally {
      setHydrated(true);
    }
  }, []);

  const persist = useCallback(
    (next: OnboardingDraft, nextStep: number, nextFurthest: number) => {
      try {
        // Only these three. The AI key and the onboarding code are never
        // written — see this file's header.
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ draft: next, step: nextStep, furthest: nextFurthest }),
        );
      } catch {
        /* Storage full or blocked: the wizard still works, it just cannot resume. */
      }
    },
    [],
  );

  const update = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      setDraft((current) => {
        const next = { ...current, ...patch };
        persist(next, step, furthest);
        return next;
      });
    },
    [persist, step, furthest],
  );

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index > furthest) return;
      setStep(index);
      setShowErrors(false);
      persist(draft, index, furthest);
      // Focus the new step's heading. Without this, a keyboard or screen-reader
      // user activates "Continue" and focus stays on a button that has moved,
      // with no announcement that the page changed underneath them.
      window.requestAnimationFrame(() => headingRef.current?.focus());
    },
    [draft, furthest, persist],
  );

  const next = useCallback(() => {
    if (!stepIsValid(step, draft, aiKey)) {
      setShowErrors(true);
      return;
    }
    const target = Math.min(STEPS.length - 1, step + 1);
    const nextFurthest = Math.max(furthest, target);
    setFurthest(nextFurthest);
    setStep(target);
    setShowErrors(false);
    persist(draft, target, nextFurthest);
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [aiKey, draft, furthest, persist, step]);

  function saveAndNote() {
    persist(draft, step, furthest);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 4000);
  }

  async function launch() {
    if (!grant) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(withNextBasePath("/api/onboarding/provision"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: grant.token,
          draft,
          // Only sent when the visitor chose to bring their own key.
          ...(draft.aiMode === "byok" && aiKey ? { llmApiKey: aiKey } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        setSubmitError(payload?.detail ?? "Could not create the workspace. Try again.");
        // A field-level rejection sends the visitor back to the step that owns
        // it rather than leaving them on the review screen wondering.
        const field = payload?.field;
        if (field === "slug" || field === "orgName" || field === "contactEmail") goTo(0);
        else if (field === "brandColor") goTo(1);
        else if (field === "aiEndpoint" || field === "aiMode") goTo(4);
        else if (field === "invites") goTo(6);
        return;
      }
      setLaunched(payload as LaunchResult);
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* nothing to clean up */
      }
    } catch {
      setSubmitError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* nothing to clean up */
    }
    setDraft(emptyDraft());
    setAiKey("");
    setStep(0);
    setFurthest(0);
    setResumed(false);
    setShowErrors(false);
  }

  if (!grant) {
    return (
      <div data-hydrated={hydrated ? "1" : undefined}>
        <CodeGate onVerified={setGrant} platformHref={platformHref} hasDraft={resumed} />
      </div>
    );
  }

  if (launched) {
    return (
      <div data-hydrated="1">
        <LaunchedPanel result={launched} platformHref={platformHref} onStartOver={startOver} />
      </div>
    );
  }

  const current = STEPS[step];
  const shared = { draft, update, showErrors };

  return (
    <div className="ax-wz" data-hydrated="1">
      <nav aria-label="Setup steps">
        <p className="ax-wz-rail-head" id="wz-rail-head">
          Eight steps · resume any time
        </p>
        <ol className="ax-wz-rail" aria-labelledby="wz-rail-head">
          {STEPS.map((definition, index) => {
            const done = index < furthest && index !== step;
            return (
              <li key={definition.id}>
                <button
                  type="button"
                  className={`ax-wz-step${done ? " ax-wz-step-done" : ""}`}
                  aria-current={index === step ? "step" : undefined}
                  disabled={index > furthest}
                  onClick={() => goTo(index)}
                >
                  <span className="ax-wz-marker" aria-hidden="true">
                    {done ? "✓" : index + 1}
                  </span>
                  <span className="ax-wz-step-label">
                    <span>{definition.label}</span>
                    <span className="ax-wz-step-sub">{definition.sub}</span>
                  </span>
                  <span className="ax-sr-only">
                    {index === step
                      ? " — current step"
                      : done
                        ? " — completed"
                        : index > furthest
                          ? " — not reached yet"
                          : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="ax-wz-body">
        {resumed ? (
          <Toast>Picked up where you left off. Your onboarding code is needed again to launch.</Toast>
        ) : null}

        <div>
          <p className="ax-section-title">
            Step {step + 1} of {STEPS.length}
          </p>
          {/* `tabIndex={-1}` so focus can be moved here on a step change without
              putting the heading in the tab order. */}
          <h1 tabIndex={-1} ref={headingRef} style={{ fontSize: 28, margin: "0 0 8px" }}>
            {current.label}
          </h1>
          <p className="ax-wz-hint">{current.hint}</p>
        </div>

        {step === 0 ? <StepOrg {...shared} /> : null}
        {step === 1 ? <StepBranding {...shared} /> : null}
        {step === 2 ? <StepLocale {...shared} /> : null}
        {step === 3 ? <StepModules {...shared} grant={grant} /> : null}
        {step === 4 ? <StepAi {...shared} aiKey={aiKey} setAiKey={setAiKey} /> : null}
        {step === 5 ? <StepStarter {...shared} /> : null}
        {step === 6 ? <StepPeople {...shared} /> : null}
        {step === 7 ? (
          <StepReview draft={draft} grant={grant} aiKeySet={aiKey.length > 0} onEdit={goTo} />
        ) : null}

        {submitError ? <InlineAlert>{submitError}</InlineAlert> : null}

        <div className="ax-wz-nav">
          {step > 0 ? (
            <Button variant="secondary" onClick={() => goTo(step - 1)}>
              Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={launch} disabled={submitting}>
              {submitting ? "Creating the workspace…" : "Launch the workspace"}
            </Button>
          )}
          <Button variant="ghost" onClick={saveAndNote}>
            Save and finish later
          </Button>
          {saved ? <Toast>Saved. Come back to this page any time.</Toast> : null}
        </div>
      </div>
    </div>
  );
}
