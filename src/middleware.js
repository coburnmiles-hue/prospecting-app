import { NextResponse } from 'next/server';

export function middleware(request) {
  // Check if user is authenticated
  const authCookie = request.cookies.get('auth-token');
  const isLoginPage = request.nextUrl.pathname === '/login';
  
  // If not authenticated and not on login page, redirect to login
  if (!authCookie && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // If authenticated and on login page, redirect to home
  if (authCookie && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication API routes)
     * - api/admin (admin API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|api/admin|_next/static|_next/image|favicon.ico).*)',
  ],
};
