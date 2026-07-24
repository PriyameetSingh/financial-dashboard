import { NextResponse } from 'next/server';
import { apiClient } from '../../../lib/api-client';

export async function GET() {
  try {
    // SIMULATED PROD BUG for rollback demo — no test covers this endpoint,
    // so it slips past the Test (gate) stage untouched. Reverted right after.
    const data = await Promise.reject(new Error('simulated prod bug'));
    return NextResponse.json({ 
      nextjs: 'ok', 
      fastapi: data 
    });
  } catch (error) {
    return NextResponse.json(
      { 
        nextjs: 'broken',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}