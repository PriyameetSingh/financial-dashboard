import { NextRequest, NextResponse } from "next/server";
import { ActionItemStatus } from "@prisma/client";
import { prisma, tenantStamped } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

type Body = {
  name: string;
  url: string;
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("UPLOAD_PROOF", "UPDATE_ACTION_ITEMS");

    const { id } = await ctx.params;
    const body = (await request.json()) as Body;

    const actionItem = await prisma.actionItem.findUnique({ where: { id } });
    if (!actionItem) {
      return NextResponse.json({ detail: "Action item not found" }, { status: 404 });
    }
    const auditContext = getAuditRequestContext(request);

  await prisma.$transaction(async (tx) => {
    const existingFile = await tx.file.findFirst({
      where: {
        name: body.name,
        url: body.url,
      },
      select: { id: true },
    });

    const file = existingFile
      ? await tx.file.update({
          where: { id: existingFile.id },
          data: { uploadedById: actor?.id ?? null },
        })
      : await tx.file.create({
          data: tenantStamped({
            name: body.name,
            url: body.url,
            uploadedById: actor?.id ?? null,
          }),
        });

    await tx.actionItemProof.upsert({
      where: {
        actionItemId_fileId: {
          actionItemId: actionItem.id,
          fileId: file.id,
        },
      },
      update: {
        uploadedById: actor?.id ?? null,
      },
      create: tenantStamped({
        actionItemId: actionItem.id,
        fileId: file.id,
        uploadedById: actor?.id ?? null,
      }),
    });

    await tx.actionItem.update({
      where: { id: actionItem.id },
      data: { status: ActionItemStatus.PROOF_UPLOADED },
    });

    await logAudit(
      tx,
      actor?.id,
      "action_item.proof.upload",
      "action_item_proof",
      actionItem.id,
      null,
      { fileId: file.id, name: file.name },
      { ...auditContext, actionItemId: actionItem.id, meetingId: actionItem.meetingId, schemeId: actionItem.schemeId },
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
