import bcrypt from 'bcryptjs';
import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password required' },
        { status: 400 }
      );
    }

    // Find user by username
    const user = await sql`
      SELECT id, password_hash FROM users WHERE username = ${username}
    `;

    if (user.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(
      password,
      user.rows[0].password_hash
    );

    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ 
      success: true,
      userId: user.rows[0].id 
    });

    // Set auth cookie with user ID
    response.cookies.set('auth-token', `${user.rows[0].id}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
