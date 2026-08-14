import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { tenantStamped, type TenantTransactionClient } from "@/lib/prisma";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Write an audit-log row on the SAME Prisma transaction client as the primary
 * mutation. Callers MUST pass the `tx` they received from `prisma.$transaction`
 * — there is intentionally NO default that falls back to the global client.
 * A default would let the unsafe "audit-after-commit" call form keep compiling,
 * which is exactly the bug this signature exists to prevent.
 *
 * STD-AUDIT-001: the mutation and its audit row commit together or not at all.
 *
 * `before` / `after` / `metadata` are intentionally typed `any` (not a strict
 * JsonValue) so callers may pass plain objects that contain `undefined` fields
 * without a per-call-site refactor. The values are cast to Prisma JSON inputs
 * internally. Do NOT rely on this to send `undefined` as a meaningful value — it
 * is serialized away.
 */
export async function logAudit(
  tx: TenantTransactionClient,
  actorUserId: string | null | undefined,
  actionType: string,
  entityType: string,
  entityId: string | null | undefined,
  before: any,
  after: any,
  metadata?: any,
) {
  await tx.auditLog.create({
    data: tenantStamped({
      actorUserId: actorUserId ?? null,
      actionType,
      entityType,
      entityId: entityId ?? null,
      before: before === null || before === undefined ? Prisma.JsonNull : (before as Prisma.InputJsonValue),
      after: after === null || after === undefined ? Prisma.JsonNull : (after as Prisma.InputJsonValue),
      metadata: metadata === null || metadata === undefined ? undefined : (metadata as Prisma.InputJsonValue),
    }),
  });
}

export function getAuditRequestContext(request: NextRequest): { ip: string | null; userAgent: string | null } {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  return { ip, userAgent };
}
