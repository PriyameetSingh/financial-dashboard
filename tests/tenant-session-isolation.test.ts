/**
 * Phase 2 — SESSION-layer tenant isolation (the path the query chokepoint
 * cannot see).
 *
 * A NextAuth JWT is a bearer credential presented with whatever Host the client
 * chooses. If a session minted for tenant A were accepted on tenant B's host,
 * the caller would be a fully authenticated principal and the chokepoint would
 * then scope them *into B* — correct-looking queries, wrong tenant. Data-layer
 * tests cannot catch this, because by query time the request already claims to
 * be B's.
 *
 * These tests drive the REAL middleware (`proxy()` from proxy.ts) with a
 * forged-host request and a mocked token, and assert the request is REJECTED —
 * never forwarded, never re-scoped.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const getTokenMock = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => getTokenMock(...args) }));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { prismaUnscoped } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { TENANT_HEADER } from "@/lib/tenant-config/resolution";
import { verifyTenantSession, isTenantSessionRejected } from "@/lib/tenant-session";

const B_SLUG = "sessiontenant-b";
const A_HOST = "odisha.airawat.test";
const B_HOST = `${B_SLUG}.airawat.test`;

let tenantBId: string;

function request(host: string, path: string): NextRequest {
  return new NextRequest(new URL(`https://${host}${path}`), {
    headers: { host, "x-forwarded-proto": "https" },
  });
}

/** A token as minted by the jwt callback for a given tenant. */
function tokenFor(tenantId: string | undefined) {
  return { sub: "u1", email: "officer@example.test", preferred_username: "officer", iat: 1, tenantId };
}

beforeAll(async () => {
  await prismaUnscoped.tenant.update({ where: { id: ODISHA_TENANT_ID }, data: { slug: "odisha" } });
  const b = await prismaUnscoped.tenant.upsert({
    where: { slug: B_SLUG },
    update: { status: "active" },
    create: { slug: B_SLUG, name: "Session Test Authority", status: "active" },
  });
  tenantBId = b.id;

  // Phase 3: provision tenant B the way onboarding will — every provisionable
  // module on, except Notifications. Without entitlement rows a tenant is
  // entitled to core and nothing else (fail closed), so an unprovisioned
  // fixture would 404 on every gated route. The one disabled module gives the
  // gate a real negative case to prove at the proxy level below.
  const modules = await prismaUnscoped.module.findMany({
    where: { enforcement: { not: "roadmap" } },
    select: { id: true, code: true },
  });
  for (const m of modules) {
    await prismaUnscoped.tenantEntitlement.upsert({
      where: { tenantId_moduleId: { tenantId: tenantBId, moduleId: m.id } },
      update: { enabled: m.code !== "MOD-NOTIF" },
      create: { tenantId: tenantBId, moduleId: m.id, enabled: m.code !== "MOD-NOTIF" },
    });
  }

  // A directory row matching the mocked token. PAGE requests run
  // `getSessionBlockReason` (an unregistered SSO identity is bounced to login)
  // BEFORE the entitlement gate — a broken session must redirect, not 404 — so
  // without this row the page-surface cases would 307 and never reach the gate.
  await prismaUnscoped.user.deleteMany({ where: { tenantId: tenantBId } });
  await prismaUnscoped.user.create({
    data: {
      tenantId: tenantBId,
      code: "officer",
      name: "Session Test Officer",
      email: "officer@example.test",
    },
  });
});

afterAll(async () => {
  await prismaUnscoped.user.deleteMany({ where: { tenantId: tenantBId } }).catch(() => {});
  await prismaUnscoped.tenantEntitlement.deleteMany({ where: { tenantId: tenantBId } }).catch(() => {});
  await prismaUnscoped.tenant.deleteMany({ where: { slug: B_SLUG } }).catch(() => {});
  await prismaUnscoped.$disconnect();
});

describe("Cross-tenant session replay is rejected (both directions)", () => {
  it("a session minted for Odisha, replayed against tenant B's host, is rejected on the API surface", async () => {
    getTokenMock.mockResolvedValue(tokenFor(ODISHA_TENANT_ID));
    const res = await proxy(request(B_HOST, "/hudd-dashboard/api/v1/schemes"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: "tenant_mismatch" });
    // Crucially: NOT forwarded. A forwarded response would mean the request
    // proceeded and was silently scoped into tenant B.
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("a session minted for tenant B, replayed against Odisha's host, is rejected", async () => {
    getTokenMock.mockResolvedValue(tokenFor(tenantBId));
    const res = await proxy(request(A_HOST, "/hudd-dashboard/api/v1/schemes"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: "tenant_mismatch" });
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("a replayed session on a PAGE route is bounced to login and its cookies cleared", async () => {
    getTokenMock.mockResolvedValue(tokenFor(ODISHA_TENANT_ID));
    const res = await proxy(request(B_HOST, "/hudd-dashboard/dashboard"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/hudd-dashboard/login");
    expect(location.searchParams.get("error")).toBe("tenant_mismatch");
    // Session cookies are expired so the replay cannot simply be retried.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("authjs.session-token=");
  });
});

describe("Same-tenant sessions still work", () => {
  it("an Odisha session on Odisha's host is forwarded with the tenant header set", async () => {
    getTokenMock.mockResolvedValue(tokenFor(ODISHA_TENANT_ID));
    const res = await proxy(request(A_HOST, "/hudd-dashboard/api/v1/schemes"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get(`x-middleware-request-${TENANT_HEADER}`)).toBe("odisha");
  });

  it("a tenant B session on tenant B's host is forwarded", async () => {
    getTokenMock.mockResolvedValue(tokenFor(tenantBId));
    const res = await proxy(request(B_HOST, "/hudd-dashboard/api/v1/schemes"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get(`x-middleware-request-${TENANT_HEADER}`)).toBe(B_SLUG);
  });
});

/**
 * Phase 3 — the entitlement gate, driven through the REAL proxy.
 *
 * The pure decision is exhaustively covered in tests/entitlements.test.ts; what
 * these add is that proxy.ts actually calls it, in the right order, and returns
 * the right shape. Tenant B has every module except Notifications.
 */
describe("Entitlement gate (Phase 3) at the real proxy", () => {
  it("a DISABLED module 404s on the API surface, for a fully valid session", async () => {
    getTokenMock.mockResolvedValue(tokenFor(tenantBId));
    const res = await proxy(request(B_HOST, "/hudd-dashboard/api/v1/notifications"));

    // The session is valid and bound to the right tenant — this is not a 401.
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Not Found" });
  });

  it("a DISABLED module 404s by direct URL on the page surface — deny, not hide", async () => {
    getTokenMock.mockResolvedValue(tokenFor(tenantBId));
    const res = await proxy(request(B_HOST, "/hudd-dashboard/admin/notifications"));

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    // Not forwarded: the page never rendered.
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("an ENABLED module is forwarded normally", async () => {
    getTokenMock.mockResolvedValue(tokenFor(tenantBId));
    const res = await proxy(request(B_HOST, "/hudd-dashboard/api/v1/kpis/definitions"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("the SAME path is allowed for a tenant that has the module — the gate is per-tenant", async () => {
    // Odisha is all-on by the Phase 3 backfill.
    getTokenMock.mockResolvedValue(tokenFor(ODISHA_TENANT_ID));
    const res = await proxy(request(A_HOST, "/hudd-dashboard/api/v1/notifications"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("core routes stay reachable for a tenant with NO entitlement rows at all", async () => {
    // A tenant can never be locked out of login/shell/admin by provisioning.
    const bare = await prismaUnscoped.tenant.upsert({
      where: { slug: "sessiontenant-bare" },
      update: { status: "active" },
      create: { slug: "sessiontenant-bare", name: "Bare Authority", status: "active" },
    });
    try {
      getTokenMock.mockResolvedValue(tokenFor(bare.id));
      const ok = await proxy(request("sessiontenant-bare.airawat.test", "/hudd-dashboard/api/v1/rbac/me"));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("x-middleware-next")).toBe("1");

      // ...while every gated module is denied for that same tenant.
      const denied = await proxy(
        request("sessiontenant-bare.airawat.test", "/hudd-dashboard/api/v1/kpis/definitions"),
      );
      expect(denied.status).toBe(404);
    } finally {
      await prismaUnscoped.tenant.deleteMany({ where: { slug: "sessiontenant-bare" } }).catch(() => {});
    }
  });

  it("an unmapped path fails closed even with a valid session", async () => {
    getTokenMock.mockResolvedValue(tokenFor(tenantBId));
    const res = await proxy(request(B_HOST, "/hudd-dashboard/api/v1/not-a-real-endpoint"));
    expect(res.status).toBe(404);
  });
});

describe("Tokens that are not bound to a tenant", () => {
  it("a pre-Phase-2 token with no tenant claim is rejected, not trusted", async () => {
    getTokenMock.mockResolvedValue(tokenFor(undefined));
    const res = await proxy(request(A_HOST, "/hudd-dashboard/api/v1/schemes"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: "session_not_bound_to_tenant" });
  });

  it("a session on a host that resolves to no tenant is rejected", async () => {
    // Two tenants are active, so an unresolvable host must deny rather than
    // fall back to a default tenant (plan §7c transition rule).
    getTokenMock.mockResolvedValue(tokenFor(ODISHA_TENANT_ID));
    const res = await proxy(request("unknown-tenant.airawat.test", "/hudd-dashboard/api/v1/schemes"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: "tenant_not_resolved" });
  });

  it("a client-supplied tenant header cannot forge the tenant", async () => {
    getTokenMock.mockResolvedValue(tokenFor(ODISHA_TENANT_ID));
    const req = new NextRequest(new URL(`https://${B_HOST}/hudd-dashboard/api/v1/schemes`), {
      headers: { host: B_HOST, "x-forwarded-proto": "https", [TENANT_HEADER]: "odisha" },
    });
    const res = await proxy(req);

    // The spoofed header is stripped; the host still resolves to tenant B, so
    // the Odisha session is rejected.
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: "tenant_mismatch" });
  });
});

describe("verifyTenantSession decision table", () => {
  it("classifies every combination", () => {
    expect(verifyTenantSession("t1", "t1")).toBe("ok");
    expect(verifyTenantSession("t1", "t2")).toBe("mismatch");
    expect(verifyTenantSession(undefined, "t1")).toBe("unbound_session");
    expect(verifyTenantSession("t1", null)).toBe("unresolved_tenant");
    expect(verifyTenantSession(undefined, null)).toBe("unresolved_tenant");
  });

  it("only 'ok' proceeds", () => {
    expect(isTenantSessionRejected("ok")).toBe(false);
    for (const v of ["mismatch", "unbound_session", "unresolved_tenant"] as const) {
      expect(isTenantSessionRejected(v)).toBe(true);
    }
  });
});
