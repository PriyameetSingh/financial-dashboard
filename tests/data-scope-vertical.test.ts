/**
 * `SAME_VERTICAL` — the first self-relative data-scope policy, end to end.
 *
 * The policy means: rows whose vertical is one of the ones the LOGGED-IN USER
 * belongs to. Three properties have to hold, and each is a way this could go
 * wrong in production:
 *
 *   1. It resolves from the USER's memberships, never from anything stored on
 *      the role — otherwise "widen someone's reach" would mean editing a role,
 *      which is how one officer's change silently widens everybody sharing it.
 *   2. Memberships are a SET. An officer covering two verticals sees both. A
 *      one-vertical assumption is the sort of thing that works in the fixture
 *      and fails on the first real multi-vertical officer.
 *   3. It cannot reach across tenants. Data scope narrows WITHIN a tenant;
 *      isolation is the chokepoint's job, and the two must not be confused.
 *
 * These run against the real database through the real chokepoint, like the
 * rest of the data-scope suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, tenantStamped, prismaUnscoped } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { withTenantContext, enterTenantScope } from "@/lib/tenant-context";
import { resolveDataScopeForUser, type DataScope } from "@/lib/data-scope";
import {
  schemeWhere,
  subschemeWhere,
  kpiDefinitionWhere,
  actionItemWhere,
  financeBudgetWhere,
} from "@/lib/data-access/scope-where";
import { loadDbUserWithRbac } from "./helpers/seed-scope";
import { SponsorshipType, ActionItemPriority, ActionItemStatus, ActionItemType } from "@prisma/client";

const PREFIX = "TESTVERT_";

/**
 * A throwaway SECOND tenant, created by this suite.
 *
 * The test database holds only Odisha, and the cross-tenant assertions need a
 * genuine second tenant rather than a hand-written id — a foreign key to a
 * tenant row that does not exist would fail for the wrong reason and prove
 * nothing about isolation. Removed in cleanup, like every other fixture row.
 */
const FOREIGN_TENANT_SLUG = `${PREFIX.toLowerCase()}foreign`;

type Fixture = {
  foreignTenant: { id: string };
  verticalOne: { id: string };
  verticalTwo: { id: string };
  schemeOne: { id: string };
  schemeTwo: { id: string };
  /** Belongs to vertical one only. */
  soloUser: { id: string };
  /** Belongs to BOTH verticals — the two-membership case. */
  bothUser: { id: string };
  /** Holds a SAME_VERTICAL role AND an assigned-data role — the union case. */
  unionUser: { id: string };
  /** A vertical and scheme belonging to ANOTHER tenant. */
  foreignVertical: { id: string };
  foreignScheme: { id: string };
};

let fx: Fixture;

async function cleanup() {
  // Ordered by FK dependency. prismaUnscoped because this spans two tenants.
  // The tenant row itself goes last, once nothing references it.
  await prismaUnscoped.userVertical
    .deleteMany({ where: { user: { code: { startsWith: PREFIX } } } })
    .catch(() => {});
  await prismaUnscoped.actionItem
    .deleteMany({ where: { scheme: { code: { startsWith: PREFIX } } } })
    .catch(() => {});
  await prismaUnscoped.scheme.deleteMany({ where: { code: { startsWith: PREFIX } } }).catch(() => {});
  await prismaUnscoped.vertical.deleteMany({ where: { code: { startsWith: PREFIX } } }).catch(() => {});
  await prismaUnscoped.userRole
    .deleteMany({ where: { role: { code: { startsWith: PREFIX } } } })
    .catch(() => {});
  await prismaUnscoped.rolePermission
    .deleteMany({ where: { role: { code: { startsWith: PREFIX } } } })
    .catch(() => {});
  await prismaUnscoped.role.deleteMany({ where: { code: { startsWith: PREFIX } } }).catch(() => {});
  await prismaUnscoped.user.deleteMany({ where: { code: { startsWith: PREFIX } } }).catch(() => {});
  await prismaUnscoped.tenant.deleteMany({ where: { slug: FOREIGN_TENANT_SLUG } }).catch(() => {});
}

async function seed(): Promise<Fixture> {
  await cleanup();

  return withTenantContext(ODISHA_TENANT_ID, async () => {
    const verticalOne = await prisma.vertical.create({
      data: tenantStamped({ code: `${PREFIX}V1`, name: `${PREFIX}Vertical One` }),
    });
    const verticalTwo = await prisma.vertical.create({
      data: tenantStamped({ code: `${PREFIX}V2`, name: `${PREFIX}Vertical Two` }),
    });

    const schemeOne = await prisma.scheme.create({
      data: tenantStamped({
        code: `${PREFIX}S1`,
        name: `${PREFIX}Scheme One`,
        verticalName: verticalOne.name,
        verticalId: verticalOne.id,
        sponsorshipType: SponsorshipType.STATE,
      }),
    });
    const schemeTwo = await prisma.scheme.create({
      data: tenantStamped({
        code: `${PREFIX}S2`,
        name: `${PREFIX}Scheme Two`,
        verticalName: verticalTwo.name,
        verticalId: verticalTwo.id,
        sponsorshipType: SponsorshipType.STATE,
      }),
    });

    // A meeting-level action item: no scheme, but it carries a vertical of its
    // own. This is the row the scheme-only path would lose.
    await prisma.actionItem.create({
      data: tenantStamped({
        title: `${PREFIX}Vertical-only item`,
        description: "Carries a vertical without a scheme",
        verticalId: verticalOne.id,
        itemType: ActionItemType.action_item,
        priority: ActionItemPriority.Medium,
        dueDate: new Date("2026-01-31T00:00:00.000Z"),
        status: ActionItemStatus.OPEN,
      }),
    });

    const verticalRole = await prisma.role.create({
      data: tenantStamped({
        code: `${PREFIX}VERTICAL_SCOPED`,
        name: "Test vertical-scoped role",
        dataScopePolicy: "SAME_VERTICAL",
      }),
    });
    const assignedRole = await prisma.role.create({
      data: tenantStamped({
        code: `${PREFIX}ASSIGNED`,
        name: "Test assigned role",
        dataScopePolicy: "ASSIGNED",
      }),
    });
    // The policy decides scope, but the resolver still requires a real view
    // permission for the legacy path, so grant the assigned one to both roles.
    const permAssigned = await prisma.permission.findFirstOrThrow({
      where: { code: "VIEW_ASSIGNED_DATA" },
    });
    for (const role of [verticalRole, assignedRole]) {
      await prisma.rolePermission.create({
        data: tenantStamped({ roleId: role.id, permissionId: permAssigned.id }),
      });
    }

    async function makeUser(suffix: string, roleIds: string[], verticalIds: string[]) {
      const user = await prisma.user.create({
        data: tenantStamped({
          code: `${PREFIX}${suffix}`,
          name: `${PREFIX}${suffix}`,
          email: `${PREFIX.toLowerCase()}${suffix.toLowerCase()}@test.local`,
        }),
      });
      for (const roleId of roleIds) {
        await prisma.userRole.create({ data: tenantStamped({ userId: user.id, roleId }) });
      }
      for (const verticalId of verticalIds) {
        await prisma.userVertical.create({ data: tenantStamped({ userId: user.id, verticalId }) });
      }
      return user;
    }

    const soloUser = await makeUser("SOLO", [verticalRole.id], [verticalOne.id]);
    const bothUser = await makeUser("BOTH", [verticalRole.id], [verticalOne.id, verticalTwo.id]);
    const unionUser = await makeUser("UNION", [verticalRole.id, assignedRole.id], [verticalOne.id]);

    // Another tenant's vertical and scheme, for the isolation case. The tenant
    // is created unscoped — a tenant row cannot belong to a tenant scope.
    const foreignTenant = await prismaUnscoped.tenant.create({
      data: { slug: FOREIGN_TENANT_SLUG, name: `${PREFIX}Foreign Tenant` },
    });
    const foreign = await withTenantContext(foreignTenant.id, async () => {
      const foreignVertical = await prisma.vertical.create({
        data: tenantStamped({ code: `${PREFIX}FV`, name: `${PREFIX}Foreign Vertical` }),
      });
      const foreignScheme = await prisma.scheme.create({
        data: tenantStamped({
          code: `${PREFIX}FS`,
          name: `${PREFIX}Foreign Scheme`,
          verticalName: foreignVertical.name,
          verticalId: foreignVertical.id,
          sponsorshipType: SponsorshipType.STATE,
        }),
      });
      return { foreignVertical, foreignScheme };
    });

    return {
      foreignTenant,
      verticalOne,
      verticalTwo,
      schemeOne,
      schemeTwo,
      soloUser,
      bothUser,
      unionUser,
      foreignVertical: foreign.foreignVertical,
      foreignScheme: foreign.foreignScheme,
    };
  });
}

/** Resolve a user's scope the way a request would. */
async function scopeFor(userId: string): Promise<DataScope> {
  const dbUser = await loadDbUserWithRbac(userId);
  return withTenantContext(ODISHA_TENANT_ID, () => resolveDataScopeForUser(dbUser));
}

beforeAll(async () => {
  await enterTenantScope(ODISHA_TENANT_ID);
  fx = await seed();
}, 60_000);

afterAll(async () => {
  await cleanup();
});

describe("a vertical-scoped role resolves from the USER's memberships", () => {
  it("carries the caller's verticals, not anything stored on the role", async () => {
    const scope = await scopeFor(fx.soloUser.id);
    expect(scope.kind).toBe("restricted");
    if (scope.kind !== "restricted") return;
    expect(scope.verticalIds).toEqual([fx.verticalOne.id]);
  });

  it("sees schemes in its vertical and NOT schemes in another", async () => {
    const scope = await scopeFor(fx.soloUser.id);
    const rows = await withTenantContext(ODISHA_TENANT_ID, () =>
      prisma.scheme.findMany({
        where: { AND: [{ code: { startsWith: PREFIX } }, schemeWhere(scope)] },
        select: { id: true },
      }),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fx.schemeOne.id);
    expect(ids).not.toContain(fx.schemeTwo.id);
  });

  it("reaches a meeting-level action item through the item's OWN vertical", async () => {
    // No scheme on this row — the scheme-relation path alone would miss it.
    const scope = await scopeFor(fx.soloUser.id);
    const rows = await withTenantContext(ODISHA_TENANT_ID, () =>
      prisma.actionItem.findMany({
        where: { AND: [{ title: { startsWith: PREFIX } }, actionItemWhere(scope)] },
        select: { title: true },
      }),
    );
    expect(rows.map((r) => r.title)).toContain(`${PREFIX}Vertical-only item`);
  });
});

describe("memberships are a SET, not a single value", () => {
  it("a user in two verticals sees both", async () => {
    const scope = await scopeFor(fx.bothUser.id);
    expect(scope.kind).toBe("restricted");
    if (scope.kind !== "restricted") return;
    expect([...(scope.verticalIds ?? [])].sort()).toEqual(
      [fx.verticalOne.id, fx.verticalTwo.id].sort(),
    );

    const rows = await withTenantContext(ODISHA_TENANT_ID, () =>
      prisma.scheme.findMany({
        where: { AND: [{ code: { startsWith: PREFIX } }, schemeWhere(scope)] },
        select: { id: true },
      }),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fx.schemeOne.id);
    expect(ids).toContain(fx.schemeTwo.id);
  });

  it("adding a membership widens reach without touching the role", async () => {
    // The whole point of self-relative scope: the same role, a different person.
    const before = await scopeFor(fx.soloUser.id);
    expect(before.kind === "restricted" && before.verticalIds).toEqual([fx.verticalOne.id]);

    await withTenantContext(ODISHA_TENANT_ID, () =>
      prisma.userVertical.create({
        data: tenantStamped({ userId: fx.soloUser.id, verticalId: fx.verticalTwo.id }),
      }),
    );
    const after = await scopeFor(fx.soloUser.id);
    expect(after.kind).toBe("restricted");
    if (after.kind !== "restricted") return;
    expect([...(after.verticalIds ?? [])].sort()).toEqual(
      [fx.verticalOne.id, fx.verticalTwo.id].sort(),
    );

    // Put it back so later assertions see the solo user as solo.
    await withTenantContext(ODISHA_TENANT_ID, () =>
      prisma.userVertical.deleteMany({
        where: { userId: fx.soloUser.id, verticalId: fx.verticalTwo.id },
      }),
    );
  });
});

describe("union across roles takes the most permissive", () => {
  it("a user with both an assigned role and a vertical role carries both reaches", async () => {
    const scope = await scopeFor(fx.unionUser.id);
    expect(scope.kind).toBe("restricted");
    if (scope.kind !== "restricted") return;
    // The vertical arm, from the SAME_VERTICAL role…
    expect(scope.verticalIds).toEqual([fx.verticalOne.id]);
    // …and the assigned arm still present (own id, for the direct
    // performer/reviewer path) rather than replaced by it.
    expect(scope.userIds).toEqual([fx.unionUser.id]);
  });
});

describe("a vertical scope cannot cross a tenant boundary", () => {
  it("refuses to record a membership pointing at another tenant's vertical", async () => {
    // The chokepoint rejects a write whose FK targets a foreign tenant's row.
    await expect(
      withTenantContext(ODISHA_TENANT_ID, () =>
        prisma.userVertical.create({
          data: tenantStamped({ userId: fx.soloUser.id, verticalId: fx.foreignVertical.id }),
        }),
      ),
    ).rejects.toThrow();
  });

  it("returns no foreign rows even for a scope forged with a foreign vertical id", async () => {
    // Belt and braces: if a bug ever put a foreign id into a scope, isolation
    // must still hold, because the chokepoint AND-s tenantId independently of
    // anything the data-scope layer says.
    const forged: DataScope = {
      kind: "restricted",
      schemeIds: [],
      subschemeIds: [],
      userIds: [fx.soloUser.id],
      verticalIds: [fx.foreignVertical.id],
    };
    const rows = await withTenantContext(ODISHA_TENANT_ID, () =>
      prisma.scheme.findMany({ where: schemeWhere(forged), select: { id: true } }),
    );
    expect(rows.map((r) => r.id)).not.toContain(fx.foreignScheme.id);
    expect(rows).toEqual([]);
  });
});

describe("scopes without a vertical policy are unchanged", () => {
  it("a legacy restricted scope produces the same fragments it always did", () => {
    // No verticalIds key at all — the shape every VIEW_ASSIGNED_DATA caller gets.
    const legacy: DataScope = {
      kind: "restricted",
      schemeIds: ["s1"],
      subschemeIds: ["sub1"],
      userIds: ["u1"],
    };
    expect(schemeWhere(legacy)).toEqual({ id: { in: ["s1"] } });
    expect(subschemeWhere(legacy)).toEqual({ schemeId: { in: ["s1"] } });
    expect(financeBudgetWhere(legacy, "fy1")).toEqual({
      financialYearId: "fy1",
      schemeId: { in: ["s1"] },
    });
  });

  it("full scope still narrows nothing", () => {
    const full: DataScope = { kind: "full" };
    expect(schemeWhere(full)).toEqual({});
    expect(kpiDefinitionWhere(full)).toEqual({});
    expect(actionItemWhere(full)).toEqual({});
  });

  it("a vertical policy with NO memberships reaches nothing by vertical", () => {
    // Empty is not absent: `{ in: [] }` matches no row. The dangerous bug would
    // be treating "no memberships" as "no narrowing".
    const empty: DataScope = {
      kind: "restricted",
      schemeIds: [],
      subschemeIds: [],
      userIds: [],
      verticalIds: [],
    };
    expect(schemeWhere(empty)).toEqual({ verticalId: { in: [] } });
  });
});
