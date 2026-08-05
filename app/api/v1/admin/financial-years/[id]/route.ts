import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

const PERM = "MANAGE_FINANCIAL_YEARS" as const;

function parseYmd(ymd: string): Date | null {
  const t = ymd?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type PatchBody = { label?: string; startDate?: string; endDate?: string };

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermissionAndDbUser(PERM);
    const { id } = await ctx.params;
    const body = (await request.json()) as PatchBody;

    const existing = await prisma.financialYear.findUnique({
      where: { id },
      select: { id: true, label: true, startDate: true, endDate: true },
    });
    if (!existing) {
      return NextResponse.json({ detail: "Financial year not found" }, { status: 404 });
    }

    const nextLabel = body.label !== undefined ? body.label.trim() : existing.label;

    let start = existing.startDate;
    let end = existing.endDate;
    if (body.startDate !== undefined) {
      const p = parseYmd(body.startDate);
      if (!p) return NextResponse.json({ detail: "Invalid startDate (use YYYY-MM-DD)" }, { status: 400 });
      start = p;
    }
    if (body.endDate !== undefined) {
      const p = parseYmd(body.endDate);
      if (!p) return NextResponse.json({ detail: "Invalid endDate (use YYYY-MM-DD)" }, { status: 400 });
      end = p;
    }
    if (!nextLabel) {
      return NextResponse.json({ detail: "label cannot be empty" }, { status: 400 });
    }
    if (start >= end) {
      return NextResponse.json({ detail: "startDate must be before endDate" }, { status: 400 });
    }

    const before = {
      label: existing.label,
      startDate: existing.startDate.toISOString().slice(0, 10),
      endDate: existing.endDate.toISOString().slice(0, 10),
    };

    const auditContext = getAuditRequestContext(request);

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.financialYear.update({
        where: { id },
        data: {
          label: nextLabel,
          startDate: start,
          endDate: end,
        },
        select: { id: true, label: true, startDate: true, endDate: true },
      });

      await logAudit(tx, actor?.id ?? null, "UPDATE", "FinancialYear", updated.id, before, {
        label: updated.label,
        startDate: updated.startDate.toISOString().slice(0, 10),
        endDate: updated.endDate.toISOString().slice(0, 10),
      }, auditContext);

      return updated;
    });

    revalidateFinancialCaches();

    return NextResponse.json({
      id: updated.id,
      label: updated.label,
      startDate: updated.startDate.toISOString().slice(0, 10),
      endDate: updated.endDate.toISOString().slice(0, 10),
    });
  } catch (e: unknown) {
    const auth = toAuthErrorResponse(e);
    if (auth) return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ detail: "A financial year with this label already exists" }, { status: 409 });
    }
    throw e;
  }
}
