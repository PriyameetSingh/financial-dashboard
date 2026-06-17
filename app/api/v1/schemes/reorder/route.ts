import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type ReorderBody = {
  schemeIds: string[];
};

export async function PUT(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("REORDER_SCHEMES");

    const body = (await request.json()) as ReorderBody;
    const { schemeIds } = body;

    if (!Array.isArray(schemeIds)) {
      return NextResponse.json({ detail: "schemeIds must be an array" }, { status: 400 });
    }

    const auditContext = getAuditRequestContext(request);

    await prisma.$transaction(async (tx) => {
      // Update each scheme's sortOrder based on its index in the array
      for (let i = 0; i < schemeIds.length; i++) {
        await tx.scheme.update({
          where: { id: schemeIds[i] },
          data: { sortOrder: i },
        });
      }
    });

    await logAudit(
      actor?.id,
      "scheme.reorder",
      "scheme",
      null,
      null,
      { schemeIds },
      auditContext,
    );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
