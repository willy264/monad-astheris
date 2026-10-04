import { NextResponse } from 'next/server';
import { submitDemo } from '@/lib/demo-server';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function POST(request: Request) {
  try { const result = await submitDemo(request); return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Task submission is unconfirmed. Recover the saved request status before submitting again.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
