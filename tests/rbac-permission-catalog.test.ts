/**
 * The permission catalog has three copies. This is the guard that they agree.
 *
 *   1. `Permission` enum        src/types/index.ts      — what app code references
 *   2. `PERMISSION_CATALOG`     lib/rbac/permission-catalog.ts — labels + metadata
 *   3. `PERMISSIONS` array      prisma/seed_roles_core.cjs — what the seed writes
 *
 * They cannot be a single module: the seed is CommonJS run by plain node, the
 * enum is consumed by client bundles. So they are mirrored and guarded, the same
 * arrangement scripts/lib/next-base-path.mjs uses.
 *
 * Drift here is not cosmetic. A code in the enum but not the seed is a
 * permission no database row backs — every `requirePermission` on it denies
 * everyone, silently. A code in the seed but not the catalog gets no owning
 * module, so the entitlement ceiling cannot judge it.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Permission } from "@/src/types/index";
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_BY_CODE,
  isKnownPermission,
  owningModuleFor,
} from "@/lib/rbac/permission-catalog";
import { MODULE_CATALOG } from "@/lib/entitlements/catalog";

const require = createRequire(import.meta.url);
const seed = require("../prisma/seed_roles_core.cjs") as {
  PERMISSIONS: { code: string; name: string; group: string; owningModule: string | null }[];
  ROLES: { code: string; permissions: string[] }[];
};

const enumCodes = Object.values(Permission).sort();
const catalogCodes = PERMISSION_CATALOG.map((p) => p.code).sort();
const seedCodes = seed.PERMISSIONS.map((p) => p.code).sort();

describe("the three copies of the permission catalog agree", () => {
  it("the TypeScript enum and the catalog list the same codes", () => {
    expect(catalogCodes).toEqual(enumCodes);
  });

  it("the seed array and the catalog list the same codes", () => {
    expect(seedCodes).toEqual(catalogCodes);
  });

  it("labels, groups and owning modules match code for code", () => {
    for (const entry of seed.PERMISSIONS) {
      const catalog = PERMISSION_BY_CODE.get(entry.code);
      expect(catalog, `${entry.code} missing from the catalog`).toBeDefined();
      expect(catalog!.label, `${entry.code} label`).toBe(entry.name);
      expect(catalog!.group, `${entry.code} group`).toBe(entry.group);
      expect(catalog!.owningModule, `${entry.code} owningModule`).toBe(entry.owningModule);
    }
  });

  it("has no duplicate codes", () => {
    expect(new Set(catalogCodes).size).toBe(catalogCodes.length);
  });
});

describe("catalog metadata is usable", () => {
  it("every group is one of the declared groups", () => {
    for (const entry of PERMISSION_CATALOG) {
      expect(PERMISSION_GROUPS, `${entry.code}`).toContain(entry.group);
    }
  });

  it("every owning module is a real module code", () => {
    const known = new Set(MODULE_CATALOG.map((m) => m.code));
    for (const entry of PERMISSION_CATALOG) {
      if (entry.owningModule === null) continue;
      expect(known, `${entry.code} → ${entry.owningModule}`).toContain(entry.owningModule);
    }
  });

  it("keeps the permissions that administer a tenant OUT of any module", () => {
    // If these were module-gated, a tenant without that module could not manage
    // its own users or roles — and could not grant itself the ability to.
    for (const code of ["MANAGE_USERS", "MANAGE_PERMISSIONS", "VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA"]) {
      expect(owningModuleFor(code), code).toBeNull();
      expect(isKnownPermission(code)).toBe(true);
    }
  });

  it("does not mistake an unknown code for a core permission", () => {
    // owningModuleFor returns null for BOTH "core" and "no such permission", so
    // existence has to be asked separately — this is the trap that check exists for.
    expect(isKnownPermission("NOT_A_PERMISSION")).toBe(false);
    expect(owningModuleFor("NOT_A_PERMISSION")).toBeNull();
  });
});

describe("every seeded role bundles only real permissions", () => {
  it("no role references a permission outside the catalog", () => {
    for (const role of seed.ROLES) {
      for (const code of role.permissions) {
        expect(isKnownPermission(code), `role ${role.code} references ${code}`).toBe(true);
      }
    }
  });
});
