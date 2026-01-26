import { google } from 'googleapis';

export async function GET(req) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY;
    
    if (!apiKey) {
      return Response.json({ error: 'Google Sheets API key not configured' }, { status: 500 });
    }
    
    const sheets = google.sheets({ version: 'v4', auth: apiKey });
    
    // Your spreadsheet ID (from the URL)
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID || '1hRLoxq2i_k-0JmbvU-l8wvc-rRtm3n2mLD_xX-pLPiQ';
    
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
    console.error('Google Sheets API Error:', error);
    return Response.json({ 
      error: error.message || 'Failed to fetch sheet data',
      details: error.toString()
    }, { status: 500 });
  }
}
