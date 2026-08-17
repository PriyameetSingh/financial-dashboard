import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isModuleRejected, moduleVerdict } from "@/lib/entitlements/guard";
import { loadEnabledModuleCodes } from "@/lib/entitlements/lookup";
import { resolveRouteModule } from "@/lib/entitlements/route-modules";
import { NEXTJS_BASE_PATH, withNextBasePath } from "@/lib/next-base-path";
import { PUBLIC_AUTH_PATHS, PUBLIC_CONTENT_PATHS } from "@/lib/entitlements/public-paths";
import { prismaUnscoped } from "@/lib/prisma";
import { isSessionInvalidated } from "@/lib/session-invalidation";
import { findActiveTenant } from "@/lib/tenant-resolve-db";
import { TENANT_HEADER, TENANT_ID_HEADER, tenantSlugFromHost } from "@/lib/tenant-config/resolution";
import {
  isTenantSessionRejected,
  tenantSessionErrorCode,
  verifyTenantSession,
} from "@/lib/tenant-session";

/**
 * Phase 2 tenancy: build the forwarded request headers. Any client-supplied
 * tenant header is STRIPPED (anti-spoof); the proxy alone derives the slug
 * candidate (from the Host) and sets the internal header the server-side
 * resolver (lib/tenant-context.ts) reads. Validation against the tenants
 * table happens in the resolver, keeping the proxy free of extra DB hits.
 */
function tenantForwardHeaders(request: NextRequest): Headers {
  const forwarded = new Headers(request.headers);
  forwarded.delete(TENANT_HEADER);
  // Anti-spoof: the resolved-id header is stripped unconditionally here and set
  // only by `stampResolvedTenant` below, after a DB-validated resolution.
  forwarded.delete(TENANT_ID_HEADER);
  const slug = tenantSlugFromHost(request.headers.get("host"));
  if (slug) forwarded.set(TENANT_HEADER, slug);
  return forwarded;
}

/** App Router + `fetch()` use the full pathname including `basePath` (e.g. `{basePath}/api/...`). */
function isStaticAssetPath(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return false;
}

function isApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api")) return true;
  if (NEXTJS_BASE_PATH && pathname.startsWith(`${NEXTJS_BASE_PATH}/api`)) return true;
  return false;
}

/**
 * `/api/v1/**` is the authenticated API surface. Middleware verifies a valid
 * session token exists here (defence-in-depth) so a forgotten handler guard
 * does not equal a publicly reachable endpoint. This is AUTHENTICATION ONLY —
 * it does not check any permission and cannot replace per-route `require*`
 * guards, which remain the authoritative authorization layer.
 *
 * `/api/health` and `/api/auth/**` are NOT under `/api/v1` and stay open by
 * construction (liveness probe and NextAuth callbacks).
 */
function isV1ApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/v1")) return true;
  if (NEXTJS_BASE_PATH && pathname.startsWith(`${NEXTJS_BASE_PATH}/api/v1`)) return true;
  return false;
}

/**
 * The public surfaces, defined in `lib/entitlements/public-paths.ts` so they can
 * be asserted against the module map without importing this file (and with it
 * `next-auth/jwt` and the edge runtime) into a test.
 *
 *   PUBLIC_PATHS          auth entry. No session needed; a visitor who has one
 *                         is redirected onward.
 *   PUBLIC_CONTENT_PATHS  the platform's own pages. No session needed, and a
 *                         visitor who has one still sees the page.
 *
 * Two things keep the content surface safe to serve to an anonymous stranger
 * rather than one: `tests/platform-landing.test.ts` pins every content path to a
 * CORE module, and the Prisma chokepoint refuses any tenant-scoped query without
 * a resolved tenant — and none is resolved on that branch. A page added there
 * that tried to read tenant rows would fail loudly, not leak quietly.
 */
const PUBLIC_PATHS = PUBLIC_AUTH_PATHS;

// Static files under `public/` must not require a session; otherwise the proxy returns 307 to /login and assets break.
// In markup, prefix paths with `withNextBasePath()` so requests hit `{basePath}/...`, not the host root.
const PUBLIC_STATIC_EXT = /\.(?:ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|eot|txt|xml|webmanifest)$/i;

/**
 * Auth.js v5 prefixes the session cookie with `__Secure-` when the deployment URL is
 * HTTPS. `getToken` from `next-auth/jwt` defaults to the unprefixed name unless
 * `secureCookie` is explicitly passed, which silently returns `null` in production
 * and bounces signed-in users back to `/login`. Detect HTTPS from the forwarded
 * proto (set by nginx) so this works behind a reverse proxy too.
 */
function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0].trim() === "https";
  return request.nextUrl.protocol === "https:";
}

async function readToken(request: NextRequest) {
  return getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: isSecureRequest(request),
  });
}

/**
 * Resolves why a valid NextAuth token should not be honoured:
 * - `invalidated`: password was reset (admin/self-service) after the session was issued
 * - `account_not_registered`: the SSO identity has no matching row in the `users` table
 *
 * Returns `null` when the token is fine and the request should proceed.
 */
async function getSessionBlockReason(
  token: any,
  tenantId: string | null,
): Promise<"invalidated" | "account_not_registered" | null> {
  if (!token) return null;
  // Middleware runs BEFORE any tenant scope exists, so it uses the unscoped
  // client with an explicit tenant filter. No tenant resolved ⇒ no account can
  // be honoured (deny), never a cross-tenant lookup.
  if (!tenantId) return "account_not_registered";
  try {
    const dbUser = await prismaUnscoped.user.findFirst({
      where: {
        tenantId,
        OR: [
          { code: { equals: token.preferred_username as string, mode: "insensitive" } },
          { email: { equals: token.email as string, mode: "insensitive" } },
        ],
      },
      select: { sessionsInvalidatedAt: true },
    });
    if (!dbUser) return "account_not_registered";
    if (isSessionInvalidated(dbUser.sessionsInvalidatedAt, token.iat as number | undefined)) {
      return "invalidated";
    }
    return null;
  } catch (error) {
    console.error("[proxy] Error checking token invalidation:", error);
  }
  return null;
}

/**
 * Phase 3 — the entitlement gate. THE single enforcement point.
 *
 * Composes as the fourth layer: tenant → ENTITLEMENT → RBAC → data-scope. It runs
 * after the tenant and session are resolved (it needs a trustworthy tenantId) and
 * before RBAC, which still runs in full inside every route handler. This gate
 * only ever removes access; it grants nothing, and it is not an authorization
 * layer — it answers "is this ORGANISATION provisioned for this module?", not
 * "may this USER do this?".
 *
 * It lives here rather than in the handlers because the product's pages are
 * client components with no server-side guard to hang a check on. One point
 * covers all 119 routes; scripts/check-proxy-matcher.mjs proves the matcher
 * reaches every one of them, and scripts/check-route-module-map.mjs proves every
 * one of them maps to a module.
 *
 * Returns a 404 response when the module is off, or `null` to continue.
 *
 * 404 and not 403: a 403 would confirm the module exists and that this tenant
 * has not bought it. 404 leaks nothing about the shape of the product.
 */
async function entitlementDenial(
  pathname: string,
  resolvedTenantId: string | null,
  isApi: boolean,
): Promise<NextResponse | null> {
  // Core routes short-circuit BEFORE any I/O. This is what keeps `/api/health`
  // (a liveness probe) and `/login` free of a database round-trip, and it is why
  // the gate can safely be applied to every path rather than only `/api/v1`.
  if (resolveRouteModule(pathname)?.enforcement === "core") return null;

  const enabled = await loadEnabledModuleCodes(resolvedTenantId);
  const verdict = moduleVerdict(pathname, enabled);
  if (!isModuleRejected(verdict)) return null;

  if (isApi) {
    return NextResponse.json({ detail: "Not Found" }, { status: 404 });
  }
  // Deliberately unbranded and self-contained. The app has no app/not-found.tsx,
  // and a branded, entitlement-aware 404 belongs to the phase that owns the
  // design system — tracked as deferred, not forgotten.
  return new NextResponse(
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Not Found</title></head>" +
      "<body><h1>404</h1><p>This page could not be found.</p></body></html>",
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function logoutRedirect(request: NextRequest, pathname?: string, errorCode?: string) {
  const loginUrl = new URL(withNextBasePath("/login"), request.nextUrl.origin);
  if (pathname && pathname !== "/login") {
    loginUrl.searchParams.set("redirect", pathname);
  }
  if (errorCode) {
    loginUrl.searchParams.set("error", errorCode);
  }
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const forwardHeaders = tenantForwardHeaders(request);
  const forward = () => NextResponse.next({ request: { headers: forwardHeaders } });
  // Resolved lazily (one DB lookup per request at most), memoised so the
  // session-block check, the entitlement gate and the id stamp share it.
  let resolved: string | null | undefined;
  const tenantId = async () => {
    if (resolved === undefined) {
      resolved = (await findActiveTenant(forwardHeaders.get(TENANT_HEADER)))?.id ?? null;
      // Stamp the resolved id for the server runtime. This is what lets the
      // Prisma chokepoint find a tenant inside Route Handlers, where the
      // React-cache-backed holder cannot hold one. Set on `forwardHeaders`, so
      // every later `forward()` carries it.
      if (resolved) forwardHeaders.set(TENANT_ID_HEADER, resolved);
    }
    return resolved;
  };

  if (
    isStaticAssetPath(pathname) ||
    pathname.startsWith("/images") ||
    PUBLIC_STATIC_EXT.test(pathname)
  ) {
    return forward();
  }

  // API surface. `/api/v1/**` requires a verified session token; everything
  // else under `/api` (health, NextAuth callbacks) stays open.
  if (isApiPath(pathname)) {
    // Resolved only on the authenticated surface; stays null for `/api/health`
    // and `/api/auth/**`, which are core and never consult it.
    let apiTenantId: string | null = null;
    if (isV1ApiPath(pathname)) {
      // `getToken` verifies the JWT signature with AUTH_SECRET. A missing or
      // incorrectly signed token resolves to `null` → 401. This is a cheap,
      // in-process check (no DB) — session-invalidation (password reset) is
      // enforced by handler guards via `getDbUserBySession`, not here.
      const token = await readToken(request);
      if (!token) {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }
      // Phase 2: a valid signature is not enough — the token must belong to the
      // tenant this host resolves to. Otherwise a session minted for tenant A
      // and replayed against tenant B's host would be silently scoped into B.
      apiTenantId = await tenantId();
      const verdict = verifyTenantSession(token.tenantId, apiTenantId);
      if (isTenantSessionRejected(verdict)) {
        return NextResponse.json({ detail: tenantSessionErrorCode(verdict) }, { status: 401 });
      }
    }
    // Phase 3: tenant and session are settled; gate the module before the
    // handler's RBAC guards run. Applied to the WHOLE `/api` surface, not just
    // `/api/v1`, so a future gated endpoint outside v1 cannot escape. Core paths
    // short-circuit inside without touching the database.
    const denial = await entitlementDenial(pathname, apiTenantId, true);
    if (denial) return denial;
    return forward();
  }

  if (PUBLIC_CONTENT_PATHS.has(pathname)) {
    // No session is read and no tenant is resolved — there is nothing here that
    // belongs to one. The entitlement gate still runs, so this branch does not
    // become a second way into the app that skips the single enforcement point.
    // `null` is passed for the tenant deliberately: a core module short-circuits
    // before the gate touches the database, and anything else fails closed,
    // which is the correct outcome for a path that should never have been
    // mapped to a gated module in the first place.
    const denial = await entitlementDenial(pathname, null, false);
    if (denial) return denial;
    return forward();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    const token = await readToken(request);
    if (token) {
      const blockReason = await getSessionBlockReason(token, await tenantId());
      if (blockReason) {
        // Session is no longer valid (reset password, or SSO identity has no
        // dashboard account). Clear the cookies so /login can render instead
        // of bouncing back to /dashboard.
        const response = forward();
        response.cookies.delete("authjs.session-token");
        response.cookies.delete("__Secure-authjs.session-token");
        return response;
      }
      // `NextURL` / `new URL("/dashboard", …)` without the segment below resolves to the
      // origin root `/dashboard`, not `{basePath}/dashboard`, so users leave the app.
      return NextResponse.redirect(
        new URL(withNextBasePath("/dashboard"), request.nextUrl.origin),
      );
    }
    return forward();
  }

  const token = await readToken(request);
  if (!token) {
    const loginUrl = new URL(withNextBasePath("/login"), request.nextUrl.origin);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const resolvedTenantId = await tenantId();
  const verdict = verifyTenantSession(token.tenantId, resolvedTenantId);
  if (isTenantSessionRejected(verdict)) {
    // Cookies are cleared by logoutRedirect, so the replayed session cannot be
    // reused against this host.
    return logoutRedirect(request, pathname, tenantSessionErrorCode(verdict));
  }

  const blockReason = await getSessionBlockReason(token, resolvedTenantId);
  if (blockReason) {
    return logoutRedirect(request, pathname, blockReason);
  }

  // Phase 3: same gate, page surface. Runs after the tenant/session checks above
  // and before any page or handler executes.
  const denial = await entitlementDenial(pathname, resolvedTenantId, false);
  if (denial) return denial;

  return forward();
}

/**
 * Matcher coverage is load-bearing: from Phase 3 the entitlement gate lives in
 * this file and nowhere else, so a route the matcher misses silently escapes it.
 *
 * The `"/"` entry is NOT redundant with the catch-all below. Next compiles the
 * catch-all to a regex whose trailing group is REQUIRED — path-to-regexp treats
 * `(…)` as a mandatory parameter, so it cannot match the empty remainder. The
 * app root (`{basePath}` or `/` when `basePath` is empty, i.e. `app/page.tsx`)
 * therefore never matched, and `trailingSlash: false` 308-redirects the
 * trailing-slash spelling back to it, so there was no spelling of the root that
 * entered the proxy at all. Before this entry, the root also escaped the
 * Phase 2 tenant-session binding.
 *
 * scripts/check-proxy-matcher.mjs pins this: it reads the REAL compiled regexes
 * out of the build manifest and asserts every route file's pathname matches one.
 */
export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
