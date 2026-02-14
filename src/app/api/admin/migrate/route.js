import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Get admin key from environment
    const adminKey = request.headers.get('x-admin-key');
    const validAdminKey = process.env.ADMIN_KEY || 'admin-secret-key';
    
    if (adminKey !== validAdminKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Adding google_sheet_id column to users table...');

    // Add the column if it doesn't exist
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS google_sheet_id VARCHAR(500)
    `;

    return NextResponse.json({
      success: true,
      message: 'google_sheet_id column added successfully'
    });
  } catch (error) {
    console.error('Error:', error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
