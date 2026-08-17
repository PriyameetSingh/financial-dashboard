/**
 * Phase 2 Gate D — cross-tenant isolation (the permanent core safety net).
 *
 * Two tenants are seeded with IDENTICAL fixture shapes (same scheme codes, same
 * user emails — possible only because Gate D's M3 migration made those uniques
 * composite with tenantId):
 *
 *   tenant A = Odisha (tenant #1)
 *   tenant B = a second, fictional tenant created and torn down by this file
 *
 * Every assertion runs in BOTH directions (A must not see B, and B must not see
 * A) and goes through the REAL production path: `withTenantContext` establishes
 * the same request-scoped holder the resolver primes, and all queries run on
 * the tenant-scoped client so the chokepoint is what does the filtering. No
 * test may hand-write `where: { tenantId }` to prove isolation — that would
 * test the database, not the chokepoint.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, prismaUnscoped, tenantStamped, TenantScopeError } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { withTenantContext } from "@/lib/tenant-context";
import { resolveDataScopeForUser, type DataScope } from "@/lib/data-scope";
import { schemeWhere, kpiDefinitionWhere } from "@/lib/data-access/scope-where";
import { getCommandCentreDashboard } from "@/lib/command-centre-dashboard";
import { getFinancialBudgetEntriesOverview } from "@/lib/financial-budget-entries";
import { buildMeetingReport } from "@/lib/meeting-report";
import {
  GLOBAL_MODELS,
  TENANT_SCOPED_MODELS,
  allModelNames,
} from "@/lib/tenant-scope-registry";
import { seedScope, cleanupScopeSeed, loadDbUserWithRbac, type ScopeSeed } from "./helpers/seed-scope";

const TENANT_B_SLUG = "testtenant-b";

type Fixture = {
  tenantId: string;
  seed: ScopeSeed;
  fullScope: DataScope;
  fullUser: Awaited<ReturnType<typeof loadDbUserWithRbac>>;
};

let A: Fixture;
let B: Fixture;

async function buildFixture(tenantId: string): Promise<Fixture> {
  const seed = await seedScope(tenantId);
  const fullUser = await loadDbUserWithRbac(seed.fullUser.id, tenantId);
  const fullScope = await withTenantContext(tenantId, () => resolveDataScopeForUser(fullUser));
  return { tenantId, seed, fullScope, fullUser };
}

beforeAll(async () => {
  // Tenant B is infrastructure for this file: created unscoped (Tenant is a
  // global model), torn down in afterAll.
  const tenantB = await prismaUnscoped.tenant.upsert({
    where: { slug: TENANT_B_SLUG },
    update: { status: "active" },
    create: { slug: TENANT_B_SLUG, name: "Suryapur Test Authority", status: "active" },
  });
  await prismaUnscoped.tenantConfigEntry.upsert({
    where: { tenantId_key: { tenantId: tenantB.id, key: "productName" } },
    update: { value: "Suryapur Dashboard" },
    create: { tenantId: tenantB.id, key: "productName", value: "Suryapur Dashboard" },
  });

  A = await buildFixture(ODISHA_TENANT_ID);
  B = await buildFixture(tenantB.id);
}, 120_000);

afterAll(async () => {
  await cleanupScopeSeed(B.tenantId).catch(() => {});
  await cleanupScopeSeed(ODISHA_TENANT_ID).catch(() => {});
  await prismaUnscoped.tenantConfigEntry.deleteMany({ where: { tenantId: B.tenantId } }).catch(() => {});
  await prismaUnscoped.tenant.deleteMany({ where: { slug: TENANT_B_SLUG } }).catch(() => {});
  await prismaUnscoped.$disconnect();
});

/** Run `fn` once per direction: (self, other). */
function bothDirections(name: string, fn: (self: Fixture, other: Fixture) => Promise<void>) {
  it(`${name} — Odisha cannot see tenant B`, () => fn(A, B));
  it(`${name} — tenant B cannot see Odisha`, () => fn(B, A));
}

describe("Fixture sanity — two tenants really do hold parallel data", () => {
  it("both tenants have schemes with the SAME code (composite unique proves onboarding works)", () => {
    expect(A.seed.schemeA.code).toBe(B.seed.schemeA.code);
    expect(A.seed.schemeA.id).not.toBe(B.seed.schemeA.id);
  });

  it("both tenants have users with the same email, under different ids", () => {
    expect(A.seed.fullUser.email).toBe(B.seed.fullUser.email);
    expect(A.seed.fullUser.id).not.toBe(B.seed.fullUser.id);
  });
});

describe("Surface sweeps (both directions)", () => {
  bothDirections("schemes list", async (self, other) => {
    const rows = await withTenantContext(self.tenantId, () =>
      prisma.scheme.findMany({ where: schemeWhere(self.fullScope), select: { id: true } }),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(self.seed.schemeA.id);
    expect(ids).not.toContain(other.seed.schemeA.id);
    expect(ids).not.toContain(other.seed.schemeB.id);
    expect(ids).not.toContain(other.seed.schemeC.id);
  });

  bothDirections("KPI definitions", async (self, other) => {
    const rows = await withTenantContext(self.tenantId, () =>
      prisma.kpiDefinition.findMany({ where: kpiDefinitionWhere(self.fullScope), select: { id: true } }),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(self.seed.kpiDefA.id);
    expect(ids).not.toContain(other.seed.kpiDefA.id);
    expect(ids).not.toContain(other.seed.kpiDefB.id);
  });

  bothDirections("command centre dashboard", async (self, other) => {
    const dash = await withTenantContext(self.tenantId, () =>
      getCommandCentreDashboard(self.fullUser, self.fullScope),
    );
    // Totals must equal this tenant's own data only, not the sum of both.
    expect(dash.schemesMonitored.total).toBe(3);
    expect(dash.totals.totalBudgetCr).toBeCloseTo(200, 5);
    expect(dash.totals.totalIfmsCr).toBeCloseTo(100, 5);
    expect(dash.schemes.length).toBe(3);
    // And no row may carry the other tenant's scheme id.
    const otherIds = new Set([other.seed.schemeA.id, other.seed.schemeB.id, other.seed.schemeC.id]);
    for (const s of dash.schemes as Array<{ schemeId?: string }>) {
      if (s.schemeId) expect(otherIds.has(s.schemeId)).toBe(false);
    }
  });

  bothDirections("financial summary / budget entries overview", async (self, other) => {
    const overview = await withTenantContext(self.tenantId, () =>
      getFinancialBudgetEntriesOverview(self.fullUser, self.fullScope),
    );
    expect(overview.financialYearLabel).toBe(self.seed.financialYear.label);
    expect(overview.entries.length).toBe(3);
    const otherIds = new Set([other.seed.schemeA.id, other.seed.schemeB.id, other.seed.schemeC.id]);
    for (const e of overview.entries as Array<{ schemeId?: string }>) {
      if (e.schemeId) expect(otherIds.has(e.schemeId)).toBe(false);
    }
  });

  bothDirections("meeting report builder", async (self, other) => {
    const own = await withTenantContext(self.tenantId, () =>
      buildMeetingReport(self.seed.meeting.id, self.fullScope),
    );
    expect(own).not.toBeNull();
    // The other tenant's meeting id must not resolve at all.
    const foreign = await withTenantContext(self.tenantId, () =>
      buildMeetingReport(other.seed.meeting.id, self.fullScope),
    );
    expect(foreign).toBeNull();
  });
});

describe("Direct-id probes (both directions)", () => {
  bothDirections("findUnique on the other tenant's rows returns null", async (self, other) => {
    await withTenantContext(self.tenantId, async () => {
      expect(await prisma.scheme.findUnique({ where: { id: other.seed.schemeA.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: other.seed.fullUser.id } })).toBeNull();
      expect(await prisma.dashboardMeeting.findUnique({ where: { id: other.seed.meeting.id } })).toBeNull();
      expect(await prisma.kpiDefinition.findUnique({ where: { id: other.seed.kpiDefA.id } })).toBeNull();
      expect(await prisma.actionItem.findUnique({ where: { id: other.seed.actionItemA.id } })).toBeNull();
      // …while its own row is visible through the same call.
      expect(await prisma.scheme.findUnique({ where: { id: self.seed.schemeA.id } })).not.toBeNull();
    });
  });

  bothDirections("findFirst by shared code returns only the own-tenant row", async (self, other) => {
    const row = await withTenantContext(self.tenantId, () =>
      prisma.scheme.findFirst({ where: { code: self.seed.schemeA.code } }),
    );
    expect(row?.id).toBe(self.seed.schemeA.id);
    expect(row?.id).not.toBe(other.seed.schemeA.id);
  });
});

describe("Write probes (both directions)", () => {
  bothDirections("create is stamped with the caller's tenant, not the payload's", async (self, other) => {
    const created = await withTenantContext(self.tenantId, () =>
      prisma.scheme.create({
        data: {
          code: `ISO_${self.tenantId.slice(0, 8)}_${Date.now()}`,
          name: "Isolation probe",
          verticalName: "Test Vertical",
          sponsorshipType: "STATE",
          // A payload that lies about its tenant must not win.
          tenantId: other.tenantId,
        } as never,
      }),
    ).catch((e) => e as Error);
    // Either it was rejected outright, or it landed in the caller's tenant —
    // never in the other tenant.
    if (created instanceof Error) {
      expect(created).toBeInstanceOf(Error);
    } else {
      expect(created.tenantId).toBe(self.tenantId);
      await prismaUnscoped.scheme.delete({ where: { id: created.id } });
    }
  });

  bothDirections("update/delete of the other tenant's row is not found", async (self, other) => {
    await withTenantContext(self.tenantId, async () => {
      await expect(
        prisma.scheme.update({ where: { id: other.seed.schemeA.id }, data: { name: "hijacked" } }),
      ).rejects.toThrow();
      await expect(
        prisma.scheme.delete({ where: { id: other.seed.schemeA.id } }),
      ).rejects.toThrow();
    });
    // The other tenant's row is untouched.
    const after = await prismaUnscoped.scheme.findUnique({ where: { id: other.seed.schemeA.id } });
    expect(after?.name).toBe(other.seed.schemeA.name);
  });

  bothDirections("updateMany/deleteMany with a broad where touch 0 cross-tenant rows", async (self, other) => {
    // Distinct marker per direction, so the second run cannot be confused by
    // the value the first run wrote into its own tenant.
    const marker = self.tenantId === ODISHA_TENANT_ID ? 71 : 72;
    const before = await prismaUnscoped.scheme.findUnique({ where: { id: other.seed.schemeA.id } });
    const updated = await withTenantContext(self.tenantId, () =>
      prisma.scheme.updateMany({ where: { name: { contains: "TESTSCOPE_" } }, data: { sortOrder: marker } }),
    );
    expect(updated.count).toBe(3); // own fixture only, never 6
    const after = await prismaUnscoped.scheme.findUnique({ where: { id: other.seed.schemeA.id } });
    expect(after?.sortOrder).toBe(before?.sortOrder); // other tenant untouched
    expect(after?.sortOrder).not.toBe(marker);
  });

  bothDirections("a relation connect to the other tenant's row is rejected", async (self, other) => {
    await withTenantContext(self.tenantId, async () => {
      // `connect` attaches an EXISTING row by unique selector — nothing is
      // stamped, so without an ownership check this would graft the other
      // tenant's user onto this tenant's KPI definition.
      await expect(
        prisma.kpiDefinition.update({
          where: { id: self.seed.kpiDefA.id },
          // `as never`: these probes deliberately use Prisma's CHECKED input
          // (relation `connect`), where the tenant is a relation rather than the
          // `tenantId` scalar `tenantStamped` supplies. The payload is exactly
          // what production code would send; the point of the probe is that the
          // chokepoint REJECTS it at runtime, which is what the assertion below
          // proves. Typing it is beside the point.
          data: { performers: { create: [{ user: { connect: { id: other.seed.fullUser.id } } }] } } as never,
        }),
      ).rejects.toThrow();

      await expect(
        prisma.kpiDefinition.update({
          where: { id: self.seed.kpiDefA.id },
          data: { scheme: { connect: { id: other.seed.schemeA.id } } },
        }),
      ).rejects.toThrow();
    });
    // The KPI definition still points at its own tenant's scheme.
    const after = await prismaUnscoped.kpiDefinition.findUnique({ where: { id: self.seed.kpiDefA.id } });
    expect(after?.schemeId).toBe(self.seed.schemeA.id);
    expect(after?.tenantId).toBe(self.tenantId);
  });

  bothDirections(
    "connect is rejected even though the target row is INVISIBLE to this scope",
    async (self, other) => {
      // This pins the ownership probe to the UNSCOPED client. Through the
      // scoped client the other tenant's row does not exist (asserted first),
      // so a scoped probe would see "no such row", conclude there is nothing to
      // object to, and let the connect through — a live cross-tenant hole. The
      // probe must therefore read unscoped and reject on positive evidence of
      // foreign ownership.
      await withTenantContext(self.tenantId, async () => {
        expect(await prisma.user.findUnique({ where: { id: other.seed.fullUser.id } })).toBeNull();
        expect(await prisma.scheme.findUnique({ where: { id: other.seed.schemeB.id } })).toBeNull();

        await expect(
          prisma.kpiDefinition.update({
            where: { id: self.seed.kpiDefA.id },
            // `as never`: these probes deliberately use Prisma's CHECKED input
          // (relation `connect`), where the tenant is a relation rather than the
          // `tenantId` scalar `tenantStamped` supplies. The payload is exactly
          // what production code would send; the point of the probe is that the
          // chokepoint REJECTS it at runtime, which is what the assertion below
          // proves. Typing it is beside the point.
          data: { performers: { create: [{ user: { connect: { id: other.seed.fullUser.id } } }] } } as never,
          }),
        ).rejects.toThrow();

        await expect(
          prisma.actionItem.create({
            // Checked-input probe — see the `as never` note above.
            data: {
              title: "invisible-parent connect probe",
              description: "should not be created",
              itemType: "action_item",
              priority: "Medium",
              dueDate: new Date("2025-12-31"),
              status: "OPEN",
              scheme: { connect: { id: other.seed.schemeB.id } },
            } as never,
          }),
        ).rejects.toThrow();
      });

      // Nothing was grafted onto the other tenant's rows.
      const performers = await prismaUnscoped.kpiDefinitionPerformer.count({
        where: { userId: other.seed.fullUser.id, kpiDefinitionId: self.seed.kpiDefA.id },
      });
      expect(performers).toBe(0);
    },
  );

  bothDirections("a write referencing the other tenant's parent row is rejected", async (self, other) => {
    await withTenantContext(self.tenantId, async () => {
      await expect(
        prisma.actionItem.create({
          data: tenantStamped({
            title: "cross-tenant parent probe",
            description: "should not be created",
            itemType: "action_item",
            priority: "Medium",
            dueDate: new Date("2025-12-31"),
            status: "OPEN",
            schemeId: other.seed.schemeA.id, // parent belongs to the other tenant
          }),
        }),
      ).rejects.toThrow();
    });
  });
});

describe("Operation-class coverage (aggregates, upsert, createMany, transactions)", () => {
  bothDirections("count / aggregate / groupBy see only own rows", async (self) => {
    await withTenantContext(self.tenantId, async () => {
      expect(await prisma.scheme.count({ where: { code: { startsWith: "TESTSCOPE_" } } })).toBe(3);
      const agg = await prisma.financeBudget.aggregate({ _sum: { budgetEstimateCr: true } });
      expect(Number(agg._sum.budgetEstimateCr ?? 0)).toBeCloseTo(200, 5);
      const grouped = await prisma.scheme.groupBy({
        by: ["sponsorshipType"],
        _count: { _all: true },
        where: { code: { startsWith: "TESTSCOPE_" } },
      });
      expect(grouped.reduce((n, g) => n + g._count._all, 0)).toBe(3);
    });
  });

  bothDirections("interactive $transaction queries are scoped too", async (self, other) => {
    await withTenantContext(self.tenantId, async () => {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.scheme.findMany({ where: { code: { startsWith: "TESTSCOPE_" } }, select: { id: true } });
        expect(rows.map((r) => r.id)).not.toContain(other.seed.schemeA.id);
        expect(rows.length).toBe(3);
        expect(await tx.scheme.count()).toBe(3);
        expect(await tx.scheme.findUnique({ where: { id: other.seed.schemeA.id } })).toBeNull();
      });
    });
  });

  bothDirections("upsert cannot target the other tenant's row", async (self, other) => {
    await withTenantContext(self.tenantId, async () => {
      await expect(
        prisma.scheme.upsert({
          where: { id: other.seed.schemeA.id },
          update: { name: "hijacked-by-upsert" },
          create: tenantStamped({
            code: `ISO_UPSERT_${Date.now()}`,
            name: "probe",
            verticalName: "Test Vertical",
            sponsorshipType: "STATE",
          }),
        }),
      ).rejects.toThrow();
    });
    const after = await prismaUnscoped.scheme.findUnique({ where: { id: other.seed.schemeA.id } });
    expect(after?.name).toBe(other.seed.schemeA.name);
  });
});

describe("Chokepoint invariants", () => {
  it("every model is classified exactly once (tenant-scoped XOR global)", () => {
    const unclassified: string[] = [];
    const both: string[] = [];
    for (const name of allModelNames()) {
      const scoped = TENANT_SCOPED_MODELS.has(name);
      const global = GLOBAL_MODELS.has(name);
      if (!scoped && !global) unclassified.push(name);
      if (scoped && global) both.push(name);
    }
    expect({ unclassified, both }).toEqual({ unclassified: [], both: [] });
  });

  // These numbers are a ratchet, not a fact about the schema: the point is that
  // adding a GLOBAL model — a model the chokepoint will not scope — cannot
  // happen without someone editing this line and saying why.
  //
  //   Phase 3: +TenantEntitlement (scoped, by its tenantId column) and +Module
  //            (global — a closed code registry, same argument as Permission).
  //            46/5 → 47/6.
  //   Phase 4: +OnboardingToken (global — it authorizes the CREATION of a
  //            tenant, so it necessarily exists before one does; scoping it
  //            would be circular. It holds a hash, a tier, an expiry and, once
  //            spent, the id of the tenant it produced — no tenant data).
  //            47/6 → 47/7.
  //   RBAC Gate A: +UserUlb (scoped, by its tenantId column — a user's ULB
  //            membership SET, backfilled from the single User.ulbId so scope
  //            can generalize to "same ULB as me" without pinning a value on a
  //            role). Nothing became global. 47/7 → 48/7.
  it("48 models are tenant-scoped and 7 are deliberately global", () => {
    expect(TENANT_SCOPED_MODELS.size).toBe(48);
    expect(GLOBAL_MODELS.size).toBe(7);
  });

  it("a tenant-scoped query with NO resolved scope fails closed", async () => {
    // Outside withTenantContext / a resolved request there is no tenant, so the
    // chokepoint must refuse rather than run an unfiltered query.
    await expect(prisma.scheme.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("global models remain readable without a tenant scope", async () => {
    await expect(prisma.permission.findMany({ take: 1 })).resolves.toBeDefined();
  });
});
