import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

const VALID_ENTRY_TYPES = new Set(["NEW_FEATURE", "FIX", "IMPROVEMENT", "BREAKING_CHANGE"]);

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    await requirePermissionAndDbUser("MANAGE_FINANCIAL_YEARS");
    const { entryId } = await props.params;

    const body = await request.json().catch(() => ({}));
    const type = body.type?.toUpperCase().trim();
    const title = body.title?.trim();
    const description = body.description === null ? null : body.description?.trim();

    // Verify entry exists
    const entry = await prisma.changelogEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return NextResponse.json({ detail: "Entry not found" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};
    if (type) {
      if (!VALID_ENTRY_TYPES.has(type)) {
        return NextResponse.json({ detail: `Invalid entry type. Must be one of: ${[...VALID_ENTRY_TYPES].join(", ")}` }, { status: 400 });
      }
      updateData.type = type;
    }
    if (title) {
      updateData.title = title;
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    const updated = await prisma.changelogEntry.update({
      where: { id: entryId },
      data: updateData,
    });

    return NextResponse.json({ entry: updated });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("API Error [changelog entry PATCH]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    await requirePermissionAndDbUser("MANAGE_FINANCIAL_YEARS");
    const { entryId } = await props.params;

    const entry = await prisma.changelogEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return NextResponse.json({ detail: "Entry not found" }, { status: 404 });
    }

    await prisma.changelogEntry.delete({
      where: { id: entryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("API Error [changelog entry DELETE]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
