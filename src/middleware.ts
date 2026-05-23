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
  // Exclude large-body upload routes from Edge middleware to avoid the
  // ~10 MB body buffer limit imposed by the Edge Runtime.  Auth for those
  // routes is enforced directly in the route handler instead.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/server/worlds).*)'],
};
