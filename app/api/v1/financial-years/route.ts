import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDbUserBySession, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function GET() {
  try {
    const dbUser = await getDbUserBySession();
    if (!dbUser) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    console.log("API: Fetching financial years from database");
    const rows = await prisma.financialYear.findMany({
      orderBy: { endDate: "desc" },
      select: { id: true, label: true, startDate: true, endDate: true },
    });
    
    console.log("API: Found financial years in database:", rows.length, "rows");
    console.log("API: Financial years data:", rows);

    const response = {
      items: rows.map((r) => ({
        id: r.id,
        label: r.label,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
      })),
    };
    
    console.log("API: Sending response:", response);
    return NextResponse.json(response);
  } catch (e) {
    const auth = toAuthErrorResponse(e);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    console.error("API: Failed to fetch financial years:", e);
    return NextResponse.json({ detail: "Failed to fetch financial years" }, { status: 500 });
  }
}
