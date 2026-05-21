import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, validateToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value ?? '';
  const valid = await validateToken(token);

  if (!valid) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
