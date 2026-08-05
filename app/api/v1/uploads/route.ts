import { NextRequest, NextResponse } from 'next/server';
import { apiClient } from '../../../../lib/api-client';
import { requireAnyPermission, requirePermission, toAuthErrorResponse } from '@/lib/server-rbac';

export async function POST(request: NextRequest) {
  try {
    await requirePermission('UPLOAD_PROOF');

    const formData = await request.formData();
    const data = await apiClient.post<any>('/api/v1/uploads/', formData);
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

export async function GET() {
  try {
    await requireAnyPermission('VIEW_ALL_DATA', 'VIEW_ASSIGNED_DATA');

    const data = await apiClient.get<any[]>('/api/v1/uploads/');
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
