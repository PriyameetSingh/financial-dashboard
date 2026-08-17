/**
 * DEV-ONLY session minting — no Keycloak.
 *
 * Exists so the middleware/priming layer can be exercised over REAL HTTP in
 * local development and in the golden's smoke leg. Two production bugs have now
 * lived in exactly that layer and were invisible to every DB-level test:
 * the app-root proxy bypass (Phase 3 Gate B) and the `TenantScopeError` on
 * primed requests this route was written to diagnose.
 *
 * ── Why this is safe to have in the tree ────────────────────────────────────
 * It is dead code unless BOTH conditions hold:
 *
 *   NODE_ENV !== "production"     AND     DEV_AUTH_ENABLED === "1"
 *
 * Neither alone is enough, and the failure response is 404 (not 403) so the
 * endpoint is not even discoverable in a deployed environment. It mints a token
 * with exactly the claims the real Keycloak `jwt` callback produces — including
 * the Phase 2 `tenantId` binding — so a minted session is subject to every
 * check a real one is: host/tenant binding, session invalidation, RBAC, and the
 * Phase 3 entitlement gate. It cannot be used to escape any of them, and it
 * cannot mint a session for a tenant that does not exist or is not active.
 *
 * Usage:
 *   DEV_AUTH_ENABLED=1 npm run dev
 *   curl -c jar -H 'Host: odisha.airawat.test' \
 *     'http://localhost:3000/api/dev/session?tenant=odisha'
 *   # With NEXT_PUBLIC_BASE_PATH=/hudd-dashboard, prefix the path:
 *   #   http://localhost:3000/hudd-dashboard/api/dev/session?tenant=odisha
 *   # A specific person, when the default is not who you want:
 *   #   ...?tenant=odisha&user=finance.desk@hudd.bootstrap
 *
 * Without `?user=`, the session is minted for a TENANT ADMINISTRATOR — see
 * `findDefaultUser` for why that is the default rather than "whoever was seeded
 * first".
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withTenantContext } from "@/lib/tenant-context";
import { findActiveTenant } from "@/lib/tenant-resolve-db";

export const runtime = "nodejs";

/** The permission that marks a user as able to administer their own tenant. */
const TENANT_ADMIN_PERMISSION = "MANAGE_TENANT_CONFIG";

/** Selected columns — everything the minted token needs, and nothing else. */
const USER_FIELDS = { code: true, email: true, name: true } as const;

/**
 * Total order over users. `createdAt` alone is not one: two users seeded in the
 * same script share a timestamp often enough to matter, and the resolution is
 * milliseconds. `id` is unique, so this picks the same person every time.
 */
const USER_ORDER: Prisma.UserOrderByWithRelationInput[] = [{ createdAt: "asc" }, { id: "asc" }];

/**
 * Users who would actually pass `requirePermission(MANAGE_TENANT_CONFIG)`:
 * granted through a role or an explicit allow override, and not taken away by a
 * deny override. Mirrors how lib/server-rbac.ts resolves a permission, so this
 * cannot drift into offering a session that the RBAC layer then refuses.
 */
const TENANT_ADMIN_WHERE: Prisma.UserWhereInput = {
  OR: [
    {
      userRoles: {
        some: { role: { rolePermissions: { some: { permission: { code: TENANT_ADMIN_PERMISSION } } } } },
      },
    },
    { permissionOverrides: { some: { effect: "allow", permission: { code: TENANT_ADMIN_PERMISSION } } } },
  ],
  NOT: {
    permissionOverrides: { some: { effect: "deny", permission: { code: TENANT_ADMIN_PERMISSION } } },
  },
};

/**
 * Who a session is minted for when the caller does not name anyone.
 *
 * This used to be "the oldest user in the tenant", which is not a choice at all
 * — it is whatever the seed scripts happened to insert first. That held only by
 * accident until the finance-desk user was added to the Odisha seed (35ad9dc):
 * `db:seed` creates it, `db:seed:roles` creates the TASU admin afterwards, so on
 * every FRESHLY seeded database the default session became a finance officer
 * holding no administrative permission, and every tenant-admin surface answered
 * 403. Databases seeded before that commit kept working, which is exactly what
 * made it hard to see.
 *
 * A tenant administrator is the useful default: it can reach the admin surfaces
 * AND everything below them, so one default serves both the smoke leg and a
 * developer poking at the app. Anyone else is still one `?user=` away.
 */
async function findDefaultUser() {
  const admin = await prisma.user.findFirst({
    where: TENANT_ADMIN_WHERE,
    orderBy: USER_ORDER,
    select: USER_FIELDS,
  });
  if (admin) return admin;

  // A tenant with no administrator at all is still worth a session — an
  // onboarding-in-progress workspace, say. Deterministic, just not privileged.
  return prisma.user.findFirst({ orderBy: USER_ORDER, select: USER_FIELDS });
}

function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "1";
}

/** Mirrors proxy.ts `isSecureRequest` so the cookie name (and JWT salt) match. */
function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0].trim() === "https";
  return request.nextUrl.protocol === "https:";
}

export async function GET(request: NextRequest) {
  if (!devAuthEnabled()) {
    return NextResponse.json({ detail: "Not Found" }, { status: 404 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "AUTH_SECRET is not set" }, { status: 500 });
  }

  const slug = request.nextUrl.searchParams.get("tenant");
  if (!slug) {
    return NextResponse.json({ detail: "Pass ?tenant=<slug>" }, { status: 400 });
  }

  const tenant = await findActiveTenant(slug);
  if (!tenant) {
    return NextResponse.json({ detail: `No active tenant with slug "${slug}"` }, { status: 404 });
  }

  // Look up the user through the SCOPED client inside an explicit tenant scope.
  // That keeps this route off the unscoped-client allowlist entirely, and makes
  // the chokepoint itself the proof that the user belongs to the tenant asked
  // for. (Naming the unscoped client even in a comment trips
  // scripts/check-tenant-chokepoint.mjs, which greps source text — deliberately
  // conservative, so the wording here stays indirect.)
  const wanted = request.nextUrl.searchParams.get("user");
  const user = await withTenantContext(tenant.id, () =>
    wanted
      ? prisma.user.findFirst({
          where: {
            OR: [
              { code: { equals: wanted, mode: "insensitive" } },
              { email: { equals: wanted, mode: "insensitive" } },
            ],
          },
          orderBy: USER_ORDER,
          select: USER_FIELDS,
        })
      : findDefaultUser(),
  );
  if (!user) {
    return NextResponse.json(
      { detail: `No user found in tenant "${slug}"${wanted ? ` matching "${wanted}"` : ""}` },
      { status: 404 },
    );
  }

  const secure = isSecureRequest(request);
  // Auth.js derives the JWT salt from the cookie name, so the two must agree or
  // `getToken` in proxy.ts silently returns null.
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";

  const token = await encode({
    token: {
      sub: user.code ?? user.email,
      name: user.name,
      email: user.email,
      preferred_username: user.code ?? undefined,
      // Phase 2: the binding the proxy cross-checks against the host's tenant.
      tenantId: tenant.id,
    },
    secret,
    salt: cookieName,
    maxAge: 60 * 60,
  });

  const response = NextResponse.json({
    minted: true,
    tenant: { id: tenant.id, slug: tenant.slug },
    user: { code: user.code, email: user.email },
    cookie: cookieName,
  });
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60,
  });
  return response;
}
