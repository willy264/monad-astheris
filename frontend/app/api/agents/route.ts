import { NextRequest, NextResponse } from 'next/server';
import { getAgentPage } from '@/lib/server';
import { contracts } from '@/lib/contracts';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('page') || '0';
  if (!/^\d{1,6}$/.test(value)) return NextResponse.json({ error: 'Invalid page number.' }, { status: 400 });
  if (!contracts.identity) return NextResponse.json({ error: 'An identity registry has not been connected. Configure your deployment to explore agents.' }, { status: 503 });
  try { return NextResponse.json(await getAgentPage(Number(value)), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'The agent registry could not be reached. Check the RPC and registry address.' }, { status: 503 }); }
}
