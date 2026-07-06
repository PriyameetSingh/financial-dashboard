import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Mock API is working correctly",
    data: {
      project: "HUDD Dashboard",
      version: "1.0.0",
      environment: "development",
      stats: {
        totalSchemes: 42,
        activeMeetings: 7,
        pendingActions: 13,
        budgetUtilisation: "38.4%",
      },
      timestamp: new Date().toISOString(),
    },
  });
}
