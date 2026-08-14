/**
 * Tenant resolution primitives shared by the proxy (middleware) and the
 * server-side resolver. Pure — no Next.js, Prisma, or Node-only imports, so
 * this module is safe in every runtime (middleware, RSC, client bundle).
 */

/**
 * Internal header carrying the tenant slug candidate from the proxy to the
 * server runtime. The proxy STRIPS any client-supplied value before setting
 * its own (anti-spoof) — application code must only ever read it, never trust
 * it from the raw incoming request.
 */
export const TENANT_HEADER = "x-airawat-tenant";

/**
 * Internal header carrying the RESOLVED tenant id (not a candidate slug) from
 * the proxy to the server runtime. Like TENANT_HEADER it is stripped from every
 * inbound request before the proxy sets its own value, so it can never be
 * supplied by a client.
 *
 * Why it exists: the request-scoped holder (request-store.ts) is backed by
 * React `cache()`, which only memoises inside a render scope. Route Handlers
 * are not one, so a value primed there is written to a throwaway object and the
 * Prisma chokepoint sees no tenant — every authenticated `/api/v1/**` request
 * failed with TenantScopeError. This header is the one request-scoped channel
 * that is reliable in BOTH RSC and Route Handlers, because `headers()` is
 * exactly what Next guarantees per request.
 *
 * It carries an id the proxy already validated against `tenants` (active row),
 * so trusting it inside the app is the same trust as TENANT_HEADER: derived by
 * the proxy, never by the caller.
 */
export const TENANT_ID_HEADER = "x-airawat-tenant-id";

/**
 * Derive a tenant slug candidate from the request Host, Phase 2 hook:
 * `<slug>.<domain>.<tld>` → `<slug>`. Returns null (→ unresolved policy) for
 * bare domains, localhost, IPs, and the `www` label. A tenant_domains mapping
 * table can replace this in a later phase without touching callers.
 */
export function tenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const name = host.split(":")[0].toLowerCase();
  if (/^[0-9.]+$/.test(name) || name.includes("]")) return null; // IPv4 / IPv6
  const labels = name.split(".");
  if (labels.length < 3) return null; // bare domain or localhost
  const candidate = labels[0];
  if (!candidate || candidate === "www") return null;
  return candidate;
}
