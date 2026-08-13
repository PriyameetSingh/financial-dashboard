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
});

afterAll(async () => {
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
