import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma, requireTenantScope } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { requireAnyPermission, requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";
import { assertAllowedMeetingMaterial, sanitizeMeetingFileName, MEETING_MATERIAL_MAX_BYTES } from "@/lib/meeting-materials";
import { saveFile } from "@/lib/local-file-storage";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission("VIEW_ALL_DATA", "VIEW_ASSIGNED_DATA");

    const { id: meetingId } = await ctx.params;
    const meeting = await prisma.dashboardMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!meeting) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    const materials = await prisma.meetingMaterial.findMany({
      where: { meetingId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    });

    return NextResponse.json({ materials });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser("CREATE_ACTION_ITEMS", "MANAGE_SCHEMES");

    const { id: meetingId } = await ctx.params;
    const meeting = await prisma.dashboardMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!meeting) {
      return NextResponse.json({ detail: "Meeting not found" }, { status: 404 });
    }

    // Check content length before processing to prevent large file issues
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MEETING_MATERIAL_MAX_BYTES * 2) {
      return NextResponse.json({ 
        detail: `Request too large. Maximum file size is ${MEETING_MATERIAL_MAX_BYTES / (1024 * 1024)} MB.` 
      }, { status: 413 });
    }

    // Additional check for nginx 413 errors - if content-length is missing but request seems large
    if (!contentLength) {
      console.warn('Warning: No content-length header received - possible nginx 413 issue');
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ detail: "Expected multipart field \"file\" with a non-empty file." }, { status: 400 });
    }

    console.log('Server received file:', {
      name: file.name,
      size: file.size,
      sizeMB: file.size / (1024 * 1024),
      type: file.type,
      maxSize: MEETING_MATERIAL_MAX_BYTES,
      maxSizeMB: MEETING_MATERIAL_MAX_BYTES / (1024 * 1024)
    });

    try {
      assertAllowedMeetingMaterial(file);
      console.log('File validation passed');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid file";
      console.error('File validation failed:', msg);
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    const safeName = sanitizeMeetingFileName(file.name);
    // Phase 2: physical storage is namespaced by tenant, so two tenants can
    // never share a path on disk and a stray path cannot address another
    // tenant's file. Reads need no change — they resolve whatever relative
    // storagePath the row holds, so pre-Phase-2 Odisha files keep working at
    // their legacy (un-prefixed) paths.
    const objectKey = `${requireTenantScope("meeting-material-upload")}/${meetingId}/${randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      console.log('Attempting to save file:', objectKey);
      await saveFile(buffer, objectKey);
      console.log('File saved successfully');
    } catch (uploadError) {
      const msg = uploadError instanceof Error ? uploadError.message : "Upload failed";
      console.error('File save failed:', uploadError);
      return NextResponse.json({ detail: msg }, { status: 502 });
    }

    const auditContext = getAuditRequestContext(request);

    const sortOrder = await prisma.meetingMaterial.count({ where: { meetingId } });

    const created = await prisma.$transaction(async (tx) => {
      const material = await tx.meetingMaterial.create({
        data: {
          meetingId,
          storagePath: objectKey,
          fileName: safeName,
          mimeType: file.type || null,
          sizeBytes: file.size,
          sortOrder,
          uploadedById: actor?.id ?? null,
        },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      });

      await logAudit(
        tx,
        actor?.id,
        "meeting.material.upload",
        "meeting_material",
        material.id,
        null,
        { id: material.id, fileName: material.fileName },
        { ...auditContext, meetingId },
      );

      return material;
    });

    return NextResponse.json({ material: created }, { status: 201 });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
