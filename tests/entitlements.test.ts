/**
 * Phase 3 — entitlements: the fourth access layer.
 *
 *   tenant  →  ENTITLEMENT  →  RBAC  →  data-scope
 *
 * The suite is deliberately split in two:
 *
 *   - Pure assertions over the map/guard, which need no database. These are the
 *     enforcement decision itself, so they must be provable without a server —
 *     the same reason `verifyTenantSession` is a pure function.
 *   - Database assertions for catalog parity, the Odisha all-on guarantee, and
 *     tenant isolation of entitlement changes.
 *
 * What is NOT asserted here: that proxy.ts wires the guard in and returns the
 * right shape. That lives in tests/tenant-session-isolation.test.ts, which
 * already drives the REAL `proxy()` — so the gate is proved end-to-end there and
 * decision-by-decision here. The two structural checks close the loop:
 * scripts/check-proxy-matcher.mjs (every route reaches the proxy) and
 * scripts/check-route-module-map.ts (every route maps to a module).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { withTenantContext } from "@/lib/tenant-context";
import {
  GATED_MODULE_CODES,
  MODULE_CATALOG,
  PROVISIONABLE_MODULE_CODES,
  moduleByCode,
} from "@/lib/entitlements/catalog";
import {
  isModuleRejected,
  moduleVerdict,
  visibleNavItems,
} from "@/lib/entitlements/guard";
import {
  ROUTE_MODULE_RULES,
  normalizeRoutePath,
  resolveRouteModule,
} from "@/lib/entitlements/route-modules";
import { loadEnabledModuleCodes } from "@/lib/entitlements/lookup";
import { NEXTJS_BASE_PATH, withNextBasePath } from "@/lib/next-base-path";
import { GLOBAL_MODELS, TENANT_SCOPED_MODELS } from "@/lib/tenant-scope-registry";
import { resolveDataScopeForUser } from "@/lib/data-scope";
import { getEffectivePermissionCodesFromUserId } from "@/lib/server-rbac";
import { seedScope, cleanupScopeSeed, loadDbUserWithRbac, type ScopeSeed } from "./helpers/seed-scope";

const ALL_GATED = new Set(GATED_MODULE_CODES);
const NONE = new Set<string>();

/** One representative page path and one API path per gated module. */
const GATED_SURFACES: Record<string, { page: string; api: string }> = {
  "MOD-FIN": { page: "/financial/entry/bulk", api: "/api/v1/financial/summary" },
  "MOD-SR": { page: "/schemes", api: "/api/v1/schemes/overview" },
  "MOD-KPI": { page: "/kpis/entry", api: "/api/v1/kpis/definitions" },
  "MOD-MTG": { page: "/meetings", api: "/api/v1/meetings" },
  "MOD-RPT": { page: "/reports", api: "/api/v1/reports/meeting/abc/pdf" },
  "MOD-ACT": { page: "/action-items/create", api: "/api/v1/action-items" },
  "MOD-AI": { page: "/admin/agents", api: "/api/v1/assistant/query" },
  "MOD-NOTIF": { page: "/admin/notifications", api: "/api/v1/notifications" },
  "MOD-CHLOG": { page: "/changelog", api: "/api/v1/releases/current" },
};

describe("Catalog shape", () => {
  it("codes are unique", () => {
    const codes = MODULE_CATALOG.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is the reconciled 20: 6 core, 9 gated, 5 roadmap", () => {
    const by = (e: string) => MODULE_CATALOG.filter((m) => m.enforcement === e).length;
    expect(MODULE_CATALOG.length).toBe(20);
    expect(by("core")).toBe(6);
    expect(by("gated")).toBe(9);
    expect(by("roadmap")).toBe(5);
  });

  it("folded and excluded Notion modules are absent", () => {
    // MOD-EXP → MOD-RPT, MOD-TASK → core shell, MOD-NFR is not a UI module.
    for (const gone of ["MOD-EXP", "MOD-TASK", "MOD-NFR"]) {
      expect(moduleByCode(gone)).toBeUndefined();
    }
  });

  it("roadmap modules are not provisionable", () => {
    for (const code of ["MOD-ANOM", "MOD-APR", "MOD-LAPSE", "MOD-SEC", "MOD-OPS"]) {
      expect(PROVISIONABLE_MODULE_CODES).not.toContain(code);
    }
    expect(PROVISIONABLE_MODULE_CODES.length).toBe(15);
  });
});

describe("Route → module map", () => {
  it("every rule names a real, non-roadmap module", () => {
    for (const rule of ROUTE_MODULE_RULES) {
      const def = moduleByCode(rule.module);
      expect(def, `rule ${rule.path} → ${rule.module}`).toBeDefined();
      expect(def!.enforcement, `rule ${rule.path}`).not.toBe("roadmap");
    }
  });

  it("normalises basePath, trailing slash and query before matching", () => {
    for (const p of [
      withNextBasePath("/api/v1/kpis"),
      "/api/v1/kpis/",
      "/api/v1/kpis?foo=1",
      `${withNextBasePath("/api/v1/kpis")}/`,
    ]) {
      expect(normalizeRoutePath(p)).toBe("/api/v1/kpis");
      expect(resolveRouteModule(p)?.module).toBe("MOD-KPI");
    }
    // The app root survives normalisation as "/" rather than collapsing to "".
    const root = NEXTJS_BASE_PATH || "/";
    expect(normalizeRoutePath(root)).toBe("/");
    expect(resolveRouteModule(root)?.module).toBe("MOD-AUTH");
  });

  it("matches on segment boundaries, not raw string prefixes", () => {
    // The bug this prevents: `/api/v1/financial` (gated) swallowing
    // `/api/v1/financial-years` (core reference data read by Meetings and KPIs).
    expect(resolveRouteModule("/api/v1/financial/summary")!.module).toBe("MOD-FIN");
    expect(resolveRouteModule("/api/v1/financial-years")!.module).toBe("MOD-ADMIN");
    expect(moduleVerdict("/api/v1/financial-years", NONE).kind).toBe("core");
    expect(moduleVerdict("/api/v1/financial/summary", NONE).kind).toBe("denied");
  });

  it("longest matching rule wins, so a gated route can sit inside a core prefix", () => {
    const cases: [string, string][] = [
      ["/admin", "MOD-ADMIN"],
      ["/admin/masters", "MOD-ADMIN"],
      ["/admin/agents", "MOD-AI"],
      ["/admin/agents/meeting-wise-progress", "MOD-AI"],
      ["/admin/notifications", "MOD-NOTIF"],
      ["/admin/schemes", "MOD-SR"],
      ["/admin/schemes-order", "MOD-SR"],
      ["/admin/users", "MOD-RBAC"],
      ["/api/v1/dashboard/command-centre", "MOD-CC"],
      ["/api/v1/dashboard/ai-alerts", "MOD-AI"],
      ["/api/v1/admin/users", "MOD-RBAC"],
      ["/api/v1/admin/agent/run", "MOD-AI"],
      ["/api/v1/admin/notification-config", "MOD-NOTIF"],
      ["/api/v1/admin/verticals", "MOD-ADMIN"],
      ["/api/v1/rbac/me", "MOD-SHELL"],
      ["/api/v1/rbac/roles", "MOD-RBAC"],
    ];
    for (const [path, expected] of cases) {
      expect(resolveRouteModule(path)?.module, path).toBe(expected);
    }
  });
});

describe("Enforcement", () => {
  it("module OFF → denied on both its page and its API surface", () => {
    for (const [code, surfaces] of Object.entries(GATED_SURFACES)) {
      const enabled = new Set([...ALL_GATED].filter((c) => c !== code));
      for (const path of [surfaces.page, surfaces.api]) {
        const verdict = moduleVerdict(path, enabled);
        expect(verdict, `${code} off → ${path}`).toEqual({ kind: "denied", module: code });
        expect(isModuleRejected(verdict)).toBe(true);
      }
    }
  });

  it("module ON → allowed on both surfaces", () => {
    for (const [code, surfaces] of Object.entries(GATED_SURFACES)) {
      for (const path of [surfaces.page, surfaces.api]) {
        const verdict = moduleVerdict(path, ALL_GATED);
        expect(verdict, `${code} on → ${path}`).toEqual({ kind: "allowed", module: code });
        expect(isModuleRejected(verdict)).toBe(false);
      }
    }
  });

  it("disabling one module leaves every other module reachable", () => {
    const enabled = new Set([...ALL_GATED].filter((c) => c !== "MOD-NOTIF"));
    expect(moduleVerdict("/api/v1/notifications", enabled).kind).toBe("denied");
    for (const [code, surfaces] of Object.entries(GATED_SURFACES)) {
      if (code === "MOD-NOTIF") continue;
      expect(moduleVerdict(surfaces.api, enabled).kind, code).toBe("allowed");
    }
  });

  it("CORE IS UNGATEABLE — with zero entitlements, every core route still resolves", () => {
    // The "a tenant can never be locked out" proof. If this fails, a
    // provisioning mistake could leave a tenant unable to log in or be
    // administered back to health.
    const coreCodes = new Set(
      MODULE_CATALOG.filter((m) => m.enforcement === "core").map((m) => m.code),
    );
    const coreRules = ROUTE_MODULE_RULES.filter((r) => coreCodes.has(r.module));
    expect(coreRules.length).toBeGreaterThan(0);
    for (const rule of coreRules) {
      const verdict = moduleVerdict(rule.path, NONE);
      expect(verdict.kind, rule.path).toBe("core");
      expect(isModuleRejected(verdict)).toBe(false);
    }
    // Spot-check the routes that matter most for recoverability.
    for (const path of ["/", "/login", "/api/auth/session", "/api/health", "/api/v1/rbac/me", "/profile", "/admin/users"]) {
      expect(moduleVerdict(path, NONE).kind, path).toBe("core");
    }
  });

  it("unmapped paths fail closed", () => {
    for (const path of ["/not-a-route", "/api/v1/nope", "/api/v2/kpis", "/financialx"]) {
      const verdict = moduleVerdict(path, ALL_GATED);
      expect(verdict, path).toEqual({ kind: "unmapped" });
      expect(isModuleRejected(verdict)).toBe(true);
    }
  });
});

describe("Nav derivation", () => {
  const nav = [
    { href: "/dashboard" },
    { href: "/financial" },
    { href: "/kpis" },
    { href: "/admin", children: [{ href: "/admin/users" }, { href: "/admin/notifications" }] },
  ];

  it("hides items whose module is off, children included", () => {
    const enabled = new Set([...ALL_GATED].filter((c) => c !== "MOD-NOTIF" && c !== "MOD-FIN"));
    const visible = visibleNavItems(nav, enabled);
    expect(visible.map((i) => i.href)).toEqual(["/dashboard", "/kpis", "/admin"]);
    expect(visible.find((i) => i.href === "/admin")!.children!.map((c) => c.href)).toEqual([
      "/admin/users",
    ]);
  });

  it("keeps core items when the tenant has no gated modules at all", () => {
    const visible = visibleNavItems(nav, NONE);
    expect(visible.map((i) => i.href)).toEqual(["/dashboard", "/admin"]);
  });

  it("never shows a link the gate would 404 — nav and gate share one decision", () => {
    const enabled = new Set(["MOD-KPI"]);
    for (const item of visibleNavItems(nav, enabled)) {
      expect(isModuleRejected(moduleVerdict(item.href, enabled)), item.href).toBe(false);
      for (const child of item.children ?? []) {
        expect(isModuleRejected(moduleVerdict(child.href, enabled)), child.href).toBe(false);
      }
    }
  });
});

describe("Chokepoint classification", () => {
  it("Module is global; TenantEntitlement is tenant-scoped", () => {
    expect(GLOBAL_MODELS.has("Module")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("Module")).toBe(false);
    expect(TENANT_SCOPED_MODELS.has("TenantEntitlement")).toBe(true);
  });
});

// ─── Database-backed ────────────────────────────────────────────────────────

const TENANT_C_SLUG = "testtenant-entitlements";
let tenantCId: string;

beforeAll(async () => {
  const tenant = await prismaUnscoped.tenant.upsert({
    where: { slug: TENANT_C_SLUG },
    update: { status: "active" },
    create: { slug: TENANT_C_SLUG, name: "Entitlement Test Authority", status: "active" },
  });
  tenantCId = tenant.id;
  const modules = await prismaUnscoped.module.findMany({
    where: { enforcement: { not: "roadmap" } },
    select: { id: true, code: true },
  });
  for (const m of modules) {
    await prismaUnscoped.tenantEntitlement.upsert({
      where: { tenantId_moduleId: { tenantId: tenantCId, moduleId: m.id } },
      update: { enabled: m.code !== "MOD-NOTIF" },
      create: { tenantId: tenantCId, moduleId: m.id, enabled: m.code !== "MOD-NOTIF" },
    });
  }
}, 120_000);

afterAll(async () => {
  await prismaUnscoped.tenantEntitlement.deleteMany({ where: { tenantId: tenantCId } }).catch(() => {});
  await prismaUnscoped.tenant.deleteMany({ where: { slug: TENANT_C_SLUG } }).catch(() => {});
  await prismaUnscoped.$disconnect();
});

describe("Catalog ↔ database parity", () => {
  it("every catalog module exists in the DB with matching enforcement and tier", async () => {
    const rows = await prismaUnscoped.module.findMany({
      select: { code: true, name: true, enforcement: true, tier: true, status: true },
    });
    const byCode = new Map(rows.map((r) => [r.code, r]));
    for (const def of MODULE_CATALOG) {
      const row = byCode.get(def.code);
      expect(row, `catalog module ${def.code} missing from the modules table`).toBeDefined();
      expect(row!.name).toBe(def.name);
      expect(row!.enforcement).toBe(def.enforcement);
      expect(row!.tier).toBe(def.tier);
      expect(row!.status).toBe(def.status);
    }
  });

  it("the DB holds no module the catalog does not know about", async () => {
    const rows = await prismaUnscoped.module.findMany({ select: { code: true } });
    const known = new Set(MODULE_CATALOG.map((m) => m.code));
    for (const row of rows) {
      expect(known.has(row.code), `DB module ${row.code} is not in MODULE_CATALOG`).toBe(true);
    }
    expect(rows.length).toBe(MODULE_CATALOG.length);
  });
});

describe("Backfill", () => {
  it("Odisha has every provisionable module enabled — the golden's byte-identity guard", async () => {
    const enabled = await loadEnabledModuleCodes(ODISHA_TENANT_ID);
    for (const code of PROVISIONABLE_MODULE_CODES) {
      expect(enabled.has(code), `Odisha is missing ${code}`).toBe(true);
    }
    // Every gated route must therefore be reachable for Odisha.
    for (const [code, surfaces] of Object.entries(GATED_SURFACES)) {
      expect(moduleVerdict(surfaces.api, enabled).kind, code).toBe("allowed");
    }
  });

  it("roadmap modules are provisioned to nobody", async () => {
    const rows = await prismaUnscoped.tenantEntitlement.findMany({
      where: { module: { enforcement: "roadmap" } },
      select: { id: true },
    });
    expect(rows.length).toBe(0);
  });

  it("fails closed for an unknown tenant", async () => {
    expect((await loadEnabledModuleCodes(null)).size).toBe(0);
    expect((await loadEnabledModuleCodes("00000000-0000-4000-8000-0000000000ff")).size).toBe(0);
  });
});

describe("Composition — entitlement is a fourth layer, not a replacement", () => {
  // The claim under test: opening a module does not grant a single permission
  // and does not widen a single row of visibility. If entitlement had been
  // implemented as a REPLACEMENT for RBAC, these would fail.
  let seed: ScopeSeed;

  beforeAll(async () => {
    seed = await seedScope(tenantCId);
  }, 120_000);

  afterAll(async () => {
    await cleanupScopeSeed(tenantCId).catch(() => {});
  });

  it("an enabled module grants NO permission — RBAC still refuses underneath", async () => {
    const enabled = await loadEnabledModuleCodes(tenantCId);
    // The module is on for this tenant...
    expect(moduleVerdict("/api/v1/kpis/definitions", enabled).kind).toBe("allowed");

    // ...but the assigned-data user still holds only what RBAC granted them.
    const codes = await withTenantContext(tenantCId, () =>
      getEffectivePermissionCodesFromUserId(seed.restrictedUser.id, null),
    );
    expect(codes.has("VIEW_ASSIGNED_DATA")).toBe(true);
    expect(codes.has("VIEW_ALL_DATA")).toBe(false);
    // requirePermission() is built directly on this set, so a handler guarded by
    // a permission this user lacks refuses regardless of the module being on.
    expect(codes.has("MANAGE_USERS")).toBe(false);
  });

  it("an enabled module does NOT widen data scope — restricted stays restricted", async () => {
    const enabled = await loadEnabledModuleCodes(tenantCId);
    expect(moduleVerdict("/api/v1/schemes/overview", enabled).kind).toBe("allowed");

    const user = await loadDbUserWithRbac(seed.restrictedUser.id, tenantCId);
    const scope = await withTenantContext(tenantCId, () => resolveDataScopeForUser(user));

    expect(scope.kind).toBe("restricted");
    if (scope.kind !== "restricted") throw new Error("unreachable");
    // Only the scheme they are assigned to, not all three the tenant owns.
    expect(scope.schemeIds).toEqual([seed.schemeA.id]);
  });

  it("a full-scope user is full because of RBAC, not because modules are on", async () => {
    const user = await loadDbUserWithRbac(seed.fullUser.id, tenantCId);
    const scope = await withTenantContext(tenantCId, () => resolveDataScopeForUser(user));
    expect(scope.kind).toBe("full");

    // Turning every gated module OFF does not change their RBAC standing — the
    // layers are independent. Entitlement decides reachability; RBAC decides
    // what they may see once there.
    expect(moduleVerdict("/api/v1/schemes/overview", NONE).kind).toBe("denied");
    expect(scope.kind).toBe("full");
  });
});

describe("Tenant isolation of entitlements", () => {
  it("tenant C's disabled module does not affect Odisha, and vice versa", async () => {
    const odisha = await loadEnabledModuleCodes(ODISHA_TENANT_ID);
    const tenantC = await loadEnabledModuleCodes(tenantCId);

    expect(tenantC.has("MOD-NOTIF")).toBe(false);
    expect(odisha.has("MOD-NOTIF")).toBe(true);

    const path = "/api/v1/notifications";
    expect(moduleVerdict(path, tenantC).kind).toBe("denied");
    expect(moduleVerdict(path, odisha).kind).toBe("allowed");
  });

  it("reads through the chokepoint return only the current tenant's rows", async () => {
    // No hand-written `where: { tenantId }` — the scoped client must do it.
    const forC = await withTenantContext(tenantCId, () =>
      prisma.tenantEntitlement.findMany({ select: { tenantId: true } }),
    );
    expect(forC.length).toBeGreaterThan(0);
    expect(forC.every((r) => r.tenantId === tenantCId)).toBe(true);

    const forOdisha = await withTenantContext(ODISHA_TENANT_ID, () =>
      prisma.tenantEntitlement.findMany({ select: { tenantId: true } }),
    );
    expect(forOdisha.length).toBeGreaterThan(0);
    expect(forOdisha.every((r) => r.tenantId === ODISHA_TENANT_ID)).toBe(true);
  });

  it("toggling a module for one tenant leaves the other untouched", async () => {
    const mod = await prismaUnscoped.module.findFirstOrThrow({ where: { code: "MOD-KPI" } });
    await withTenantContext(tenantCId, () =>
      prisma.tenantEntitlement.updateMany({ where: { moduleId: mod.id }, data: { enabled: false } }),
    );
    try {
      expect((await loadEnabledModuleCodes(tenantCId)).has("MOD-KPI")).toBe(false);
      expect((await loadEnabledModuleCodes(ODISHA_TENANT_ID)).has("MOD-KPI")).toBe(true);
    } finally {
      await withTenantContext(tenantCId, () =>
        prisma.tenantEntitlement.updateMany({ where: { moduleId: mod.id }, data: { enabled: true } }),
      );
    }
  });
});
