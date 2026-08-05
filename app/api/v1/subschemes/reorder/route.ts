import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type ReorderBody = {
  subschemeIds: string[];
};

export async function PUT(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("REORDER_SCHEMES");

    const body = (await request.json()) as ReorderBody;
    const { subschemeIds } = body;

    if (!Array.isArray(subschemeIds)) {
      return NextResponse.json({ detail: "subschemeIds must be an array" }, { status: 400 });
    }

    const auditContext = getAuditRequestContext(request);

    await prisma.$transaction(async (tx) => {
      // Update each subscheme's sortOrder based on its index in the array
      for (let i = 0; i < subschemeIds.length; i++) {
        await tx.subscheme.update({
          where: { id: subschemeIds[i] },
          data: { sortOrder: i },
        });
      }

      await logAudit(
        tx,
        actor?.id,
        "subscheme.reorder",
        "subscheme",
        null,
        null,
        { subschemeIds },
        auditContext,
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
