import { NextResponse } from 'next/server';
import { apiClient } from '../../../lib/api-client';

export async function GET() {
  try {
    const data = await apiClient.get('/health');
    return NextResponse.json({ 
      nextjs: 'ok', 
      fastapi: data 
    });
  } catch (error) {
    return NextResponse.json(
      { 
        nextjs: 'ok', 
        fastapi: 'unreachable',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    );
  }
}