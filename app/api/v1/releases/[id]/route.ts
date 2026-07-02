import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ detail: "Method Not Allowed" }, { status: 405 });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ detail: "Method Not Allowed" }, { status: 405 });
}

