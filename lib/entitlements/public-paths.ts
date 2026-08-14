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
 * sees the page. These are the platform's own pages rather than the product's:
 * a signed-in officer following a link to the pricing page should read the
 * pricing page, not be bounced into their dashboard.
 *
 * Everything here must be safe to serve to an anonymous stranger, which in this
 * codebase means it reads no tenant data at all.
 */
export const PUBLIC_CONTENT_PATHS: ReadonlySet<string> = new Set(["/platform", "/onboarding"]);
