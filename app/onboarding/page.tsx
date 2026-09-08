import type { Metadata } from "next";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { landingLinks } from "@/lib/platform/links";
import OnboardingWizard from "./OnboardingWizard";

/**
 * S2 — the onboarding wizard's route.
 *
 * Public, like the landing, and for the same reason: an organization that does
 * not have a workspace yet cannot sign in to ask for one. That makes the page
 * reachable by anyone, which is exactly why the privileged part of it — creating
 * the tenant — is gated by an onboarding code rather than by the page being
 * hard to find. See `lib/onboarding/token.ts` for that decision in full.
 *
 * The page itself is a thin server component. It reads no session, no tenant and
 * no database; everything the wizard needs comes from the code the visitor
 * enters, checked over the API.
 */
export const metadata: Metadata = {
  title: "Set up your organization — Airawat",
};

/**
 * Same two-condition gate `lib/dev-path-routing.ts` and
 * `app/api/dev/session/route.ts` use: neither `NODE_ENV` nor
 * `DEV_AUTH_ENABLED` alone is enough. Read server-side and passed down as a
 * plain boolean prop — the client component never sees `DEV_AUTH_ENABLED`
 * itself, only whether the shortcut button should render.
 */
function devSkipEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "1";
}

export default function OnboardingPage() {
  const links = landingLinks();
  return (
    <NocturneRoot>
      <div className="ax-lp-root">
        <a href="#wizard" className="btn btn-secondary ax-skip">
          Skip to setup
        </a>
        <header className="ax-lp-header">
          <div className="ax-lp-shell ax-lp-bar">
            <a href={links.platform} className="ax-lp-brand">
              <span className="ax-lp-mark" aria-hidden="true" />
              <span className="ax-lp-wordmark">Airawat</span>
              <span className="ax-lp-suffix">Set-up</span>
            </a>
          </div>
        </header>
        <main id="wizard">
          <OnboardingWizard platformHref={links.platform} devSkipEnabled={devSkipEnabled()} />
        </main>
      </div>
    </NocturneRoot>
  );
}
