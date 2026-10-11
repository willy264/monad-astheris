import { NextResponse } from 'next/server';
import { accessConfig } from '@/lib/access-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await accessConfig(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Access requests are not available yet. The task service must be updated and configured for this dashboard.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
