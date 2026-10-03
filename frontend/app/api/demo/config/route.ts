import { NextResponse } from 'next/server';
import { demoConfig } from '@/lib/demo-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await demoConfig(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ enabled: false, error: 'Live demo setup is incomplete or its task service is unavailable. The operator must connect the deployed agent, executor and testnet payment service. You can explore the preview now.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
