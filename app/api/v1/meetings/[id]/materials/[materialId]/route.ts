import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { deleteFile } from "@/lib/local-file-storage";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; materialId: string }> },
) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS", "MANAGE_SCHEMES");

    const { id: meetingId, materialId } = await ctx.params;

    const row = await prisma.meetingMaterial.findFirst({
      where: { id: materialId, meetingId },
    });
    if (!row) {
      return NextResponse.json({ detail: "Material not found" }, { status: 404 });
    }

    // Delete the file from local storage
    await deleteFile(row.storagePath);

    const auditContext = getAuditRequestContext(_request);

    await prisma.$transaction(async (tx) => {
      await tx.meetingMaterial.delete({ where: { id: materialId } });

      await logAudit(
        tx,
        actor?.id,
        "meeting.material.delete",
        "meeting_material",
        materialId,
        { id: materialId, storagePath: row.storagePath },
        null,
        { ...auditContext, meetingId },
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
