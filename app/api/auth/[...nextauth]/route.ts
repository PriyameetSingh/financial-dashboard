import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { NEXTJS_BASE_PATH } from "@/lib/next-base-path";

/**
 * Next.js 16 strips the configured `basePath` from the request URL inside App Router
 * route handlers, so `req.url` here is `/api/auth/<action>` even though the public
 * URL is `{basePath}/api/auth/<action>` (or `/api/auth/<action>` when `basePath` is
 * empty).
 *
 * Auth.js (`@auth/core`) parses the action from `new URL(req.url).pathname` and
 * matches it against `config.basePath`. We must keep `config.basePath` set to the
 * full public prefix (`{basePath}/api/auth`) because `@auth/core`'s
 * `createActionURL` builds OAuth callback URLs as `<AUTH_URL.origin>/<basePath>/<action>` —
 * shrinking it would produce a callback URL without the Next.js `basePath` and break
 * the Keycloak flow.
 *
 * To bridge the two, we re-add the Next.js basePath to the incoming request's URL
 * before delegating to NextAuth's handlers.
 */
function withRestoredBasePath(
  handler: (req: NextRequest) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
  if (!NEXTJS_BASE_PATH) return handler;
  const prefix = NEXTJS_BASE_PATH;
  return async (req) => {
    const url = new URL(req.url);
    if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
      return handler(req);
    }
    url.pathname = `${prefix}${url.pathname.startsWith("/") ? "" : "/"}${url.pathname}`;
    return handler(new NextRequest(url, req));
  };
}

export const GET = withRestoredBasePath(handlers.GET);
export const POST = withRestoredBasePath(handlers.POST);
