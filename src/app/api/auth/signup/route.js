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

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE username = ${username}
    `;

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const result = await sql`
      INSERT INTO users (username, password_hash)
      VALUES (${username}, ${hashedPassword})
      RETURNING id
    `;

    const userId = result.rows[0].id;
    const response = NextResponse.json({ 
      success: true,
      userId 
    });

    // Set auth cookie
    response.cookies.set('auth-token', `${userId}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Signup failed' },
      { status: 500 }
    );
  }
}
