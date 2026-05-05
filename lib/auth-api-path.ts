import { NEXTJS_BASE_PATH } from "@/lib/next-base-path";

/**
 * Auth.js HTTP routes are mounted at `{next.config#basePath}/api/auth`.
 *
 * - Client: `SessionProvider` uses this so fetches hit the prefixed `/api/auth/*`.
 * - Server: `NextAuth({ basePath })` must equal the full public prefix because
 *   `@auth/core`'s `createActionURL` builds OAuth callbacks as
 *   `<AUTH_URL.origin>/<basePath>/<action>`. Note: in Next.js 16 the App Router
 *   strips this prefix from `req.url` inside route handlers, so the auth route
 *   handler re-adds it before delegating to NextAuth (see
 *   `app/api/auth/[...nextauth]/route.ts`).
 */
export function authApiBasePath(): string {
  const nextBase = (
    process.env.__NEXT_ROUTER_BASEPATH ??
    process.env.NEXT_PUBLIC_BASE_PATH ??
    NEXTJS_BASE_PATH
  ).replace(/\/+$/, "");
  return nextBase ? `${nextBase}/api/auth` : "/api/auth";
}
