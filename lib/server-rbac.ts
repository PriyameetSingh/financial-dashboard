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
 * Resolves effective permission codes with one SQL round-trip (no deep role graph).
 * Matches role grants + allow overrides, minus deny overrides.
 */
export async function getEffectivePermissionCodesFromUserId(userId: string): Promise<Set<string>> {
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
    return new Set(rows.map((r) => r.code));
  } catch (e) {
    const mapped = asDatabaseUnavailableError(e);
    if (mapped) throw mapped;
    throw e;
  }
}

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
    return await getEffectivePermissionCodesFromUserId(row.id);
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
  const effective = getEffectivePermissionCodesFromUser(user);
  if (!effective.has(permissionCode)) {
    throw new AuthError(403, "Forbidden");
  }
  return user;
}

/** Same as requireAnyPermission but returns the loaded DB user for reuse. */
export async function requireAnyPermissionAndDbUser(...permissionCodes: string[]) {
  const user = await getDbUserBySession();
  const effective = getEffectivePermissionCodesFromUser(user);
  if (!permissionCodes.some((code) => effective.has(code))) {
    throw new AuthError(403, "Forbidden");
  }
  return user;
}

export async function hasPermission(permissionCode: string): Promise<boolean> {
  const effective = await getEffectivePermissionCodes();
  return effective.has(permissionCode);
}

export function hasPermissionForUser(user: DbUserWithRbac | null, permissionCode: string): boolean {
  return getEffectivePermissionCodesFromUser(user).has(permissionCode);
}
