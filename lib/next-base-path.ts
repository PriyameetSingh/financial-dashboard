/**
 * Single source of truth for Next.js `basePath` (must match `next.config.ts`).
 *
 * Derived from `NEXT_PUBLIC_BASE_PATH` so a deployment can sit at the domain
 * root (empty / unset — the default) or under the historical Odisha sub-path
 * (`/hudd-dashboard`) without a code change. Next inlines `NEXT_PUBLIC_*` at
 * `next build` / `next dev` start, so this is available in every runtime that
 * the previous hardcoded constant was.
 *
 * Used by Auth.js setup and the auth route handler to re-add the basePath that
 * Next.js 16 strips from `req.url` inside App Router route handlers.
 */
export function normalizeNextBasePath(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "");
}

export const NEXTJS_BASE_PATH = normalizeNextBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

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
