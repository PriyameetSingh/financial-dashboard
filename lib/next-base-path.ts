/**
 * Single source of truth for Next.js `basePath` (must match `next.config.ts`).
 * Env vars are not always present at runtime on the server, so we hard-code it.
 * Used by Auth.js setup and the auth route handler to re-add the basePath that
 * Next.js 16 strips from `req.url` inside App Router route handlers.
 */
export const NEXTJS_BASE_PATH = "/hudd-dashboard" as const;

/**
 * Public pathname including Next.js `basePath`.
 * Use for same-origin `fetch()` URLs: a path like `/api/v1/...` alone resolves to the host root
 * and misses the app when `basePath` is set (browser gets HTML instead of JSON).
 */
export function withNextBasePath(pathname: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!NEXTJS_BASE_PATH) return p;
  if (p === NEXTJS_BASE_PATH || p.startsWith(`${NEXTJS_BASE_PATH}/`)) return p;
  return `${NEXTJS_BASE_PATH}${p}`;
}
