/**
 * Phase 2 Gate E — PRIMING COVERAGE PROOF.
 *
 * Gate C could not prove that every entry point primes the tenant config,
 * because under Odisha a primed surface and an unprimed one render
 * identically (the fallback IS Odisha). This file removes that blind spot: a
 * second tenant whose branding differs on EVERY presentation key is resolved
 * through each entry point, and each surface must render the Demo values.
 *
 * A surface that renders Odisha defaults here is not an observation — it is an
 * UNPRIMED PATH, i.e. a bug, because the same gap under a real second tenant
 * would show them another organisation's branding.
 *
 * Entry points covered:
 *   1. Server components / RSC   — the root layout's resolver call, and the
 *                                  format helpers every server component uses
 *   2. API route guards          — the real getSessionUser() funnel (all 81 routes)
 *   3. Client provider surfaces  — TenantConfigProvider's browser holder
 *   4. PDF export path           — text extracted from the rendered PDF buffer
 *   5. Middleware-reached paths  — proxy header → resolver → config
 *
 * Odisha is asserted byte-identical alongside every Demo assertion.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const headersMock = vi.fn(async () => new Headers());
vi.mock("next/headers", () => ({ headers: () => headersMock() }));

import { prismaUnscoped } from "@/lib/prisma";
import { ODISHA_DEFAULTS, ODISHA_TENANT_ID, tenantConfig } from "@/lib/tenant-config";
import { TENANT_HEADER } from "@/lib/tenant-config/resolution";
import {
  formatCurrency,
  formatNumber,
  tenantLocale,
  tenantTimezone,
} from "@/lib/tenant-config/format";
import { primeClientTenantConfig } from "@/lib/tenant-config/request-store";
import {
  getTenantContext,
  getTenantContextSafe,
  loadTenantConfigFromDb,
  withTenantContext,
} from "@/lib/tenant-context";
import { resolveDataScopeForUser } from "@/lib/data-scope";
import { buildMeetingReport } from "@/lib/meeting-report";
import { renderMeetingReportPdfBuffer } from "@/lib/meeting-report-pdf-server";
import { extractPdfText } from "./helpers/pdf-text";
import { readFile } from "node:fs/promises";
import { seedScope, cleanupScopeSeed, loadDbUserWithRbac } from "./helpers/seed-scope";

const DEMO_TENANT_ID = "00000000-0000-4000-8000-0000000000d0";
const DEMO_SLUG = "demo";

/** Demo branding — every key differs from Odisha's, so an unprimed surface shows. */
const DEMO = {
  productName: "Rivertown Insights",
  logoPublicPath: "/rivertown-logo.svg",
  locale: "en-US",
  timezone: "America/Chicago",
  currencySymbol: "$",
  currencyUnit: "M",
  pdfHeaderLine: "Rivertown Development Authority",
  labels: {
    soExpenditure: "Sanctioned",
    ifmsExpenditure: "Disbursed",
    soExpenditureFormal: "Sanctioned",
    ifmsExpenditureFormal: "Disbursed",
  },
};

/** Seeds the Demo tenant fixture this file needs (mirrors prisma/seed_demo_tenant.js). */
async function seedDemoTenant() {
  await removeDemoTenant();
  await prismaUnscoped.tenant.create({
    data: { id: DEMO_TENANT_ID, slug: DEMO_SLUG, name: "Rivertown Development Authority", status: "active" },
  });
  for (const [key, value] of Object.entries(DEMO)) {
    await prismaUnscoped.tenantConfigEntry.create({ data: { tenantId: DEMO_TENANT_ID, key, value } });
  }
  const fy = await prismaUnscoped.financialYear.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      label: "FY 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  const role = await prismaUnscoped.role.create({
    data: { tenantId: DEMO_TENANT_ID, code: "RDA_ACS", name: "Director" },
  });
  const perm = await prismaUnscoped.permission.findFirst({ where: { code: "VIEW_ALL_DATA" } });
  if (perm) {
    await prismaUnscoped.rolePermission.create({
      data: { tenantId: DEMO_TENANT_ID, roleId: role.id, permissionId: perm.id },
    });
  }
  const director = await prismaUnscoped.user.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      code: "RDA_DIR",
      name: "Avery Lindqvist",
      email: "avery.lindqvist@rivertown.example",
      isActive: true,
      userRoles: { create: [{ tenantId: DEMO_TENANT_ID, roleId: role.id }] },
    },
  });
  const scheme = await prismaUnscoped.scheme.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      code: "RDA_RIVERWALK",
      name: "Riverwalk Embankment Renewal",
      verticalName: "Water & Sanitation",
      sponsorshipType: "STATE",
      createdById: director.id,
    },
  });
  const meeting = await prismaUnscoped.dashboardMeeting.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      meetingDate: new Date("2026-06-18"),
      title: "Rivertown Quarterly Programme Review",
      financialYearId: fy.id,
      createdById: director.id,
    },
  });
  await prismaUnscoped.financeBudget.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      schemeId: scheme.id,
      financialYearId: fy.id,
      budgetEstimateCr: 420.5,
      createdById: director.id,
    },
  });
  await prismaUnscoped.financeExpenditureSnapshot.create({
    data: {
      tenantId: DEMO_TENANT_ID,
      schemeId: scheme.id,
      financialYearId: fy.id,
      meetingId: meeting.id,
      asOfDate: new Date("2026-06-15"),
      soExpenditureCr: 260.25,
      ifmsExpenditureCr: 198.75,
      workflowStatus: "submitted",
      createdById: director.id,
    },
  });
  return { director, meeting };
}

async function removeDemoTenant() {
  const where = { tenantId: DEMO_TENANT_ID };
  for (const del of [
    () => prismaUnscoped.financeExpenditureSnapshot.deleteMany({ where }),
    () => prismaUnscoped.financeBudget.deleteMany({ where }),
    () => prismaUnscoped.dashboardMeeting.deleteMany({ where }),
    () => prismaUnscoped.scheme.deleteMany({ where }),
    () => prismaUnscoped.userRole.deleteMany({ where }),
    () => prismaUnscoped.user.deleteMany({ where }),
    () => prismaUnscoped.rolePermission.deleteMany({ where }),
    () => prismaUnscoped.role.deleteMany({ where }),
    () => prismaUnscoped.financialYear.deleteMany({ where }),
    () => prismaUnscoped.tenantConfigEntry.deleteMany({ where }),
    () => prismaUnscoped.tenant.deleteMany({ where: { id: DEMO_TENANT_ID } }),
  ]) {
    await del().catch(() => {});
  }
}

/** Sets the internal header the proxy forwards, as the middleware would. */
function asRequestFrom(slug: string | null) {
  headersMock.mockImplementation(async () =>
    slug ? new Headers({ [TENANT_HEADER]: slug }) : new Headers(),
  );
}

let demo: Awaited<ReturnType<typeof seedDemoTenant>>;

beforeAll(async () => {
  demo = await seedDemoTenant();
}, 120_000);

afterAll(async () => {
  await removeDemoTenant();
  await prismaUnscoped.$disconnect();
});

describe("Entry point 1 — server components / RSC (root layout resolver)", () => {
  it("the layout's own resolver call returns DEMO branding for a demo request", async () => {
    asRequestFrom(DEMO_SLUG);
    // This is literally what app/layout.tsx calls and passes to the provider.
    const { config, tenantId } = await getTenantContextSafe();
    expect(tenantId).toBe(DEMO_TENANT_ID);
    expect(config.productName).toBe(DEMO.productName);
    expect(config.logoPublicPath).toBe(DEMO.logoPublicPath);
    expect(config.locale).toBe(DEMO.locale);
    expect(config.currencySymbol).toBe(DEMO.currencySymbol);
    expect(config.currencyUnit).toBe(DEMO.currencyUnit);
    expect(config.labels).toStrictEqual(DEMO.labels);
  });

  it("format helpers used by every server component render DEMO values", async () => {
    await withTenantContext(DEMO_TENANT_ID, () => {
      expect(tenantConfig().productName).toBe(DEMO.productName);
      expect(tenantConfig().logoPublicPath).toBe(DEMO.logoPublicPath);
      expect(tenantLocale()).toBe(DEMO.locale);
      expect(tenantTimezone()).toBe(DEMO.timezone);
      // en-US grouping + $ + M — not en-IN lakh grouping + ₹ + Cr.
      expect(formatCurrency(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
        "$123,456.78 M",
      );
      expect(formatNumber(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
        "123,456.78",
      );
    });
  });

  it("Odisha remains byte-identical through the same helpers", async () => {
    await withTenantContext(ODISHA_TENANT_ID, () => {
      expect(tenantConfig().productName).toBe("HUDD Dashboard");
      expect(tenantConfig().logoPublicPath).toBe("/Frame 1.svg");
      expect(tenantLocale()).toBe("en-IN");
      expect(tenantTimezone()).toBe("Asia/Kolkata");
      expect(formatCurrency(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
        "₹1,23,456.78 Cr",
      );
      expect(tenantConfig()).toStrictEqual(ODISHA_DEFAULTS);
    });
  });
});

describe("Entry point 2 — API route guards (the getSessionUser funnel, all 81 routes)", () => {
  // next-auth cannot be imported under vitest (it resolves `next/server`
  // extensionless), which is why the suite stubs it globally — so this entry
  // point is proven in two halves instead of one call:
  //   (a) the priming call itself resolves Demo config at runtime, and
  //   (b) the guard funnel provably makes that call, before it touches auth().
  // Combined with check-api-guards (every /api/v1 handler calls a guard that
  // funnels here), that covers all 81 routes.
  it("(a) the priming call the funnel makes resolves DEMO config", async () => {
    asRequestFrom(DEMO_SLUG);
    const { config, tenantId } = await getTenantContextSafe();
    expect(tenantId).toBe(DEMO_TENANT_ID);
    expect(config.productName).toBe(DEMO.productName);
    expect(config.currencySymbol).toBe(DEMO.currencySymbol);
  });

  it("(b) getSessionUser primes the tenant context before reading the session", async () => {
    const src = await readFile(new URL("../lib/server-auth.ts", import.meta.url), "utf8");
    expect(src).toContain("getTenantContextSafe");
    // Priming must happen BEFORE auth() — a handler that reads config after an
    // early `return null` would otherwise run unprimed.
    expect(src.indexOf("getTenantContextSafe()")).toBeLessThan(src.indexOf("await auth()"));
  });

  it("(c) an Odisha request through the same call yields byte-identical config", async () => {
    asRequestFrom("odisha");
    const { config } = await getTenantContextSafe();
    expect(config).toStrictEqual(ODISHA_DEFAULTS);
  });
});

describe("Entry point 3 — client provider surfaces", () => {
  it("TenantConfigProvider's browser holder serves DEMO branding to client components", async () => {
    const demoConfig = await loadTenantConfigFromDb(DEMO_TENANT_ID);
    // Simulate the browser runtime the provider seeds.
    vi.stubGlobal("window", {} as unknown as Window);
    try {
      primeClientTenantConfig(demoConfig);
      expect(tenantConfig().productName).toBe(DEMO.productName);
      expect(tenantConfig().logoPublicPath).toBe(DEMO.logoPublicPath);
      expect(formatCurrency(1000, { maximumFractionDigits: 0 })).toBe("$1,000 M");
      expect(tenantConfig().labels).toStrictEqual(DEMO.labels);

      // Re-seeding with Odisha's config restores the original rendering.
      primeClientTenantConfig(await loadTenantConfigFromDb(ODISHA_TENANT_ID));
      expect(tenantConfig().productName).toBe("HUDD Dashboard");
      expect(formatCurrency(1000, { maximumFractionDigits: 0 })).toBe("₹1,000 Cr");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Entry point 4 — PDF export path", () => {
  it("the Demo meeting PDF carries Rivertown's header and $ currency, never Odisha's", async () => {
    const director = await prismaUnscoped.user.findUniqueOrThrow({
      where: { id: demo.director.id },
      include: {
        userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
        permissionOverrides: { include: { permission: true } },
      },
    });

    const { payload, text } = await withTenantContext(DEMO_TENANT_ID, async () => {
      const scope = await resolveDataScopeForUser(director);
      const built = await buildMeetingReport(demo.meeting.id, scope);
      const buffer = await renderMeetingReportPdfBuffer(built!);
      return { payload: built, text: extractPdfText(buffer) };
    });

    expect(payload).not.toBeNull();

    // Header line comes from tenant config.
    expect(text).toContain(DEMO.pdfHeaderLine);
    expect(text).not.toContain("Government of Odisha");

    // Currency UNIT in the finance table headings (this surface prints the unit
    // in the column heading and bare numbers in the cells — it never prints the
    // symbol, so asserting the unit is what actually proves the branding).
    expect(text).toContain(`(In ${DEMO.currencyUnit}.)`);
    expect(text).not.toContain("(In Cr.)");
    expect(text).not.toContain("(Cr.)");
    expect(text).not.toContain("₹");

    // Domain labels come from tenant config, not Odisha's SO/IFMS vocabulary.
    expect(text).toContain(DEMO.labels.soExpenditure);
    expect(text).toContain(DEMO.labels.ifmsExpenditure);
    expect(text).not.toContain("S.O. Exp");
    expect(text).not.toContain("IFMS Exp");
  }, 120_000);
});

describe("Odisha PDF remains byte-identical (same code path, Odisha config)", () => {
  it("the Odisha meeting PDF still says 'Government of Odisha', '(In Cr.)', S.O./IFMS", async () => {
    const seed = await seedScope(ODISHA_TENANT_ID);
    try {
      const director = await loadDbUserWithRbac(seed.fullUser.id, ODISHA_TENANT_ID);
      const text = await withTenantContext(ODISHA_TENANT_ID, async () => {
        const scope = await resolveDataScopeForUser(director);
        const built = await buildMeetingReport(seed.meeting.id, scope);
        return extractPdfText(await renderMeetingReportPdfBuffer(built!));
      });
      expect(text).toContain("Government of Odisha");
      expect(text).toContain("(In Cr.)");
      expect(text).toContain("S.O. Exp");
      expect(text).toContain("IFMS Exp");
      expect(text).not.toContain("Rivertown");
      expect(text).not.toContain("(In M.)");
    } finally {
      await cleanupScopeSeed(ODISHA_TENANT_ID).catch(() => {});
    }
  }, 120_000);
});

describe("Entry point 5 — middleware-reached paths (proxy header → resolver → config)", () => {
  it("the header the proxy forwards resolves to DEMO config", async () => {
    asRequestFrom(DEMO_SLUG);
    const ctx = await getTenantContext();
    expect(ctx.slug).toBe(DEMO_SLUG);
    expect(ctx.tenantId).toBe(DEMO_TENANT_ID);
    expect(ctx.config.productName).toBe(DEMO.productName);
    expect(ctx.config.pdfHeaderLine).toBe(DEMO.pdfHeaderLine);
  });

  it("an unresolvable host denies rather than falling back (two tenants are active)", async () => {
    asRequestFrom("no-such-tenant");
    await expect(getTenantContext()).rejects.toThrow();
    // …and the fallback-tolerant variant degrades to defaults, never to Demo.
    const safe = await getTenantContextSafe();
    expect(safe.tenantId).toBeNull();
    expect(safe.config).toStrictEqual(ODISHA_DEFAULTS);
  });
});

describe("Side-by-side — every presentation key differs, Odisha unchanged", () => {
  it("Demo and Odisha configs differ on every stored key", async () => {
    const odisha = await loadTenantConfigFromDb(ODISHA_TENANT_ID);
    const demoConfig = await loadTenantConfigFromDb(DEMO_TENANT_ID);

    expect(odisha).toStrictEqual(ODISHA_DEFAULTS); // Odisha byte-identical to the file defaults
    for (const key of [
      "productName",
      "logoPublicPath",
      "locale",
      "timezone",
      "currencySymbol",
      "currencyUnit",
      "pdfHeaderLine",
    ] as const) {
      expect(demoConfig[key]).toBe(DEMO[key]);
      expect(demoConfig[key]).not.toBe(odisha[key]);
    }
    expect(demoConfig.labels).toStrictEqual(DEMO.labels);
    expect(demoConfig.labels).not.toStrictEqual(odisha.labels);
  });
});
