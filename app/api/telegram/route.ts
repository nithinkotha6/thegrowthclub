import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  // TODO: implement Telegram webhook handling and validation
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
