import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Get admin key from environment for security
    const adminKey = request.headers.get('x-admin-key');
    const validAdminKey = process.env.ADMIN_KEY || 'admin-secret-key';
    
    if (adminKey !== validAdminKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: 'Username required' },
        { status: 400 }
      );
    }

    // Get the user ID
    const userResult = await sql`
      SELECT id FROM users WHERE username = ${username}
    `;

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: `User "${username}" not found` },
        { status: 404 }
      );
    }

    const userId = userResult.rows[0].id;

    // Assign all accounts without a user_id
    const accountsResult = await sql`
      UPDATE accounts 
      SET user_id = ${userId}
      WHERE user_id IS NULL
      RETURNING id
    `;

    // Assign all saved_routes without a user_id
    const routesResult = await sql`
      UPDATE saved_routes 
      SET user_id = ${userId}
      WHERE user_id IS NULL
      RETURNING id
    `;

    return NextResponse.json({
      success: true,
      message: `Assigned data to ${username}`,
      accountsAssigned: accountsResult.rows.length,
      routesAssigned: routesResult.rows.length,
      userId
    });
  } catch (error) {
    console.error('Error assigning data:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
