import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ detail: "Method Not Allowed" }, { status: 405 });
}

