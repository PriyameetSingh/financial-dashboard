import { NextRequest, NextResponse } from 'next/server';
import { apiClient } from '../../../../../lib/api-client';
import { requireAnyPermission, toAuthErrorResponse } from '@/lib/server-rbac';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAnyPermission('VIEW_ALL_DATA', 'VIEW_ASSIGNED_DATA');

    const { id } = await params;
    const data = await apiClient.get<any>(`/api/v1/uploads/${id}`);
    return NextResponse.json(data);
  } catch (error: any) {
    const auth = toAuthErrorResponse(error);
    if (auth) {
      return NextResponse.json({ detail: auth.detail }, { status: auth.status });
    }
    return NextResponse.json(
      { detail: error.message || 'Unknown error' },
      { status: error.status || 500 }
    );
  }
}
