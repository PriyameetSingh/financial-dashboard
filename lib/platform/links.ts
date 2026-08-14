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
import { withNextBasePath } from "@/lib/next-base-path";

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
};

export function landingLinks(): LandingLinks {
  const demo = externalUrl(process.env.AIRAWAT_DEMO_URL);
  return {
    platform: withNextBasePath("/platform"),
    demo: demo ?? withNextBasePath("/login"),
    demoIsExternal: demo !== null,
    onboarding: withNextBasePath("/onboarding"),
    signIn: withNextBasePath("/login"),
  };
}
