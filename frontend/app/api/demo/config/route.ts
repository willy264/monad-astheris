import { NextResponse } from 'next/server';
import { demoConfig, requestedDemoAgent } from '@/lib/demo-server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  let agentId: string | undefined;
  try { agentId = requestedDemoAgent(request); }
  catch { return NextResponse.json({ enabled: false, error: 'Provide one positive decimal uint256 agentId, without other query parameters.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  try { return NextResponse.json(await demoConfig(agentId), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ enabled: false, error: 'The testnet task service or its payment configuration is unavailable. Check the connection again shortly, or explore the guided preview.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
