import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

const VALID_ENTRY_TYPES = new Set(["NEW_FEATURE", "FIX", "IMPROVEMENT", "BREAKING_CHANGE"]);

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermissionAndDbUser("MANAGE_FINANCIAL_YEARS");
    const { id: releaseId } = await props.params;

    const body = await request.json().catch(() => ({}));
    const type = body.type?.toUpperCase().trim();
    const title = body.title?.trim();
    const description = body.description?.trim() || null;

    if (!type || !title) {
      return NextResponse.json({ detail: "type and title are required" }, { status: 400 });
    }

    if (!VALID_ENTRY_TYPES.has(type)) {
      return NextResponse.json({ detail: `Invalid entry type. Must be one of: ${[...VALID_ENTRY_TYPES].join(", ")}` }, { status: 400 });
    }

    // Verify release exists
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
    });

    if (!release) {
      return NextResponse.json({ detail: "Release not found" }, { status: 404 });
    }

    const created = await prisma.changelogEntry.create({
      data: {
        releaseId,
        type: type as any,
        title,
        description,
      },
    });

    return NextResponse.json({ entry: created }, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("API Error [changelog entry POST]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
