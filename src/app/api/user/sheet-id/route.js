import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

function getUserIdFromRequest(request) {
  const authCookie = request.cookies.get('auth-token');
  if (!authCookie || !authCookie.value) return null;
  
  const userId = parseInt(authCookie.value, 10);
  return isNaN(userId) ? null : userId;
}

export async function GET(request) {
  try {
    const userId = getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await sql`
      SELECT google_sheet_id FROM users WHERE id = ${userId}
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      google_sheet_id: result.rows[0].google_sheet_id || null
    });
  } catch (error) {
    console.error('Error fetching sheet ID:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const userId = getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { google_sheet_id } = await request.json();

    if (!google_sheet_id) {
      return NextResponse.json(
        { error: 'google_sheet_id is required' },
        { status: 400 }
      );
    }

    // Update user's google sheet ID
    const result = await sql`
      UPDATE users 
      SET google_sheet_id = ${google_sheet_id}
      WHERE id = ${userId}
      RETURNING id, google_sheet_id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Google Sheet ID updated successfully',
      google_sheet_id: result.rows[0].google_sheet_id
    });
  } catch (error) {
    console.error('Error updating sheet ID:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
