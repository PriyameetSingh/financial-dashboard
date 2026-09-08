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
 *     (compiled into Next.js from NEXT_PUBLIC_BASE_PATH); the keycloak keys and seedAdminEmail stay
 *     env-backed in Phase 2. Secret-class values (credentials) are always
 *     env-only — at most a secretRef would ever be storable, never material.
 *
 * Any config write path MUST call `assertStorableKey` before persisting.
 */
import type { TenantConfig, TenantLabels } from "./index";
import { sanitizeRoleValues, THEME_ROLES, type ThemeOverrides } from "@/components/nocturne/theme";

/** Role names a tenant may set, for telling "wrong value" from "wrong key". */
const THEME_ROLE_NAMES: ReadonlySet<string> = new Set(THEME_ROLES.map((role) => role.token));

type StorableKey =
  | "themeOverrides"
  | "logoPublicPath"
  | "timezone"
  | "locale"
  | "currencySymbol"
  | "currencyUnit"
  | "pdfHeaderLine"
  | "productName"
  | "reportFilenamePrefix"
  | "labels";

const STRING_KEYS: readonly Exclude<StorableKey, "labels">[] = [
  "logoPublicPath",
  "timezone",
  "locale",
  "currencySymbol",
  "currencyUnit",
  "pdfHeaderLine",
  "productName",
  "reportFilenamePrefix",
];

export const STORABLE_KEYS: readonly StorableKey[] = [...STRING_KEYS, "labels", "themeOverrides"];

/**
 * Storable keys whose default is "nothing stored", so an unconfigured tenant
 * has NO row for them.
 *
 * Every other storable key is seeded from `ODISHA_DEFAULTS` by migration, which
 * is what makes the seeded config a byte-identical reproduction of the
 * defaults object. `themeOverrides` is the first key where that would be wrong:
 * its default is the empty object, and writing an empty row would both add
 * noise and destroy the one useful signal the row carries — whether this
 * tenant has chosen its own colours at all.
 *
 * `tests/tenant-config-db-roundtrip.test.ts` reads this, so a future key of the
 * same kind is a deliberate entry here rather than a test edited to go green.
 */
export const UNSET_BY_DEFAULT_KEYS: readonly StorableKey[] = ["themeOverrides"];

const ENV_ONLY_KEYS = ["basePath", "keycloakRealm", "keycloakClientId", "seedAdminEmail"] as const;

/**
 * SECRET class — credentials a tenant may configure but that must never be
 * READ BACK in cleartext through any API.
 *
 * These are deliberately NOT part of `TenantConfig`: they are never rendered,
 * so they must never join the object that `tenantConfig()` hands to components
 * and serialises into the client provider payload. `overlayConfigEntries`
 * ignores unknown keys, so a stored secret row cannot leak into rendering even
 * by accident.
 *
 * Write is allowed; read returns presence only (`isSet`), never material.
 */
const SECRET_KEYS = ["llmApiKey"] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];
export type ConfigKeyClass = "storable" | "env-only" | "secret" | "unknown";

export function isStorableKey(key: string): key is StorableKey {
  return (STORABLE_KEYS as readonly string[]).includes(key);
}

export function isSecretKey(key: string): key is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

export function isEnvOnlyKey(key: string): boolean {
  return (ENV_ONLY_KEYS as readonly string[]).includes(key);
}

/** The storage class of a config key. The write path branches on this. */
export function configKeyClass(key: string): ConfigKeyClass {
  if (isEnvOnlyKey(key)) return "env-only";
  if (isSecretKey(key)) return "secret";
  if (isStorableKey(key)) return "storable";
  return "unknown";
}

/** Every key the admin API will talk about, with its class. */
export function listConfigKeys(): { key: string; class: ConfigKeyClass }[] {
  return [
    ...STORABLE_KEYS.map((key) => ({ key, class: "storable" as const })),
    ...SECRET_KEYS.map((key) => ({ key, class: "secret" as const })),
  ];
}

/** Guard for config write paths: env-only/unknown keys are rejected. */
export function assertStorableKey(key: string): asserts key is StorableKey {
  if (isEnvOnlyKey(key)) {
    throw new Error(`Tenant config key "${key}" is env-only and must not be stored in the database`);
  }
  if (!isStorableKey(key)) {
    throw new Error(`Unknown tenant config key "${key}"`);
  }
}

/**
 * Per-key value validation (backlog P4).
 *
 * The KV store kept migrations additive at the cost of column types, so until
 * now nothing stopped `locale: "not-a-locale"` from being written and read back
 * — it would simply degrade that tenant to defaults at render time, silently.
 * The write path is the only place this can be caught, so it is caught here.
 *
 * Returns null when valid, or a human-readable reason. Deliberately returns a
 * reason rather than throwing so the API can answer 400 with the reason intact.
 */
export function validateConfigValue(key: string, value: unknown): string | null {
  const cls = configKeyClass(key);
  if (cls === "env-only") return `"${key}" is env-only and must not be stored in the database`;
  if (cls === "unknown") return `Unknown tenant config key "${key}"`;

  if (cls === "secret") {
    if (typeof value !== "string" || value.length === 0) return `"${key}" must be a non-empty string`;
    if (value.length > 4096) return `"${key}" is too long (max 4096 characters)`;
    return null;
  }

  if (key === "labels") return validateLabels(value);
  if (key === "themeOverrides") return validateThemeOverrides(value);

  if (typeof value !== "string") return `"${key}" must be a string`;
  if (value.trim().length === 0) return `"${key}" must not be empty`;
  if (value.length > 512) return `"${key}" is too long (max 512 characters)`;

  switch (key) {
    case "locale":
      return isValidLocale(value) ? null : `"${value}" is not a valid BCP-47 locale (e.g. "en-IN")`;
    case "timezone":
      return isValidTimezone(value) ? null : `"${value}" is not a valid IANA timezone (e.g. "Asia/Kolkata")`;
    case "currencySymbol":
      return value.length <= 8 ? null : `currencySymbol is too long (max 8 characters)`;
    case "currencyUnit":
      return value.length <= 16 ? null : `currencyUnit is too long (max 16 characters)`;
    case "reportFilenamePrefix":
      // Interpolated into a Content-Disposition filename, so keep it to
      // characters that cannot break the header or escape a directory.
      return /^[A-Za-z0-9._-]{1,32}$/.test(value)
        ? null
        : `reportFilenamePrefix must be 1-32 characters of A-Z, a-z, 0-9, dot, underscore or hyphen`;
    case "logoPublicPath":
      return isValidAssetPath(value)
        ? null
        : `logoPublicPath must be a root-relative path ("/logo.svg") or an https URL`;
    default:
      return null;
  }
}

/**
 * The design-system configurator's write path — the live end of the injection
 * boundary built at Gate A.
 *
 * These values are chosen by a tenant administrator, stored, and emitted inside
 * a `<style>` element on every page that tenant renders. That is the whole
 * attack surface in one sentence, and it is why validation happens HERE, on the
 * way in, rather than at render time: a value that reaches the database is a
 * value some future renderer may trust.
 *
 * The rule is allowlist-and-reject, not escape. `sanitizeRoleValues` keeps only
 * known role names carrying plain hex colours and silently drops the rest —
 * which is right for the generator, whose job is to never emit something
 * dangerous. It is wrong for a write path, because an administrator who typed
 * something wrong deserves to be told rather than to save a theme that quietly
 * lost half its values. So: sanitize, then compare, and reject if anything was
 * dropped, naming what.
 *
 * Kept in this file rather than in `components/nocturne/theme.ts` so that every
 * config key is validated in one place, and so `validateConfigValue` remains
 * the single answer to "may this be stored?".
 */
/** Keeps only known roles carrying plain hex, per theme. Never throws. */
function sanitizeThemeOverrides(value: unknown): ThemeOverrides {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const clean: ThemeOverrides = {};
  for (const theme of ["dark", "light"] as const) {
    const roles = record[theme];
    if (roles === null || typeof roles !== "object" || Array.isArray(roles)) continue;
    const kept = sanitizeRoleValues(roles as never);
    if (Object.keys(kept).length > 0) clean[theme] = kept;
  }
  return clean;
}

function validateThemeOverrides(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return `"themeOverrides" must be an object with optional "dark" and "light" keys`;
  }

  const record = value as Record<string, unknown>;
  const themes = Object.keys(record);
  const unexpected = themes.filter((theme) => theme !== "dark" && theme !== "light");
  if (unexpected.length > 0) {
    return `"themeOverrides" only accepts "dark" and "light" (got ${unexpected.map((t) => JSON.stringify(t)).join(", ")})`;
  }

  for (const theme of themes) {
    const roles = record[theme];
    if (roles === undefined) continue;
    if (roles === null || typeof roles !== "object" || Array.isArray(roles)) {
      return `"themeOverrides.${theme}" must be an object of role names to hex colours`;
    }
    const asRecord = roles as Record<string, unknown>;
    const kept = sanitizeRoleValues(asRecord as never);
    for (const role of Object.keys(asRecord)) {
      if (!(role in kept)) {
        const supplied = asRecord[role];
        const reason = THEME_ROLE_NAMES.has(role)
          ? `must be a hex colour like "#5fa8a0" (got ${JSON.stringify(supplied)})`
          : "is not a colour a tenant may set";
        return `"themeOverrides.${theme}.${role}" ${reason}`;
      }
    }
  }

  return null;
}

function isValidLocale(value: string): boolean {
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    // getCanonicalLocales accepts structurally-valid tags; require a language
    // subtag of the usual shape so "zz" style typos with no region still pass
    // but "1234" does not.
    return typeof canonical === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(canonical);
  } catch {
    return false;
  }
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Root-relative path (served from `public/`) or an https URL. Rejects `http:`
 * and `javascript:` — this value is interpolated into an `<img src>`.
 */
function isValidAssetPath(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateLabels(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `"labels" must be an object`;
  }
  const known = new Set<keyof TenantLabels>([
    "soExpenditure",
    "ifmsExpenditure",
    "soExpenditureFormal",
    "ifmsExpenditureFormal",
  ]);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!known.has(k as keyof TenantLabels)) return `Unknown label "${k}"`;
    if (typeof v !== "string" || v.trim().length === 0) return `Label "${k}" must be a non-empty string`;
    if (v.length > 64) return `Label "${k}" is too long (max 64 characters)`;
  }
  return null;
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

export type TenantConfigEntryReport = {
  key: string;
  class: ConfigKeyClass;
  isSet: boolean;
  customized: boolean;
  value: unknown;
  default?: unknown;
};

/**
 * The customized-vs-default report (Phase 2 §2b): which keys currently differ
 * from `defaults`, computed directly from the stored rows at read time — no
 * separate drift store to go stale. Shared by the tenant-config admin API
 * (`app/api/v1/admin/tenant-config/route.ts`) and Fleet Console (Phase 5,
 * `app/fleet/page.tsx`) so there is exactly one place that decides what
 * "customized" means; neither re-derives the comparison.
 */
export function buildConfigEntriesReport(
  defaults: TenantConfig,
  rows: readonly TenantConfigRow[],
): { entries: TenantConfigEntryReport[]; customizedKeys: string[] } {
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const effective = overlayConfigEntries(defaults, rows);

  const customizedKeys: string[] = [];
  const entries = listConfigKeys().map(({ key, class: cls }) => {
    const isSet = stored.has(key);
    if (cls === "secret") {
      // Presence only. The material never crosses this boundary.
      if (isSet) customizedKeys.push(key);
      return { key, class: cls, isSet, customized: isSet, value: null };
    }
    const value = (effective as Record<string, unknown>)[key] ?? null;
    const defaultValue = (defaults as Record<string, unknown>)[key] ?? null;
    const customized = JSON.stringify(value) !== JSON.stringify(defaultValue);
    if (customized) customizedKeys.push(key);
    return { key, class: cls, isSet, customized, value, default: defaultValue };
  });

  return { entries, customizedKeys };
}

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
    if (row.key === "themeOverrides") {
      // Re-sanitised on the way OUT as well as on the way in. The write path is
      // the boundary that matters, but a row can also arrive from a migration,
      // a restored backup, or a direct database edit — none of which passed
      // through `validateConfigValue`. Sanitising here costs a few object
      // allocations per request and removes "the database is trusted" from the
      // list of things this has to be true for.
      config.themeOverrides = sanitizeThemeOverrides(row.value);
      continue;
    }
    if (typeof row.value === "string") {
      config[row.key] = row.value as TenantConfig[typeof row.key] & string;
    }
  }
  return config;
}
