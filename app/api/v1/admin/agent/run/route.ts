import { NextRequest, NextResponse } from "next/server";
import { runAgentWorkflow } from "@/lib/agent-runner";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAnyPermission("MANAGE_PERMISSIONS", "MANAGE_FINANCIAL_YEARS");
    
    let body = { mode: undefined };
    try {
      body = await request.json();
    } catch {
      // Body may be empty
    }

    const result = await runAgentWorkflow(body.mode);
    return NextResponse.json(result);
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

// Add GET endpoint to retrieve run logs/history for the Admin interface
export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission("MANAGE_PERMISSIONS", "MANAGE_FINANCIAL_YEARS");

    const history = await prisma.agentInsight.findMany({
      orderBy: { runDate: "desc" },
      take: 20,
    });

    return NextResponse.json(history);
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
