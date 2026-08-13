/**
 * Tenant config — typed keys and Odisha defaults for the Airawat Finance
 * Dashboard master build.
 *
 * Phase 2: the active config is resolved per request from the database
 * (lib/tenant-context.ts) and read here through a request-scoped holder
 * (lib/tenant-config/request-store.ts). An unresolved/unprimed read falls
 * back to ODISHA_DEFAULTS, so an unconfigured app remains bit-for-bit
 * identical to today's signed-off Odisha build. There is no module-global
 * "current tenant" on the server — see request-store.ts for the scoping.
 *
 * Hard rule: never branch on tenant identity in code. Branch on config keys /
 * capability flags only. This file is the single source of truth for those keys.
 */
import { activeHolder } from "./request-store";

export type TenantLabels = {
  /** Compact expenditure-source label, e.g. inline UI copy. Odisha: "SO". */
  soExpenditure: string;
  /** Compact settlement-source label. Odisha: "IFMS". */
  ifmsExpenditure: string;
  /**
   * Formal form used in report column headings, where Odisha writes the
   * abbreviation with stops ("S.O. Exp.", "as per S.O. order") rather than the
   * compact "SO". Kept as its own key so draining those headings to config does
   * not change a single rendered character for Odisha.
   */
  soExpenditureFormal: string;
  /** Formal form for the settlement source in report headings. Odisha: "IFMS". */
  ifmsExpenditureFormal: string;
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
    soExpenditureFormal: "S.O.",
    ifmsExpenditureFormal: "IFMS",
  },
  keycloakRealm: "",
  keycloakClientId: "",
  seedAdminEmail: "",
};

/**
 * Well-known id of the Odisha tenant (tenant #1), created by migration
 * 20260813084800_phase2_odisha_backfill. Used by migrations, seeds, and tests
 * to address the row — never for identity branching in application logic.
 */
export const ODISHA_TENANT_ID = "00000000-0000-4000-8000-000000000001";

/**
 * The active tenant's config. Sync and safe to call hot in render paths.
 *
 * Reads the request-scoped holder primed by the resolver
 * (lib/tenant-context.ts) on the server, or the provider-seeded client holder
 * in the browser. Unprimed reads (static prerender, code paths ahead of the
 * resolver) fall back to ODISHA_DEFAULTS — the fallback direction is default
 * branding, never another tenant's data, because the holder is per-request
 * and starts empty.
 */
export function tenantConfig(): TenantConfig {
  return activeHolder().cfg ?? ODISHA_DEFAULTS;
}
