/**
 * Tenant config — typed defaults for the Airawat Finance Dashboard master build.
 *
 * Phase 1: defaults live in this one file. An unconfigured app is bit-for-bit
 * identical to today's signed-off Odisha build, because every default equals
 * the current Odisha value. Runtime DB-backed tenant resolution comes in a
 * later phase; for now `resolveTenantConfig()` returns these defaults.
 *
 * Hard rule: never branch on tenant identity in code. Branch on config keys /
 * capability flags only. This file is the single source of truth for those keys.
 */

export type TenantLabels = {
  /** Sanction Order expenditure label (Odisha vocabulary). */
  soExpenditure: string;
  /** IFMS expenditure label (Odisha vocabulary). */
  ifmsExpenditure: string;
};

export type TenantConfig = {
  /** Next.js `basePath`. Default = today's `/hudd-dashboard`. */
  basePath: string;
  /** Public logo asset path (served from /public). */
  logoPublicPath: string;
  /** IANA timezone for date display. */
  timezone: string;
  /** BCP-47 locale for number/date formatting. */
  locale: string;
  /** Currency symbol prefix for monetary values. */
  currencySymbol: string;
  /** Currency unit suffix (e.g. "Cr" for Crore). */
  currencyUnit: string;
  /** Top-level PDF/report header line. */
  pdfHeaderLine: string;
  /** Product / app display name. */
  productName: string;
  /** Domain labels hardwired in UI copy. */
  labels: TenantLabels;
  /** Keycloak realm (default mirrors KEYCLOAK_REALM env). */
  keycloakRealm: string;
  /** Keycloak client id (default mirrors KEYCLOAK_CLIENT_ID env). */
  keycloakClientId: string;
  /** Bootstrap admin email for seed / first-run. */
  seedAdminEmail: string;
};

/**
 * Odisha defaults — every value equals the current hardcoded Odisha literal.
 * Changing a default here is a behavior change caught by the golden net.
 */
export const ODISHA_DEFAULTS: TenantConfig = {
  basePath: "/hudd-dashboard",
  logoPublicPath: "/Frame 1.svg",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  currencySymbol: "₹",
  currencyUnit: "Cr",
  pdfHeaderLine: "Government of Odisha",
  productName: "HUDD Dashboard",
  labels: {
    soExpenditure: "SO",
    ifmsExpenditure: "IFMS",
  },
  keycloakRealm: "",
  keycloakClientId: "",
  seedAdminEmail: "",
};

/**
 * Resolve the active tenant config. Phase 1: returns the Odisha defaults.
 * A later phase will resolve the tenant at runtime from the database and
 * overlay these as the fallback for any missing key.
 */
export function resolveTenantConfig(): TenantConfig {
  return ODISHA_DEFAULTS;
}

let cached: TenantConfig | null = null;

/** Cached accessor; safe to call hot in render paths. */
export function tenantConfig(): TenantConfig {
  if (!cached) cached = resolveTenantConfig();
  return cached;
}
