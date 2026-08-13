import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { NEXTJS_BASE_PATH, withNextBasePath } from "@/lib/next-base-path";
import { prismaUnscoped } from "@/lib/prisma";
import { isSessionInvalidated } from "@/lib/session-invalidation";
import { findActiveTenant } from "@/lib/tenant-resolve-db";
import { TENANT_HEADER, tenantSlugFromHost } from "@/lib/tenant-config/resolution";

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
  const slug = tenantSlugFromHost(request.headers.get("host"));
  if (slug) forwarded.set(TENANT_HEADER, slug);
  return forwarded;
}

/** App Router + `fetch()` use the full pathname including `basePath` (e.g. `/hudd-dashboard/api/...`). */
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

const PUBLIC_PATHS = new Set(["/login"]);

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
  // Resolved lazily: only the session-block checks below need the tenant row.
  const tenantId = async () => (await findActiveTenant(forwardHeaders.get(TENANT_HEADER)))?.id ?? null;

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
    if (isV1ApiPath(pathname)) {
      // `getToken` verifies the JWT signature with AUTH_SECRET. A missing or
      // incorrectly signed token resolves to `null` → 401. This is a cheap,
      // in-process check (no DB) — session-invalidation (password reset) is
      // enforced by handler guards via `getDbUserBySession`, not here.
      const token = await readToken(request);
      if (!token) {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
      }
    }
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

  const blockReason = await getSessionBlockReason(token, await tenantId());
  if (blockReason) {
    return logoutRedirect(request, pathname, blockReason);
  }

  return forward();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
