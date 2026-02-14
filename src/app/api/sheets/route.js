import { google } from 'googleapis';
import { sql } from '@vercel/postgres';

function getUserIdFromRequest(request) {
  const authCookie = request.cookies.get('auth-token');
  if (!authCookie || !authCookie.value) return null;
  
  const userId = parseInt(authCookie.value, 10);
  return isNaN(userId) ? null : userId;
}

export async function GET(request) {
  try {
    // Get user ID from auth cookie
    const userId = getUserIdFromRequest(request);
    
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's google sheet ID from database
    const userResult = await sql`
      SELECT google_sheet_id FROM users WHERE id = ${userId}
    `;

    if (userResult.rows.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    let spreadsheetId = userResult.rows[0].google_sheet_id;

    // If user doesn't have a sheet ID set, return error
    if (!spreadsheetId) {
      return Response.json({
        error: 'No Google Sheet connected',
        message: 'Please set up your Google Sheet ID in settings to view metrics.',
        rawRows: [],
        data: [],
        count: 0
      }, { status: 200 });
    }

    // Use a server-only env var for API key in production
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY;

    if (!apiKey) {
      console.error('Google Sheets API key not configured (GOOGLE_SHEETS_API_KEY)');
      return Response.json({ error: 'Google Sheets API key not configured' }, { status: 500 });
    }

    const sheets = google.sheets({ version: 'v4', auth: apiKey });
    
    // Get data from the "App Export" sheet (return both raw rows and a header-mapped form)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'App Export!A1:Z1000',
    });

    const rows = response.data.values || [];

    // Provide both raw rows and a header->value mapping (if headers exist)
    let mapped = [];
    if (rows.length) {
      const headers = rows[0];
      mapped = rows.slice(1).map((row) => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });
    }

    return Response.json({ rawRows: rows, data: mapped, count: mapped.length });
  } catch (error) {
    console.error('Google Sheets API Error:', error?.message || error);

    // Distinguish common errors
    if (error && error.code === 403) {
      return Response.json({ error: 'Access to the spreadsheet is forbidden (403). Check sheet permissions and API key.' }, { status: 403 });
    }

    return Response.json({
      error: error.message || 'Failed to fetch sheet data',
      details: (error && error.toString && error.toString()) || null,
    }, { status: 500 });
  }
}
