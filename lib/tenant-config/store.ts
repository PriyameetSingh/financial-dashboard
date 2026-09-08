/**
 * The ONLY sanctioned access path to `tenant_config_entries`.
 *
 * Why this file exists: `TenantConfigEntry` is deliberately listed in
 * GLOBAL_MODELS (lib/tenant-scope-registry.ts), because the resolver must read
 * it BEFORE any tenant scope exists. That is a correct exception, but it has a
 * sharp edge — the Prisma chokepoint does **not** filter this table. A bare
 * `prisma.tenantConfigEntry.findMany()` returns EVERY tenant's config, and a
 * bare `deleteMany({ where: { key } })` wipes every tenant's row for that key.
 *
 * Both mistakes are easy to make and neither fails loudly, so every function
 * here takes `tenantId` as a required first argument, and
 * `scripts/check-tenant-chokepoint.mjs` bans access to the delegate anywhere
 * else. The compiler enforces the scope; the lint enforces the funnel.
 */
import { prisma, type TenantTransactionClient } from "@/lib/prisma";

export type TenantConfigEntryRow = { key: string; value: unknown };

/**
 * Every function below takes an optional Prisma client, defaulting to the
 * request-scoped `prisma`. Callers that must audit a write in the SAME
 * transaction as the mutation (`STD-AUDIT-001`, see `lib/audit.ts`) pass the
 * `tx` from their own `prisma.$transaction`. This is still the only module
 * that touches `tenantConfigEntry` directly — a transaction client is just
 * the same delegate reached through a different handle.
 */
type Client = typeof prisma | TenantTransactionClient;

/** Every stored config row for one tenant. */
export async function readTenantConfigEntries(
  tenantId: string,
  client: Client = prisma,
): Promise<TenantConfigEntryRow[]> {
  requireTenantId(tenantId, "readTenantConfigEntries");
  return client.tenantConfigEntry.findMany({
    where: { tenantId },
    select: { key: true, value: true },
  });
}

/** The single stored row for one tenant/key, or null if unset. */
export async function readTenantConfigEntry(
  tenantId: string,
  key: string,
  client: Client = prisma,
): Promise<TenantConfigEntryRow | null> {
  requireTenantId(tenantId, "readTenantConfigEntry");
  return client.tenantConfigEntry.findUnique({
    where: { tenantId_key: { tenantId, key } },
    select: { key: true, value: true },
  });
}

/** Set one key for one tenant. Callers must have validated the key and value. */
export async function writeTenantConfigEntry(
  tenantId: string,
  key: string,
  value: unknown,
  client: Client = prisma,
): Promise<void> {
  requireTenantId(tenantId, "writeTenantConfigEntry");
  await client.tenantConfigEntry.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { value: value as never },
    create: { tenantId, key, value: value as never },
  });
}

/**
 * Clear one key for one tenant, reverting it to the built-in default.
 * Returns true when a row was actually removed.
 *
 * `deleteMany` scoped by BOTH columns, never by `key` alone — that is the
 * cross-tenant footgun this module exists to prevent.
 */
export async function clearTenantConfigEntry(
  tenantId: string,
  key: string,
  client: Client = prisma,
): Promise<boolean> {
  requireTenantId(tenantId, "clearTenantConfigEntry");
  const { count } = await client.tenantConfigEntry.deleteMany({ where: { tenantId, key } });
  return count > 0;
}

function requireTenantId(tenantId: string, fn: string): void {
  // A caller that passes "" or undefined through a loose type would otherwise
  // read or write ACROSS tenants. Fail loudly instead.
  if (!tenantId) {
    throw new Error(`${fn} requires an explicit tenantId (tenant_config_entries is not auto-scoped)`);
  }
}
