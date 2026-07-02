import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, requirePermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const releases = await prisma.release.findMany({
      include: {
        entries: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ releases });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("API Error [releases GET]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermissionAndDbUser("MANAGE_FINANCIAL_YEARS");

    const body = await request.json().catch(() => ({}));
    const version = body.version?.trim();
    const isCurrent = !!body.isCurrent;

    if (!version) {
      return NextResponse.json({ detail: "version is required" }, { status: 400 });
    }

    // Semver simple format validation
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return NextResponse.json({ detail: "version must follow semantic versioning (e.g. 1.4.0)" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      // Check if version already exists
      const existing = await tx.release.findUnique({
        where: { version },
      });

      if (existing) {
        throw new Error("DuplicateVersion");
      }

      if (isCurrent) {
        await tx.release.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });
      }

      return tx.release.create({
        data: {
          version,
          isCurrent,
        },
        include: {
          entries: true,
        },
      });
    });

    return NextResponse.json({ release: created }, { status: 201 });
  } catch (error: any) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    if (error.message === "DuplicateVersion") {
      return NextResponse.json({ detail: "Release version already exists" }, { status: 409 });
    }
    console.error("API Error [releases POST]:", error);
    return NextResponse.json({ detail: "Internal Server Error" }, { status: 500 });
  }
}
