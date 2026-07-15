/**
 * proxy.ts — Next.js 16 Request Proxy/Interception Boundary.
 * Replaces the deprecated middleware.ts file convention.
 *
 * Guards all /dashboard routes. If the `app_session` cookie is absent or
 * cannot be decoded (expired, tampered), the user is redirected to /.
 *
 * Spec: architecture.md §7
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify }                  from 'jose';
import { SESSION_COOKIE, getSecret }   from './lib/session';

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Only guard dashboard routes (including sub-paths)
  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  const token  = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = getSecret();

  // Redirect if cookie is missing or secret is misconfigured
  if (!token || !secret) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Verify JWT — redirect on any verification failure (expired, tampered, etc.)
  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    // Clear the invalid cookie to prevent redirect loops on the client
    const response = NextResponse.redirect(new URL('/', req.url));
    response.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
    return response;
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
