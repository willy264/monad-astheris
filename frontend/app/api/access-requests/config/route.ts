import { NextResponse } from 'next/server';
import { accessConfig } from '@/lib/access-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await accessConfig(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Access requests are temporarily unavailable. Please try again later.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
