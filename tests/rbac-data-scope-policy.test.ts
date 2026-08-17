/**
 * Gate A's central claim: recording a role's data scope in a COLUMN changes
 * nothing about what that role can see.
 *
 * The product decides scope from two permissions today (lib/data-scope.ts):
 * VIEW_ALL_DATA → every row; VIEW_ASSIGNED_DATA → assigned rows only; neither →
 * nothing. `Role.dataScopePolicy` now records the same fact. This file asserts
 * the correspondence holds for every seeded role, in both directions, so the
 * column cannot quietly disagree with the permission that is still doing the
 * enforcing.
 *
 * It also pins the safety properties of the new vocabulary: the narrow default,
 * and the refusal to treat a policy the resolver cannot yet honour as if it were
 * harmless.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  SCOPE_DIMENSIONS,
  DIMENSION_BY_POLICY,
  RESOLVABLE_POLICIES,
  isResolvablePolicy,
} from "@/lib/rbac/scope-dimensions";

const require = createRequire(import.meta.url);
const seed = require("../prisma/seed_roles_core.cjs") as {
  ROLES: { code: string; name: string; permissions: string[] }[];
  dataScopePolicyFor: (permissions: string[]) => string;
};

/**
 * The rule lib/data-scope.ts applies at request time, restated independently.
 *
 * Deliberately NOT imported from the seed: if both sides came from the same
 * function the test would only prove the function equals itself. This is the
 * spec, written from the resolver's behaviour.
 */
function scopeFromPermissions(permissions: string[]): "ALL" | "ASSIGNED" {
  return permissions.includes("VIEW_ALL_DATA") ? "ALL" : "ASSIGNED";
}

describe("seeded roles keep the scope they already had", () => {
  it("every role's policy matches the permission that decides its scope today", () => {
    for (const role of seed.ROLES) {
      expect(seed.dataScopePolicyFor(role.permissions), `role ${role.code}`).toBe(
        scopeFromPermissions(role.permissions),
      );
    }
  });

  it("the roles that see everything are exactly the VIEW_ALL_DATA holders", () => {
    const byPolicy = seed.ROLES.filter((r) => seed.dataScopePolicyFor(r.permissions) === "ALL")
      .map((r) => r.code)
      .sort();
    const byPermission = seed.ROLES.filter((r) => r.permissions.includes("VIEW_ALL_DATA"))
      .map((r) => r.code)
      .sort();
    expect(byPolicy).toEqual(byPermission);
    // Named explicitly: a change here is a change to who can see the whole
    // tenant, and it should have to be made on purpose.
    expect(byPolicy).toEqual(["ACS", "FA"]);
  });

  it("the assigned-only roles are the rest, and none of them is an accident", () => {
    const assigned = seed.ROLES.filter((r) => seed.dataScopePolicyFor(r.permissions) === "ASSIGNED")
      .map((r) => r.code)
      .sort();
    expect(assigned).toEqual(["NODAL_OFFICER", "PROGRAMME_MANAGER", "TASU", "VERTICAL_HEAD"]);
    // TASU administers the tenant but is assigned-scoped — an administrator is
    // not automatically an everything-reader, and Gate A must not make it one.
    expect(seed.ROLES.find((r) => r.code === "TASU")!.permissions).toContain("MANAGE_PERMISSIONS");
  });

  it("a role holding no view permission gets the narrow policy, not the wide one", () => {
    expect(seed.dataScopePolicyFor([])).toBe("ASSIGNED");
    expect(seed.dataScopePolicyFor(["MANAGE_USERS"])).toBe("ASSIGNED");
  });
});

describe("the SAME_<dimension> vocabulary is honest about what it can do", () => {
  it("only ALL and ASSIGNED are resolvable in this cut", () => {
    expect([...RESOLVABLE_POLICIES].sort()).toEqual(["ALL", "ASSIGNED"]);
  });

  it("no dimension claims readiness without both a user side and a row side", () => {
    for (const dim of SCOPE_DIMENSIONS) {
      if (dim.ready) {
        expect(dim.userSide, `${dim.policy} user side`).not.toBeNull();
        expect(dim.rowSide, `${dim.policy} row side`).not.toBeNull();
        expect(dim.blockedBy, `${dim.policy} should not be blocked`).toBeNull();
      } else {
        // An unready dimension must say why, so the configurator can show it.
        expect(dim.blockedBy, `${dim.policy} must explain why it is unready`).toBeTruthy();
        expect(isResolvablePolicy(dim.policy), `${dim.policy}`).toBe(false);
      }
    }
  });

  it("every dimension policy has a catalog entry", () => {
    for (const policy of ["SAME_ULB", "SAME_ORGANISATION", "SAME_VERTICAL", "SAME_SECTION"]) {
      expect(DIMENSION_BY_POLICY.has(policy), policy).toBe(true);
    }
  });
});
