import { NextResponse } from 'next/server';
import { getSnapshot } from '@/lib/server';
import { IndexerError } from '@/lib/indexer-protocol';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await getSnapshot(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return NextResponse.json({ error: error instanceof IndexerError ? error.message : 'Monad Testnet is unavailable. Check the server RPC configuration and try again.' }, { status: 503 }); }
}
