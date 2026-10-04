import { NextResponse } from 'next/server';
import { getSnapshot } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await getSnapshot(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Monad Testnet is unavailable. Check the server RPC configuration and try again.' }, { status: 503 }); }
}
