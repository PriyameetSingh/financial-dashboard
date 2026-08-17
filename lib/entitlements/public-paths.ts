/**
 * The two classes of path that do not require a session.
 *
 * They live here rather than inside `proxy.ts` so a test can read them without
 * importing the proxy, which drags in `next-auth/jwt` and the whole edge
 * runtime. The pairing this makes testable is the one that matters: every
 * public-content path must resolve to a CORE module, because there is no tenant
 * on that branch whose entitlements could be consulted, and a visitor denied
 * there has no account to fix it with.
 */

/**
 * Public AUTH-ENTRY paths. No session required, and a visitor who already has
 * one is redirected onward — nobody wants to sign in twice.
 */
export const PUBLIC_AUTH_PATHS: ReadonlySet<string> = new Set(["/login"]);

/**
 * Public CONTENT paths. No session required, and a visitor who HAS one still
 * sees the page — a session changes nothing about what these say.
 *
 * Mostly the platform's own pages: a signed-in officer following a link to the
 * pricing page should read the pricing page, not be bounced into their
 * dashboard. `/auth/error` is here for the opposite reason. It is the page
 * `auth.ts` names as NextAuth's error target, so a visitor arrives having just
 * FAILED to sign in — with no session, by definition. Listed nowhere, it was
 * caught by the catch-all and redirected to `/login?redirect=/auth/error`,
 * which meant the one page written for people who cannot sign in was reachable
 * only by people who already had. Found by the accessibility audit, which could
 * not load it signed out.
 *
 * It is content rather than auth-entry because auth-entry redirects a
 * session-holder onward, and an error page that silently vanishes for signed-in
 * users is the same class of bug in the other direction.
 *
 * Everything here must be safe to serve to an anonymous stranger, which in this
 * codebase means it reads no tenant data at all.
 */
export const PUBLIC_CONTENT_PATHS: ReadonlySet<string> = new Set([
  "/platform",
  "/onboarding",
  "/auth/error",
]);
