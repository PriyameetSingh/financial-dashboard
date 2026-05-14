import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { NEXTJS_BASE_PATH, withNextBasePath } from "@/lib/next-base-path";

/** App Router + `fetch()` use the full pathname including `basePath` (e.g. `/hudd-dashboard/api/...`). */
function isApiOrAssetPath(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/api")) return true;
  if (NEXTJS_BASE_PATH && pathname.startsWith(`${NEXTJS_BASE_PATH}/api`)) return true;
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isApiOrAssetPath(pathname) ||
    pathname.startsWith("/images") ||
    PUBLIC_STATIC_EXT.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    const token = await readToken(request);
    if (token) {
      // `NextURL` / `new URL("/dashboard", …)` without the segment below resolves to the
      // origin root `/dashboard`, not `{basePath}/dashboard`, so users leave the app.
      return NextResponse.redirect(
        new URL(withNextBasePath("/dashboard"), request.nextUrl.origin),
      );
    }
    return NextResponse.next();
  }

  const token = await readToken(request);
  if (!token) {
    const loginUrl = new URL(withNextBasePath("/login"), request.nextUrl.origin);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
