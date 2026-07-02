import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermissionAndDbUser("MANAGE_FINANCIAL_YEARS");
    const { id: releaseId } = await props.params;

    const body = await request.json().catch(() => ({}));
    const version = body.version?.trim();
    const isCurrent = body.isCurrent !== undefined ? !!body.isCurrent : undefined;

    // Verify release exists
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
    });

    if (!release) {
      return NextResponse.json({ detail: "Release not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, any> = {};
      if (version) {
        if (!/^\d+\.\d+\.\d+$/.test(version)) {
          throw new Error("InvalidVersion");
        }
        updateData.version = version;
      }

      if (isCurrent !== undefined) {
        updateData.isCurrent = isCurrent;
        if (isCurrent === true) {
          // Unmark other releases
          await tx.release.updateMany({
            where: { isCurrent: true, NOT: { id: releaseId } },
            data: { isCurrent: false },
          });
        }
      }

      return tx.release.update({
        where: { id: releaseId },
        data: updateData,
      });
    });

    return NextResponse.json({ release: updated });
  } catch (error: any) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error.message === "InvalidVersion") {
      return NextResponse.json({ detail: "version must follow semantic versioning (e.g. 1.4.0)" }, { status: 400 });
    }
    console.error("API Error [releases PATCH]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermissionAndDbUser("MANAGE_FINANCIAL_YEARS");
    const { id: releaseId } = await props.params;

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
    });

    if (!release) {
      return NextResponse.json({ detail: "Release not found" }, { status: 404 });
    }

    await prisma.release.delete({
      where: { id: releaseId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("API Error [releases DELETE]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
