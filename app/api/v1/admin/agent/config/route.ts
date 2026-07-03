import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, toAuthErrorResponse } from "@/lib/server-rbac";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission("MANAGE_PERMISSIONS", "MANAGE_FINANCIAL_YEARS");
    
    let config = await prisma.agentConfig.findFirst();
    if (!config) {
      // Return default config in case database wasn't seeded correctly
      config = {
        id: "d3b07384-d113-43cf-a5a5-4828f306d860",
        enabled: true,
        runDay: "Monday",
        mode: "BOTH",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return NextResponse.json(config);
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}

type UpdateBody = {
  enabled: boolean;
  runDay: string;
  mode: string;
};

export async function POST(request: NextRequest) {
  try {
    await requireAnyPermission("MANAGE_PERMISSIONS", "MANAGE_FINANCIAL_YEARS");
    const body = (await request.json()) as UpdateBody;

    let config = await prisma.agentConfig.findFirst();
    if (config) {
      config = await prisma.agentConfig.update({
        where: { id: config.id },
        data: {
          enabled: body.enabled,
          runDay: body.runDay,
          mode: body.mode,
        },
      });
    } else {
      config = await prisma.agentConfig.create({
        data: {
          id: "d3b07384-d113-43cf-a5a5-4828f306d860",
          enabled: body.enabled,
          runDay: body.runDay,
          mode: body.mode,
        },
      });
    }

    return NextResponse.json({ success: true, config });
  } catch (error) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    throw error;
  }
}
