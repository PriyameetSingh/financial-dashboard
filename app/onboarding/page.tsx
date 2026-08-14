import type { Metadata } from "next";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { landingLinks } from "@/lib/platform/links";

/**
 * S2 onboarding — PLACEHOLDER.
 *
 * The wizard itself is Gate C's work and nothing of it is built yet. This route
 * exists at Gate B for one reason: the landing page's second call to action is
 * "Onboard your organization", and a public page shipping a link to a 404 is a
 * defect, not a staging step.
 *
 * So this is deliberately the smallest honest thing — it says what it is and
 * offers the two routes that do work. It does not sketch the wizard, does not
 * invent step names, and does not pre-empt any decision Gate C has to make: it
 * will be replaced wholesale rather than built on.
 *
 * Public, like the landing, and for the same reason — an organization that does
 * not have a workspace yet cannot sign in to ask for one.
 */
export const metadata: Metadata = {
  title: "Onboard your organization — Airawat",
};

export default function OnboardingPlaceholderPage() {
  const links = landingLinks();
  return (
    <NocturneRoot>
      <div className="ax-lp-root">
        <main className="ax-lp-shell" style={{ paddingBlock: 96, maxWidth: 640 }}>
          <p className="ax-section-title">Onboarding</p>
          <h1 className="ax-lp-h2">Guided setup is not open yet</h1>
          <p className="ax-lp-lede">
            The guided setup that takes an organization from its profile to a launched workspace is
            being built. Until it opens, get in touch and we will run the configuration with you.
          </p>
          <div className="ax-lp-actions">
            <a className="btn btn-primary" href={links.signIn}>
              Sign in to an existing workspace
            </a>
            <a className="btn btn-secondary" href={links.platform}>
              Back to the platform overview
            </a>
          </div>
        </main>
      </div>
    </NocturneRoot>
  );
}
