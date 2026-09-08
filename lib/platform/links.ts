/**
 * Where the public landing's calls to action go.
 *
 * One module, because these are the two links the page exists to produce and
 * they should be changeable without reading the page's markup.
 *
 * The demo destination is environment configuration, not a constant. In this
 * product each tenant is reached on its own host, so "the live demo" is a
 * hostname that differs per deployment and must not be baked into source. When
 * `AIRAWAT_DEMO_URL` is unset the CTA falls back to this deployment's own sign-in
 * page, which is where a visitor with an account actually starts — a degraded
 * destination rather than a broken link.
 *
 * Note this is a PLATFORM env var, not tenant config: it does not belong in
 * `lib/tenant-config/registry.ts`, because it is not a property of any tenant.
 */
import { devPathRoutingEnabled } from "@/lib/dev-path-routing";
import { withNextBasePath } from "@/lib/next-base-path";

/**
 * The slug `prisma/seed_demo_tenant.js` writes for the demonstration workspace
 * (Suryapur Development Authority). Only used to build the local demo link —
 * production still addresses the demo by its own host, via `AIRAWAT_DEMO_URL`.
 */
const DEMO_TENANT_SLUG = "demo";

/** Only absolute http(s) URLs are accepted; anything else is ignored. */
function externalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type LandingLinks = {
  /** The landing itself. Carried here so no page hardcodes the base path. */
  platform: string;
  demo: string;
  /** True when `demo` leaves this deployment — the link then opens in a new tab. */
  demoIsExternal: boolean;
  onboarding: string;
  signIn: string;
  /**
   * `app/fleet/page.tsx` — Airawat staff only, gated server-side by session +
   * `PlatformOperator` membership (404 for anyone else, not 403 — see that
   * file's header). Linking to it from the public landing does not weaken
   * that gate: a visitor without access still gets a 404 on click, exactly as
   * they would from a guessed URL. This is discoverability, not authorization.
   */
  fleet: string;
};

export function landingLinks(): LandingLinks {
  const demo = externalUrl(process.env.AIRAWAT_DEMO_URL);
  // Locally there are no per-tenant hosts, so the demo is a path entry point:
  // `/demo` mints a sandboxed session for the demonstration tenant and lands in
  // its dashboard. An explicitly configured AIRAWAT_DEMO_URL still wins — a
  // developer who set one meant it.
  const localDemo = devPathRoutingEnabled() ? withNextBasePath(`/${DEMO_TENANT_SLUG}`) : null;
  return {
    platform: withNextBasePath("/platform"),
    demo: demo ?? localDemo ?? withNextBasePath("/login"),
    demoIsExternal: demo !== null,
    onboarding: withNextBasePath("/onboarding"),
    signIn: withNextBasePath("/login"),
    fleet: withNextBasePath("/fleet"),
  };
}
