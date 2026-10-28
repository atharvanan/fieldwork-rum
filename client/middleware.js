import { NextResponse } from 'next/server';

// only a redirect convenience, the api checks the real token
export function middleware(req) {
  const hasSession = req.cookies.has('rum_session');
  const { pathname } = req.nextUrl;
  if (!hasSession && pathname.startsWith('/dashboard')) return NextResponse.redirect(new URL('/login', req.url));
  if (hasSession && (pathname === '/login' || pathname === '/register')) return NextResponse.redirect(new URL('/dashboard', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/login', '/register'] };
