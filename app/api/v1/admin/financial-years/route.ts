import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditRequestContext, logAudit } from "@/lib/audit";
import { revalidateFinancialCaches } from "@/lib/cached-financial-metadata";
import { ensureFyBudgetAllocationWithLines } from "@/lib/server/ensure-fy-budget-allocation";
import { requireAnyPermissionAndDbUser, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

const PERM = "MANAGE_FINANCIAL_YEARS" as const;

function parseYmd(ymd: string): Date | null {
  const t = ymd?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type PostBody = { label?: string; startDate?: string; endDate?: string };

export async function GET() {
  try {
    await requireAnyPermissionAndDbUser(PERM);

    const rows = await prisma.financialYear.findMany({
      orderBy: { endDate: "desc" },
      select: { id: true, label: true, startDate: true, endDate: true, createdAt: true, updatedAt: true },
    });
    const maxEnd = rows.reduce((m, r) => (r.endDate > m ? r.endDate : m), rows[0]?.endDate ?? new Date(0));

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        label: r.label,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        isDefaultForApis: r.endDate.getTime() === maxEnd.getTime(),
      })),
    });
  } catch (e) {
    const auth = toAuthErrorResponse(e);
    if (auth) return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAnyPermissionAndDbUser(PERM);
    const body = (await request.json()) as PostBody;
    const label = body.label?.trim() ?? "";
    const start = body.startDate ? parseYmd(body.startDate) : null;
    const end = body.endDate ? parseYmd(body.endDate) : null;

    if (!label) {
      return NextResponse.json({ detail: "label is required" }, { status: 400 });
    }
    if (!start || !end) {
      return NextResponse.json({ detail: "startDate and endDate are required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (start >= end) {
      return NextResponse.json({ detail: "startDate must be before endDate" }, { status: 400 });
    }

    const auditContext = getAuditRequestContext(request);

    const created = await prisma.financialYear.create({
      data: {
        label,
        startDate: start,
        endDate: end,
      },
      select: { id: true, label: true, startDate: true, endDate: true },
    });

    await ensureFyBudgetAllocationWithLines(created.id, actor?.id ?? null);

    await logAudit(actor?.id ?? null, "CREATE", "FinancialYear", created.id, null, {
      label: created.label,
      startDate: created.startDate.toISOString().slice(0, 10),
      endDate: created.endDate.toISOString().slice(0, 10),
    }, auditContext);

    revalidateFinancialCaches();

    return NextResponse.json({
      id: created.id,
      label: created.label,
      startDate: created.startDate.toISOString().slice(0, 10),
      endDate: created.endDate.toISOString().slice(0, 10),
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
