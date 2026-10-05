import { NextResponse } from 'next/server';
import { daemonRequest } from '@/lib/demo-server';
import { boundedJson, hash, parseJob } from '@/lib/demo-protocol';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) return NextResponse.json({ error: 'Invalid request ID.' }, { status: 400 });
  try {
    const response = await daemonRequest(`/v1/tasks/${hash(requestId)}`);
    if (response.status === 404) return NextResponse.json({ error: 'The request has not been found. It may still need operator reconciliation.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(parseJob(await boundedJson(response)), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Task status is temporarily unavailable. No payment was retried.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
