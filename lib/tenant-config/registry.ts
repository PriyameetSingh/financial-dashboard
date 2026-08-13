/**
 * Typed registry for the tenant_config_entries KV store.
 *
 * The KV table keeps migrations additive (no migration per new config key);
 * type safety lives here instead: every key is declared with its storage
 * class and value shape, DB rows are validated on read, and valid rows are
 * overlaid onto ODISHA_DEFAULTS so any missing/invalid key falls back to
 * today's Odisha value (fail-safe direction: default branding, never another
 * tenant's data).
 *
 * Storage classes:
 *   - "storable":  may live in tenant_config_entries.
 *   - "env-only":  MUST NOT be stored in the DB. basePath is build-bound
 *     (compiled into Next.js); the keycloak keys and seedAdminEmail stay
 *     env-backed in Phase 2. Secret-class values (credentials) are always
 *     env-only — at most a secretRef would ever be storable, never material.
 *
 * Any config write path MUST call `assertStorableKey` before persisting.
 */
import type { TenantConfig, TenantLabels } from "./index";

type StorableKey =
  | "logoPublicPath"
  | "timezone"
  | "locale"
  | "currencySymbol"
  | "currencyUnit"
  | "pdfHeaderLine"
  | "productName"
  | "labels";

const STRING_KEYS: readonly Exclude<StorableKey, "labels">[] = [
  "logoPublicPath",
  "timezone",
  "locale",
  "currencySymbol",
  "currencyUnit",
  "pdfHeaderLine",
  "productName",
];

export const STORABLE_KEYS: readonly StorableKey[] = [...STRING_KEYS, "labels"];

const ENV_ONLY_KEYS = ["basePath", "keycloakRealm", "keycloakClientId", "seedAdminEmail"] as const;

export function isStorableKey(key: string): key is StorableKey {
  return (STORABLE_KEYS as readonly string[]).includes(key);
}

/** Guard for future config write paths: env-only/unknown keys are rejected. */
export function assertStorableKey(key: string): asserts key is StorableKey {
  if ((ENV_ONLY_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Tenant config key "${key}" is env-only and must not be stored in the database`);
  }
  if (!isStorableKey(key)) {
    throw new Error(`Unknown tenant config key "${key}"`);
  }
}

/**
 * Merge a stored labels object over the defaults, keeping only known string
 * keys. A partial object is valid: a row written before a label key existed
 * still yields the default for that key rather than dropping the whole object.
 */
function mergeLabels(defaults: TenantLabels, value: unknown): TenantLabels {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return defaults;
  const incoming = value as Record<string, unknown>;
  const merged = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof TenantLabels)[]) {
    if (typeof incoming[key] === "string") merged[key] = incoming[key] as string;
  }
  return merged;
}

export type TenantConfigRow = { key: string; value: unknown };

/**
 * Overlay validated DB rows onto the defaults. Unknown keys, env-only keys,
 * and shape-invalid values are ignored (fall back to the default) — a
 * malformed row can degrade a tenant to default branding but can never break
 * rendering or leak across tenants.
 */
export function overlayConfigEntries(
  defaults: TenantConfig,
  rows: readonly TenantConfigRow[],
): TenantConfig {
  const config: TenantConfig = { ...defaults, labels: { ...defaults.labels } };
  for (const row of rows) {
    if (!isStorableKey(row.key)) continue;
    if (row.key === "labels") {
      config.labels = mergeLabels(defaults.labels, row.value);
      continue;
    }
    if (typeof row.value === "string") {
      config[row.key] = row.value;
    }
  }
  return config;
}
