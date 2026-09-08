/**
 * Phase 5 prerequisite — proves `withTenantContext` stays isolated when
 * invoked N times in sequence (and concurrently) within ONE process, which is
 * exactly the shape Fleet Console's route uses: loop over every tenant,
 * calling `withTenantContext(tenant.id, () => buildTenantExportPayload(tenant.id))`
 * once per tenant, inside one permission-gated request.
 *
 * Every prior caller of `withTenantContext` was single-tenant-at-a-time — a
 * script's own entry point, or one test fixture's own scope
 * (`tests/tenant-isolation.test.ts` calls it once per assertion, never twice
 * in the same call stack for two DIFFERENT tenants back to back). Nothing
 * before this pinned "N calls in a row, in the same request/process" the way
 * `tests/tenant-isolation.test.ts` pins the chokepoint itself — see
 * `docs/plan.md` (Phase 5 §2), which named this exact gap and said it should
 * close before Fleet Console ships, not after.
 *
 * THIS TEST BLOCKS `app/fleet/page.tsx`, not the other way around: it must be
 * written and green before that route exists.
 *
 * N=2: the real Odisha tenant plus the seeded "demo" tenant fixture (same
 * fixed id every other test file that needs a second tenant uses — safe to
 * reuse because `vitest.config.mjs` sets `fileParallelism: false`, so only
 * one file's beforeAll/afterAll ever touches it at a time).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { withTenantContext } from "@/lib/tenant-context";
import { buildTenantExportPayload } from "@/lib/entitlements/export";

const DEMO_TENANT_ID = "00000000-0000-4000-8000-0000000000d0";
const DEMO_SLUG = "demo";
/** A value that cannot coincidentally equal Odisha's real productName. */
const DEMO_PRODUCT_NAME = "Fleet-Loop-Isolation-Probe";

async function seedDemoTenant() {
  await removeDemoTenant();
  await prismaUnscoped.tenant.create({
    data: { id: DEMO_TENANT_ID, slug: DEMO_SLUG, name: "Suryapur Development Authority", status: "active" },
  });
  await prismaUnscoped.tenantConfigEntry.create({
    data: { tenantId: DEMO_TENANT_ID, key: "productName", value: DEMO_PRODUCT_NAME },
  });
}

async function removeDemoTenant() {
  await prismaUnscoped.tenantConfigEntry.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }).catch(() => {});
  await prismaUnscoped.tenant.deleteMany({ where: { id: DEMO_TENANT_ID } }).catch(() => {});
}

beforeAll(async () => {
  await seedDemoTenant();
}, 60_000);

afterAll(async () => {
  await removeDemoTenant();
  await prismaUnscoped.$disconnect();
});

describe("withTenantContext, invoked N times in one process (the Fleet Console loop shape)", () => {
  it("sequential loop over [Odisha, demo]: each payload carries only its own tenant's identity and config", async () => {
    const order = [ODISHA_TENANT_ID, DEMO_TENANT_ID];
    const payloads = [];
    for (const id of order) {
      payloads.push(await withTenantContext(id, () => buildTenantExportPayload(id)));
    }
    const [odisha, demo] = payloads;

    expect(demo.tenant.slug).toBe(DEMO_SLUG);
    expect(demo.config.productName).toBe(DEMO_PRODUCT_NAME);

    expect(odisha.tenant.slug).not.toBe(DEMO_SLUG);
    expect(odisha.config.productName).not.toBe(DEMO_PRODUCT_NAME);
  });

  it("reversed order gives the same per-tenant answer — not order-dependent", async () => {
    const demo = await withTenantContext(DEMO_TENANT_ID, () => buildTenantExportPayload(DEMO_TENANT_ID));
    const odisha = await withTenantContext(ODISHA_TENANT_ID, () => buildTenantExportPayload(ODISHA_TENANT_ID));

    expect(demo.config.productName).toBe(DEMO_PRODUCT_NAME);
    expect(odisha.config.productName).not.toBe(DEMO_PRODUCT_NAME);
  });

  it("N=4 alternating (A,B,A,B) in one array — no bleed across repeats", async () => {
    const order = [ODISHA_TENANT_ID, DEMO_TENANT_ID, ODISHA_TENANT_ID, DEMO_TENANT_ID];
    const results = [];
    for (const id of order) {
      results.push(await withTenantContext(id, () => buildTenantExportPayload(id)));
    }

    expect(results[0].tenant.slug).toBe(results[2].tenant.slug);
    expect(results[1].tenant.slug).toBe(results[3].tenant.slug);
    expect(results[0].tenant.slug).not.toBe(results[1].tenant.slug);
    expect(results[1].config.productName).toBe(DEMO_PRODUCT_NAME);
    expect(results[3].config.productName).toBe(DEMO_PRODUCT_NAME);
    expect(results[0].config.productName).not.toBe(DEMO_PRODUCT_NAME);
    expect(results[2].config.productName).not.toBe(DEMO_PRODUCT_NAME);
  });

  it("concurrent Promise.all across tenants stays isolated (AsyncLocalStorage frames do not cross)", async () => {
    const [odisha, demo] = await Promise.all([
      withTenantContext(ODISHA_TENANT_ID, () => buildTenantExportPayload(ODISHA_TENANT_ID)),
      withTenantContext(DEMO_TENANT_ID, () => buildTenantExportPayload(DEMO_TENANT_ID)),
    ]);

    expect(demo.config.productName).toBe(DEMO_PRODUCT_NAME);
    expect(odisha.config.productName).not.toBe(DEMO_PRODUCT_NAME);
  });

  it("a direct tenant-scoped read inside each loop iteration sees only that iteration's tenant", async () => {
    for (const id of [ODISHA_TENANT_ID, DEMO_TENANT_ID]) {
      const rows = await withTenantContext(id, () =>
        prisma.tenantEntitlement.findMany({ select: { tenantId: true } }),
      );
      expect(rows.every((r) => r.tenantId === id)).toBe(true);
    }
  });
});
