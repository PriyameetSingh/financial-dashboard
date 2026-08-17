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
import type { ThemeOverrides } from "@/components/nocturne/theme";
import { NEXTJS_BASE_PATH } from "@/lib/next-base-path";
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
  /**
   * Next.js `basePath`. Env-only (not stored in the DB). Follows
   * `NEXT_PUBLIC_BASE_PATH` — empty at the domain root, `/hudd-dashboard`
   * for the historical Odisha sub-path deploy.
   */
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
  /**
   * Prefix for generated report filenames, e.g. "HUDD" →
   * `HUDD-meeting-report-2026-01-31.pdf`. Tenant-visible on every download.
   */
  reportFilenamePrefix: string;
  /** Domain labels hardwired in UI copy. */
  labels: TenantLabels;
  /**
   * The tenant's brand colours, as role-name → hex, per theme.
   *
   * Written by the design-system configurator, validated on the way in by
   * `validateConfigValue`, and emitted by `NocturneRoot` as a scoped style
   * block. Empty by default, which is what makes an unconfigured tenant render
   * the platform's own palette.
   *
   * Not secret: these are colours, they are visible on every page the tenant
   * renders, and they travel to the client provider like the rest of this
   * object.
   */
  themeOverrides: ThemeOverrides;
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
  basePath: NEXTJS_BASE_PATH,
  logoPublicPath: "/Frame 1.svg",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  currencySymbol: "₹",
  currencyUnit: "Cr",
  pdfHeaderLine: "Government of Odisha",
  productName: "HUDD Dashboard",
  reportFilenamePrefix: "HUDD",
  labels: {
    soExpenditure: "SO",
    ifmsExpenditure: "IFMS",
    soExpenditureFormal: "S.O.",
    ifmsExpenditureFormal: "IFMS",
  },
  keycloakRealm: "",
  keycloakClientId: "",
  seedAdminEmail: "",
  // Odisha renders the platform palette. An empty object here is what makes
  // "unconfigured" and "byte-identical to the signed-off build" the same thing.
  themeOverrides: {},
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
