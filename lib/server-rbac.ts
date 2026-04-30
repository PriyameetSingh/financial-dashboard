import { cache } from "react";
import { Prisma } from "@prisma/client";
import { asDatabaseUnavailableError, toDatabaseErrorResponse } from "@/lib/db-errors";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/server-auth";

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function toAuthErrorResponse(error: unknown): { status: number; detail: string } | null {
  if (error instanceof AuthError) {
    return { status: error.status, detail: error.message };
  }
  return toDatabaseErrorResponse(error);
}

async function findDbUserByIdentity(sessionUser: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  const byCode = await prisma.user.findFirst({
    where: { code: { equals: sessionUser.id, mode: "insensitive" } },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
      permissionOverrides: { include: { permission: true } },
    },
  });
  if (byCode) return byCode;
  if (!sessionUser.email) return null;
  return prisma.user.findFirst({
    where: { email: { equals: sessionUser.email, mode: "insensitive" } },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
      permissionOverrides: { include: { permission: true } },
    },
  });
}

async function loadDbUserBySession() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  try {
    return await findDbUserByIdentity(sessionUser);
  } catch (e) {
    const mapped = asDatabaseUnavailableError(e);
    if (mapped) throw mapped;
    throw e;
  }
}

/** One Prisma load per request (deduped via React cache in RSC and route handlers). */
export const getDbUserBySession = cache(loadDbUserBySession);

export type DbUserWithRbac = NonNullable<Awaited<ReturnType<typeof loadDbUserBySession>>>;

/**
 * Resolves effective permission codes (user_roles + role_permissions, union allow overrides, minus deny overrides).
 * When that set is empty and `sessionRoleFallback` is set (e.g. IdP role before admin assigns `user_roles`), grants
 * permissions from that role row in the database so `/rbac/me` and API guards stay consistent.
 */
export async function getEffectivePermissionCodesFromUserId(
  userId: string,
  sessionRoleFallback?: string | null,
): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ code: string }>>(
      Prisma.sql`
        (
          SELECT p."code"
          FROM "user_roles" ur
          INNER JOIN "role_permissions" rp ON rp."roleId" = ur."roleId"
          INNER JOIN "permissions" p ON p."id" = rp."permissionId"
          WHERE ur."userId" = ${userId}::uuid
          UNION
          SELECT p."code"
          FROM "user_permission_overrides" o
          INNER JOIN "permissions" p ON p."id" = o."permissionId"
          WHERE o."userId" = ${userId}::uuid AND o."effect" = 'allow'::"PermissionEffect"
        )
        EXCEPT
        (
          SELECT p."code"
          FROM "user_permission_overrides" o
          INNER JOIN "permissions" p ON p."id" = o."permissionId"
          WHERE o."userId" = ${userId}::uuid AND o."effect" = 'deny'::"PermissionEffect"
        )
      `,
    );
    const codes = new Set(rows.map((r) => r.code));

    if (codes.size === 0 && sessionRoleFallback) {
      const role = await prisma.role.findUnique({
        where: { code: sessionRoleFallback },
        include: {
          rolePermissions: { include: { permission: { select: { code: true } } } },
        },
      });
      if (role) {
        for (const rp of role.rolePermissions) {
          codes.add(rp.permission.code);
        }
      }
    }

    const denyRows = await prisma.userPermissionOverride.findMany({
      where: { userId, effect: "deny" },
      select: { permission: { select: { code: true } } },
    });
    for (const d of denyRows) {
      codes.delete(d.permission.code);
    }

    return codes;
  } catch (e) {
    const mapped = asDatabaseUnavailableError(e);
    if (mapped) throw mapped;
    throw e;
  }
}

/** In-memory role graph only; does not apply session fallback — prefer {@link hasPermissionForUserAsync}. */
export function getEffectivePermissionCodesFromUser(user: DbUserWithRbac | null): Set<string> {
  if (!user) return new Set();

  const fromRoles = user.userRoles.flatMap((ur) =>
    ur.role.rolePermissions.map((rp) => rp.permission.code as string),
  );
  const allow = user.permissionOverrides.filter((o) => o.effect === "allow").map((o) => o.permission.code as string);
  const deny = new Set(user.permissionOverrides.filter((o) => o.effect === "deny").map((o) => o.permission.code as string));

  const effective = new Set<string>();
  for (const code of fromRoles) effective.add(code);
  for (const code of allow) effective.add(code);
  for (const code of effective) {
    if (deny.has(code)) effective.delete(code);
  }
  return effective;
}

async function loadEffectivePermissionCodes(): Promise<Set<string>> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return new Set();
  try {
    const rowByCode = await prisma.user.findFirst({
      where: { code: { equals: sessionUser.id, mode: "insensitive" } },
      select: { id: true },
    });
    const row =
      rowByCode ??
      (sessionUser.email
        ? await prisma.user.findFirst({
            where: { email: { equals: sessionUser.email, mode: "insensitive" } },
            select: { id: true },
          })
        : null);
    if (!row) return new Set();
    return await getEffectivePermissionCodesFromUserId(row.id, sessionUser.role);
  } catch (e) {
    const mapped = asDatabaseUnavailableError(e);
    if (mapped) throw mapped;
    throw e;
  }
}

/** Cached per request: lightweight permission resolution (no deep RBAC graph). */
export const getEffectivePermissionCodes = cache(loadEffectivePermissionCodes);

export async function requirePermission(permissionCode: string) {
  const effective = await getEffectivePermissionCodes();
  if (!effective.has(permissionCode)) {
    throw new AuthError(403, "Forbidden");
  }
}

export async function requireAnyPermission(...permissionCodes: string[]) {
  const effective = await getEffectivePermissionCodes();
  if (!permissionCodes.some((code) => effective.has(code))) {
    throw new AuthError(403, "Forbidden");
  }
}

/** Same as requirePermission but returns the loaded DB user for reuse (full graph once for actor fields). */
export async function requirePermissionAndDbUser(permissionCode: string) {
  const user = await getDbUserBySession();
  if (!user) {
    throw new AuthError(401, "Unauthorized");
  }
  const sessionUser = await getSessionUser();
  const fallback =
    user.userRoles.length === 0 && sessionUser?.role ? sessionUser.role : null;
  const effective = await getEffectivePermissionCodesFromUserId(user.id, fallback);
  if (!effective.has(permissionCode)) {
    throw new AuthError(403, "Forbidden");
  }
  return user;
}

/** Same as requireAnyPermission but returns the loaded DB user for reuse. */
export async function requireAnyPermissionAndDbUser(...permissionCodes: string[]) {
  const user = await getDbUserBySession();
  if (!user) {
    throw new AuthError(401, "Unauthorized");
  }
  const sessionUser = await getSessionUser();
  const fallback =
    user.userRoles.length === 0 && sessionUser?.role ? sessionUser.role : null;
  const effective = await getEffectivePermissionCodesFromUserId(user.id, fallback);
  if (!permissionCodes.some((code) => effective.has(code))) {
    throw new AuthError(403, "Forbidden");
  }
  return user;
}

export async function hasPermission(permissionCode: string): Promise<boolean> {
  const effective = await getEffectivePermissionCodes();
  return effective.has(permissionCode);
}

export async function hasPermissionForUserAsync(
  user: DbUserWithRbac | null,
  permissionCode: string,
): Promise<boolean> {
  if (!user) return false;
  const sessionUser = await getSessionUser();
  const fallback =
    user.userRoles.length === 0 && sessionUser?.role ? sessionUser.role : null;
  const effective = await getEffectivePermissionCodesFromUserId(user.id, fallback);
  return effective.has(permissionCode);
}

/** @deprecated Use {@link hasPermissionForUserAsync} — sync path ignores session fallback when `user_roles` is empty. */
export function hasPermissionForUser(user: DbUserWithRbac | null, permissionCode: string): boolean {
  return getEffectivePermissionCodesFromUser(user).has(permissionCode);
}
