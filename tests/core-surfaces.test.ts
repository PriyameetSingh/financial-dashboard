/**
 * Odisha golden regression net — core surfaces.
 *
 * Asserts the five most important screens at the route/handler/render level
 * against the same seeded test database the data-scoping suite uses. This is
 * the bit-for-bit baseline: an unconfigured app must keep passing this file.
 *
 * Surfaces covered:
 *   1. Command Centre       — getCommandCentreDashboard (lib the route delegates to)
 *   2. Financial Overview   — getFinancialBudgetEntriesOverview (lib the route delegates to)
 *   3. KPI View             — kpiDefinitionWhere + the route's exact findMany shape
 *   4. List / Table View    — schemeWhere + the schemes route's exact findMany shape
 *   5. Report / PDF Export  — buildMeetingReport + renderMeetingReportPdfBuffer (server render)
 *
 * The full end-to-end app boot is NOT required here: these are the handler/lib
 * entry points the route handlers call, exercised with a real (test) Postgres
 * and stubbed auth (see tests/helpers/load-env.ts). Full `next build` is the
 * separate static-analysis leg of the golden harness.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { enterTenantScope } from "@/lib/tenant-context";
import { resolveDataScopeForUser, type DataScope } from "@/lib/data-scope";
import { schemeWhere, kpiDefinitionWhere } from "@/lib/data-access/scope-where";
import { getCommandCentreDashboard } from "@/lib/command-centre-dashboard";
import { getFinancialBudgetEntriesOverview } from "@/lib/financial-budget-entries";
import { buildMeetingReport } from "@/lib/meeting-report";
import { renderMeetingReportPdfBuffer } from "@/lib/meeting-report-pdf-server";
import {
  seedScope,
  cleanupScopeSeed,
  loadDbUserWithRbac,
  type ScopeSeed,
} from "./helpers/seed-scope";

let seed: ScopeSeed;
let fullScope: DataScope;
let restrictedScope: DataScope;
let fullDbUser: Awaited<ReturnType<typeof loadDbUserWithRbac>>;
let restrictedDbUser: Awaited<ReturnType<typeof loadDbUserWithRbac>>;

beforeAll(async () => {
  // Phase 2: these suites exercise Odisha's data through the tenant-scoped
  // client, so the process enters Odisha's scope first (test-only ergonomic
  // form of withTenantContext).
  await enterTenantScope(ODISHA_TENANT_ID);
  seed = await seedScope();
  fullDbUser = await loadDbUserWithRbac(seed.fullUser.id);
  restrictedDbUser = await loadDbUserWithRbac(seed.restrictedUser.id);
  fullScope = await resolveDataScopeForUser(fullDbUser);
  restrictedScope = await resolveDataScopeForUser(restrictedDbUser);
});

afterAll(async () => {
  await cleanupScopeSeed();
  await prisma.$disconnect();
});

describe("Surface 1 — Command Centre (getCommandCentreDashboard)", () => {
  it("full scope: monitors all three schemes and aggregates budget/ifms totals", async () => {
    const dash = await getCommandCentreDashboard(fullDbUser, fullScope);
    expect(dash.schemesMonitored.total).toBe(3);
    expect(dash.schemesMonitored.stateSector).toBe(3);
    // schemeA + schemeB each have budget 100 / ifms 50; schemeC has no budget.
    expect(dash.totals.totalBudgetCr).toBeCloseTo(200, 5);
    expect(dash.totals.totalIfmsCr).toBeCloseTo(100, 5);
    expect(dash.schemes.length).toBe(3);
    const names = dash.schemes.map((s) => s.scheme);
    expect(names).toEqual(
      expect.arrayContaining([seed.schemeA.name, seed.schemeB.name, seed.schemeC.name]),
    );
  });

  it("restricted scope: narrows to the single assigned scheme only", async () => {
    const dash = await getCommandCentreDashboard(restrictedDbUser, restrictedScope);
    expect(dash.schemesMonitored.total).toBe(1);
    expect(dash.totals.totalBudgetCr).toBeCloseTo(100, 5);
    expect(dash.totals.totalIfmsCr).toBeCloseTo(50, 5);
    expect(dash.schemes.map((s) => s.scheme)).toEqual([seed.schemeA.name]);
  });
});

describe("Surface 2 — Financial Overview (getFinancialBudgetEntriesOverview)", () => {
  it("full scope: returns entries for all non-financial schemes with FY label", async () => {
    const { entries, financialYearLabel } = await getFinancialBudgetEntriesOverview(
      fullDbUser,
      fullScope,
    );
    expect(financialYearLabel).toBe(seed.financialYear.label);
    expect(entries.length).toBe(3);
    expect(entries.map((e) => e.scheme)).toEqual(
      expect.arrayContaining([seed.schemeA.name, seed.schemeB.name, seed.schemeC.name]),
    );
  });

  it("restricted scope: returns only the assigned scheme's entry", async () => {
    const { entries } = await getFinancialBudgetEntriesOverview(
      restrictedDbUser,
      restrictedScope,
    );
    expect(entries.map((e) => e.scheme)).toEqual([seed.schemeA.name]);
  });
});

describe("Surface 3 — KPI View (definitions list, mirrors /api/v1/kpis/definitions GET)", () => {
  it("full scope: lists all three KPI definitions", async () => {
    const defs = await prisma.kpiDefinition.findMany({
      where: { ...kpiDefinitionWhere(fullScope), archived: false, scheme: { archived: false } },
      select: { id: true },
    });
    expect(defs.map((d) => d.id).sort()).toEqual(
      [seed.kpiDefA.id, seed.kpiDefB.id, seed.kpiDefC.id].sort(),
    );
  });

  it("restricted scope: lists scheme-assigned + direct-performer KPIs, excludes unassigned", async () => {
    const defs = await prisma.kpiDefinition.findMany({
      where: { ...kpiDefinitionWhere(restrictedScope), archived: false, scheme: { archived: false } },
      select: { id: true },
    });
    expect(defs.map((d) => d.id).sort()).toEqual([seed.kpiDefA.id, seed.kpiDefC.id].sort());
  });
});

describe("Surface 4 — List / Table View (schemes list, mirrors /api/v1/schemes GET)", () => {
  it("full scope: returns all schemes", async () => {
    const schemes = await prisma.scheme.findMany({
      where: schemeWhere(fullScope),
      select: { id: true },
    });
    expect(schemes.map((s) => s.id).sort()).toEqual(
      [seed.schemeA.id, seed.schemeB.id, seed.schemeC.id].sort(),
    );
  });

  it("restricted scope: returns only the assigned scheme", async () => {
    const schemes = await prisma.scheme.findMany({
      where: schemeWhere(restrictedScope),
      select: { id: true },
    });
    expect(schemes.map((s) => s.id)).toEqual([seed.schemeA.id]);
  });
});

describe("Surface 5 — Report / PDF Export (server-side render)", () => {
  it("renders a valid PDF buffer for the meeting report under full scope", async () => {
    const payload = await buildMeetingReport(seed.meeting.id, fullScope);
    expect(payload).not.toBeNull();
    const buffer = await renderMeetingReportPdfBuffer(payload!);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    // PDF magic header — a valid rendered PDF always starts with this.
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("restricted-scope report renders a valid PDF with strictly fewer scheme rows", async () => {
    const fullPayload = await buildMeetingReport(seed.meeting.id, fullScope);
    const restPayload = await buildMeetingReport(seed.meeting.id, restrictedScope);
    expect(fullPayload).not.toBeNull();
    expect(restPayload).not.toBeNull();

    const fullRows = (fullPayload!.schemesFinancialProgress ?? [])
      .flatMap((g) => g.rows)
      .filter((r) => r.rowVariant === "scheme");
    const restRows = (restPayload!.schemesFinancialProgress ?? [])
      .flatMap((g) => g.rows)
      .filter((r) => r.rowVariant === "scheme");
    expect(restRows.length).toBeLessThan(fullRows.length);

    const buffer = await renderMeetingReportPdfBuffer(restPayload!);
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
