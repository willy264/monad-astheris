import { NextResponse } from 'next/server';
import { accessAction, AccessServiceError } from '@/lib/access-server';
import { userErrorMessage } from '@/lib/user-error';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { return NextResponse.json(await accessAction(request), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (cause) { return NextResponse.json({ error: userErrorMessage(cause, 'The access inbox is temporarily unavailable. Try again shortly.') }, { status: cause instanceof AccessServiceError ? cause.status : 400, headers: { 'Cache-Control': 'private, no-store' } }); }
}
