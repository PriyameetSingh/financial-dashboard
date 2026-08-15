import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { toAuthErrorResponse, requirePermission } from "@/lib/server-rbac";
import { getTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG } from "@/lib/entitlements/catalog";
import { moduleWithinCeiling, planCeiling, resolveGrants } from "@/lib/entitlements/plan";

/**
 * Entitlements admin API — the menu-card configurator's read and write path.
 *
 * THE CEILING IS THE POINT. A tenant administrator may switch modules on and
 * off inside the plan their organization bought, and may not switch on anything
 * above it. That is not a UI concern: the toggle is a `PUT` anyone with the
 * permission can issue by hand, so the ceiling is enforced here, on the server,
 * against `Tenant.planTier` — read from the resolved tenant, never from the
 * request body.
 *
 * `resolveGrants` is the same function onboarding calls. One implementation, so
 * a tenant cannot reach through this door what the other refuses.
 *
 * TENANCY. `TenantEntitlement` is tenant-scoped, so the Prisma chokepoint filters
 * every query below to the resolved tenant automatically — unlike
 * `TenantConfigEntry`, which is global and has to be scoped by hand. The
 * `tenantId` is still read explicitly for the ceiling lookup, and it comes from
 * the host-derived, database-validated resolution.
 *
 * PERMISSION. `MANAGE_TENANT_CONFIG`, the same permission the tenant-config API
 * uses. The menu card is tenant configuration; splitting it into a second
 * permission nobody has been granted would mean shipping a screen that no
 * existing role can open.
 */
export const runtime = "nodejs";

const MANAGE = "MANAGE_TENANT_CONFIG";

/**
 * GET — every module, what this tenant has, and what its plan reaches.
 *
 * Modules ABOVE the ceiling are returned, marked `withinPlan: false`. Hiding
 * them would make the screen lie by omission: an administrator comparing plans
 * needs to see what the next one adds, and the public pricing page lists them
 * anyway. What matters is that they cannot be switched on, and that is decided
 * by the PUT below, not by whether the GET mentions them.
 */
export async function GET() {
  try {
    await requirePermission(MANAGE);
    const { tenantId } = await getTenantContext();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planTier: true },
    });
    const ceiling = planCeiling(tenant?.planTier ?? null);

    const rows = await prisma.tenantEntitlement.findMany({
      select: { enabled: true, module: { select: { code: true } } },
    });
    const enabledCodes = new Set(rows.filter((r) => r.enabled).map((r) => r.module.code));

    const modules = MODULE_CATALOG.map((mod) => ({
      code: mod.code,
      name: mod.name,
      enforcement: mod.enforcement,
      tier: mod.tier,
      status: mod.status,
      // Core modules read as enabled whatever the rows say — the request-time
      // guard lets them through regardless, so reporting anything else here
      // would describe a state the product does not actually have.
      enabled: mod.enforcement === "core" ? true : enabledCodes.has(mod.code),
      withinPlan: moduleWithinCeiling(mod.code, ceiling),
      /** Core modules cannot be switched off; roadmap ones cannot be switched on. */
      locked: mod.enforcement !== "gated",
    }));

    return NextResponse.json({ planTier: ceiling, modules });
  } catch (error) {
    // `toAuthErrorResponse` maps an auth failure to `{ status, detail }` — a
    // plain object, not a Response. The same shape the tenant-config route
    // uses; anything it does not recognise is rethrown rather than swallowed
    // into a misleading 4xx.
    const mapped = toAuthErrorResponse(error);
    if (mapped) return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    throw error;
  }
}

/**
 * PUT — set the enabled gated modules for this tenant.
 *
 * Whole-set semantics rather than per-toggle: the configurator sends the state
 * it wants and the server reconciles. A per-toggle endpoint would need the
 * client to have read the current state correctly, which is exactly the
 * assumption that goes wrong when two administrators have the page open.
 *
 * The response reports what was denied. An administrator who ticked something
 * above their plan is told so, rather than watching a switch spring back with
 * no explanation.
 */
export async function PUT(request: NextRequest) {
  try {
    await requirePermission(MANAGE);
    const { tenantId } = await getTenantContext();

    const body = (await request.json().catch(() => null)) as { modules?: unknown } | null;
    if (!body || !Array.isArray(body.modules) || body.modules.some((c) => typeof c !== "string")) {
      return NextResponse.json({ detail: "`modules` must be an array of module codes" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planTier: true },
    });
    const ceiling = planCeiling(tenant?.planTier ?? null);

    // THE ENFORCEMENT. Everything the caller asked for is intersected with what
    // the plan reaches; nothing else in this handler decides what gets enabled.
    const { enabled, denied } = resolveGrants(body.modules as string[], ceiling);
    const enabledSet = new Set(enabled);

    const catalogRows = await prisma.module.findMany({
      where: { code: { in: MODULE_CATALOG.filter((m) => m.enforcement !== "roadmap").map((m) => m.code) } },
      select: { id: true, code: true, tier: true },
    });

    // Upserted one at a time rather than as a bulk `updateMany`, because a
    // tenant may have no row at all for a module it has never had — the two
    // cases are "flip a flag" and "create a grant", and upsert is the only
    // operation that is both.
    await prisma.$transaction(
      catalogRows.map((mod) =>
        prisma.tenantEntitlement.upsert({
          where: { tenantId_moduleId: { tenantId, moduleId: mod.id } },
          update: { enabled: enabledSet.has(mod.code) },
          create: {
            tenantId,
            moduleId: mod.id,
            enabled: enabledSet.has(mod.code),
            tier: mod.tier,
          },
        }),
      ),
    );

    return NextResponse.json({
      planTier: ceiling,
      enabled,
      denied,
    });
  } catch (error) {
    // `toAuthErrorResponse` maps an auth failure to `{ status, detail }` — a
    // plain object, not a Response. The same shape the tenant-config route
    // uses; anything it does not recognise is rethrown rather than swallowed
    // into a misleading 4xx.
    const mapped = toAuthErrorResponse(error);
    if (mapped) return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    throw error;
  }
}
