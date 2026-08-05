import { NextRequest, NextResponse } from 'next/server';
import { apiClient } from '../../../../../../lib/api-client';
import { requirePermission, toAuthErrorResponse } from '@/lib/server-rbac';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('APPROVE_ACTION_ITEMS');

    const { id } = await params;
    const body = await request.json();
    const data = await apiClient.post<any>(`/api/v1/uploads/${id}/approve`, body);
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
