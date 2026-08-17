/**
 * Mirrors `lib/next-base-path.ts` for golden scripts that cannot import TS.
 * Keep the two in lockstep: empty / unset / "/" → ""; otherwise a leading-slash
 * prefix with no trailing slash.
 */
export function normalizeNextBasePath(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "");
}

export function nextBasePath(env = process.env) {
  return normalizeNextBasePath(env.NEXT_PUBLIC_BASE_PATH);
}
