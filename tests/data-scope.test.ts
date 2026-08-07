import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  resolveDataScopeForUser,
  resolveFinanceDataScope,
  EMPTY_SCOPE,
  isFullScope,
  type DataScope,
} from "@/lib/data-scope";
import {
  schemeWhere,
  subschemeWhere,
  financeBudgetWhere,
  financeSnapshotWhere,
  kpiDefinitionWhere,
  actionItemWhere,
  userWhere,
} from "@/lib/data-access/scope-where";
import { buildMeetingReport } from "@/lib/meeting-report";
import { buildPendanceReport } from "@/lib/pendance-report";
import {
  seedScope,
  cleanupScopeSeed,
  loadDbUserWithRbac,
  type ScopeSeed,
} from "./helpers/seed-scope";

let seed: ScopeSeed;
let fullScope: DataScope;
let restrictedScope: DataScope;

beforeAll(async () => {
  seed = await seedScope();
  const fullDbUser = await loadDbUserWithRbac(seed.fullUser.id);
  const restrictedDbUser = await loadDbUserWithRbac(seed.restrictedUser.id);
  fullScope = await resolveDataScopeForUser(fullDbUser);
  restrictedScope = await resolveDataScopeForUser(restrictedDbUser);
});

afterAll(async () => {
  await cleanupScopeSeed();
  await prisma.$disconnect();
});

describe("resolveDataScope", () => {
  it("grants full access to a VIEW_ALL_DATA user", () => {
    expect(isFullScope(fullScope)).toBe(true);
  });

  it("restricts a VIEW_ASSIGNED_DATA user to their assigned schemes only", () => {
    expect(restrictedScope.kind).toBe("restricted");
    if (restrictedScope.kind === "restricted") {
      expect(restrictedScope.schemeIds).toEqual([seed.schemeA.id]);
      expect(restrictedScope.subschemeIds).toEqual([]);
      expect(restrictedScope.userIds).toEqual([seed.restrictedUser.id]);
    }
  });

  it("denies by default for a null user", async () => {
    const scope = await resolveDataScopeForUser(null);
    expect(scope).toEqual(EMPTY_SCOPE);
    expect(scope.kind).toBe("restricted");
    if (scope.kind === "restricted") {
      expect(scope.schemeIds).toEqual([]);
      expect(scope.userIds).toEqual([]);
    }
  });
});

describe("resolveFinanceDataScope", () => {
  it("a VIEW_ASSIGNED_DATA + ENTER_FINANCIAL_DATA user with zero SchemeAssignment rows gets restricted (empty) generic scope but full finance scope", async () => {
    const financeDbUser = await loadDbUserWithRbac(seed.financeUser.id);
    const genericScope = await resolveDataScopeForUser(financeDbUser);
    expect(genericScope).toEqual(EMPTY_SCOPE);

    const financeScope = await resolveFinanceDataScope(financeDbUser);
    expect(isFullScope(financeScope)).toBe(true);
  });

  it("VIEW_ALL_DATA still resolves to full finance scope", async () => {
    const fullDbUser = await loadDbUserWithRbac(seed.fullUser.id);
    const financeScope = await resolveFinanceDataScope(fullDbUser);
    expect(isFullScope(financeScope)).toBe(true);
  });

  it("a plain VIEW_ASSIGNED_DATA user (no financial permission) keeps the standard scheme-assignment-restricted finance scope", async () => {
    const restrictedDbUser = await loadDbUserWithRbac(seed.restrictedUser.id);
    const financeScope = await resolveFinanceDataScope(restrictedDbUser);
    expect(financeScope).toEqual(restrictedScope);
  });
});

describe("scope-where fragments", () => {
  it("full scope: schemeWhere returns {} (no narrowing)", () => {
    expect(schemeWhere(fullScope)).toEqual({});
  });

  it("restricted scope: schemeWhere narrows to assigned scheme ids", () => {
    expect(schemeWhere(restrictedScope)).toEqual({ id: { in: [seed.schemeA.id] } });
  });

  it("empty scope: schemeWhere matches nothing", () => {
    expect(schemeWhere(EMPTY_SCOPE)).toEqual({ id: { in: [] } });
  });

  it("kpiDefinitionWhere narrows via schemeId OR direct performer/reviewer for restricted scope", () => {
    expect(kpiDefinitionWhere(restrictedScope)).toEqual({
      OR: [
        { schemeId: { in: [seed.schemeA.id] } },
        { performers: { some: { userId: { in: [seed.restrictedUser.id] }, isActive: true } } },
        { reviewerUsers: { some: { userId: { in: [seed.restrictedUser.id] } } } },
      ],
    });
    expect(kpiDefinitionWhere(EMPTY_SCOPE)).toEqual({ schemeId: { in: [] } });
  });

  it("actionItemWhere narrows via schemeId OR direct performer/reviewer for restricted scope", () => {
    expect(actionItemWhere(restrictedScope)).toEqual({
      OR: [
        { schemeId: { in: [seed.schemeA.id] } },
        { performers: { some: { userId: { in: [seed.restrictedUser.id] }, isActive: true } } },
        { reviewerUsers: { some: { userId: { in: [seed.restrictedUser.id] } } } },
      ],
    });
    expect(actionItemWhere(EMPTY_SCOPE)).toEqual({ schemeId: { in: [] } });
  });

  it("financeBudgetWhere narrows by FY + scheme for restricted scope", () => {
    expect(financeBudgetWhere(restrictedScope, seed.financialYear.id)).toEqual({
      financialYearId: seed.financialYear.id,
      schemeId: { in: [seed.schemeA.id] },
    });
  });

  it("financeSnapshotWhere narrows by FY + scheme for restricted scope", () => {
    expect(financeSnapshotWhere(restrictedScope, seed.financialYear.id)).toEqual({
      financialYearId: seed.financialYear.id,
      schemeId: { in: [seed.schemeA.id] },
    });
  });

  it("subschemeWhere narrows via parent scheme for restricted scope", () => {
    expect(subschemeWhere(restrictedScope)).toEqual({ schemeId: { in: [seed.schemeA.id] } });
  });

  it("userWhere narrows to self for restricted scope, {} for full", () => {
    expect(userWhere(restrictedScope)).toEqual({ id: { in: [seed.restrictedUser.id] } });
    expect(userWhere(fullScope)).toEqual({});
  });
});

describe("scoped entity reads (positive / negative)", () => {
  it("scheme reads: full sees both, restricted sees only A, empty sees none", async () => {
    const full = await prisma.scheme.findMany({ where: schemeWhere(fullScope), select: { id: true } });
    const rest = await prisma.scheme.findMany({ where: schemeWhere(restrictedScope), select: { id: true } });
    const none = await prisma.scheme.findMany({ where: schemeWhere(EMPTY_SCOPE), select: { id: true } });
    expect(full.map((s) => s.id)).toEqual(expect.arrayContaining([seed.schemeA.id, seed.schemeB.id]));
    expect(rest.map((s) => s.id)).toEqual([seed.schemeA.id]);
    expect(none).toEqual([]);
  });

  it("kpiDefinition reads: full sees all three, restricted sees A (scheme-assigned) and C (direct performer, no scheme assignment), not B", async () => {
    const full = await prisma.kpiDefinition.findMany({ where: kpiDefinitionWhere(fullScope), select: { id: true } });
    const rest = await prisma.kpiDefinition.findMany({ where: kpiDefinitionWhere(restrictedScope), select: { id: true } });
    expect(full.map((d) => d.id)).toEqual(
      expect.arrayContaining([seed.kpiDefA.id, seed.kpiDefB.id, seed.kpiDefC.id]),
    );
    expect(rest.map((d) => d.id).sort()).toEqual([seed.kpiDefA.id, seed.kpiDefC.id].sort());
  });

  it("actionItem reads: full sees all three, restricted sees A (scheme-assigned) and C (direct performer, no scheme assignment), not B", async () => {
    const full = await prisma.actionItem.findMany({ where: actionItemWhere(fullScope), select: { id: true } });
    const rest = await prisma.actionItem.findMany({ where: actionItemWhere(restrictedScope), select: { id: true } });
    expect(full.map((a) => a.id)).toEqual(
      expect.arrayContaining([seed.actionItemA.id, seed.actionItemB.id, seed.actionItemC.id]),
    );
    expect(rest.map((a) => a.id).sort()).toEqual([seed.actionItemA.id, seed.actionItemC.id].sort());
  });

  it("financeBudget reads: full sees both, restricted sees only A", async () => {
    const full = await prisma.financeBudget.findMany({ where: financeBudgetWhere(fullScope, seed.financialYear.id), select: { schemeId: true } });
    const rest = await prisma.financeBudget.findMany({ where: financeBudgetWhere(restrictedScope, seed.financialYear.id), select: { schemeId: true } });
    expect(full.map((b) => b.schemeId)).toEqual(expect.arrayContaining([seed.schemeA.id, seed.schemeB.id]));
    expect(rest.map((b) => b.schemeId)).toEqual([seed.schemeA.id]);
  });

  it("financeSnapshot reads: full sees both, restricted sees only A", async () => {
    const full = await prisma.financeExpenditureSnapshot.findMany({ where: financeSnapshotWhere(fullScope, seed.financialYear.id), select: { schemeId: true } });
    const rest = await prisma.financeExpenditureSnapshot.findMany({ where: financeSnapshotWhere(restrictedScope, seed.financialYear.id), select: { schemeId: true } });
    expect(full.map((s) => s.schemeId)).toEqual(expect.arrayContaining([seed.schemeA.id, seed.schemeB.id]));
    expect(rest.map((s) => s.schemeId)).toEqual([seed.schemeA.id]);
  });
});

describe("buildMeetingReport scoping", () => {
  const schemeRowNames = (p: NonNullable<Awaited<ReturnType<typeof buildMeetingReport>>>) =>
    (p.schemesFinancialProgress ?? [])
      .flatMap((g) => g.rows)
      .filter((r) => r.rowVariant === "scheme")
      .map((r) => r.planType);
  const kpiSchemeLabels = (p: NonNullable<Awaited<ReturnType<typeof buildMeetingReport>>>) =>
    (p.kpiRows ?? []).map((r) => r.schemeLabel);
  const decisionTitles = (p: NonNullable<Awaited<ReturnType<typeof buildMeetingReport>>>) =>
    (p.keyDecisions ?? []).map((r) => r.title);

  it("full scope: report includes both schemes' rows, KPIs, and decisions", async () => {
    const payload = await buildMeetingReport(seed.meeting.id, fullScope);
    expect(payload).not.toBeNull();
    expect(schemeRowNames(payload!)).toEqual(expect.arrayContaining([seed.schemeA.name, seed.schemeB.name]));
    expect(kpiSchemeLabels(payload!)).toEqual(expect.arrayContaining([seed.schemeA.name, seed.schemeB.name]));
    expect(decisionTitles(payload!)).toEqual(expect.arrayContaining([seed.actionItemA.title, seed.actionItemB.title]));
  });

  it("restricted scope: report excludes the unassigned scheme (B)", async () => {
    const payload = await buildMeetingReport(seed.meeting.id, restrictedScope);
    expect(payload).not.toBeNull();
    expect(schemeRowNames(payload!)).toContain(seed.schemeA.name);
    expect(schemeRowNames(payload!)).not.toContain(seed.schemeB.name);
    expect(kpiSchemeLabels(payload!)).not.toContain(seed.schemeB.name);
    expect(decisionTitles(payload!)).toContain(seed.actionItemA.title);
    expect(decisionTitles(payload!)).not.toContain(seed.actionItemB.title);
  });

  it("deny-by-default: empty scope report has zero scheme rows, zero KPI rows, zero decisions", async () => {
    const payload = await buildMeetingReport(seed.meeting.id, EMPTY_SCOPE);
    expect(payload).not.toBeNull();
    expect(schemeRowNames(payload!).length).toBe(0);
    expect((payload!.kpiRows ?? []).length).toBe(0);
    expect((payload!.keyDecisions ?? []).length).toBe(0);
  });

  it("restricted export has strictly fewer scheme rows than full export", async () => {
    const full = await buildMeetingReport(seed.meeting.id, fullScope);
    const rest = await buildMeetingReport(seed.meeting.id, restrictedScope);
    expect(schemeRowNames(rest!).length).toBeLessThan(schemeRowNames(full!).length);
  });
});

describe("buildPendanceReport scoping", () => {
  it("full scope: financialDataUpdates includes both schemes", async () => {
    const payload = await buildPendanceReport(seed.meeting.id, fullScope);
    expect(payload).not.toBeNull();
    const schemeNames = (payload!.financialDataUpdates ?? []).map((u) => u.schemeName);
    expect(schemeNames).toEqual(expect.arrayContaining([seed.schemeA.name, seed.schemeB.name]));
  });

  it("restricted scope: financialDataUpdates excludes the unassigned scheme (B)", async () => {
    const payload = await buildPendanceReport(seed.meeting.id, restrictedScope);
    expect(payload).not.toBeNull();
    const schemeNames = (payload!.financialDataUpdates ?? []).map((u) => u.schemeName);
    expect(schemeNames).not.toContain(seed.schemeB.name);
  });

  it("restricted scope: userTasks excludes performers tied to the unassigned scheme", async () => {
    const payload = await buildPendanceReport(seed.meeting.id, restrictedScope);
    expect(payload).not.toBeNull();
    // Restricted user is a performer on schemeA's KPI/action; full user is a performer on
    // schemeB's. Restricted scope narrows the user directory to the restricted user only,
    // so schemeB's performer (full user) must not appear.
    const taskUserNames = (payload!.userTasks ?? []).map((t) => t.userName);
    expect(taskUserNames).not.toContain(seed.fullUser.name);
    const none = await buildPendanceReport(seed.meeting.id, EMPTY_SCOPE);
    expect((none!.userTasks ?? []).length).toBe(0);
  });
});
