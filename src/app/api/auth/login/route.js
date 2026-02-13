import { NextResponse } from 'next/server';

// Set your password here or use an environment variable
const CORRECT_PASSWORD = process.env.APP_PASSWORD || 'changeme123';

export async function POST(request) {
  try {
    const { password } = await request.json();
    
    if (password === CORRECT_PASSWORD) {
      const response = NextResponse.json({ success: true });
      
      // Set auth cookie (expires in 7 days)
      response.cookies.set('auth-token', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
      
      return response;
    }
    
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
