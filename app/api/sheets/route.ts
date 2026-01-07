import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSheets, validateSheetsAccess } from '@/lib/googleSheets';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, spreadsheetId: bodySpreadsheetId } = body;

    // Prefer server env; allow optional override from body if explicitly provided
    const spreadsheetId =
      process.env.GOOGLE_SPREADSHEET_ID?.trim() || bodySpreadsheetId?.trim();

    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error:
            'GOOGLE_SPREADSHEET_ID is not configured. Add it to your environment variables or provide a spreadsheetId in the request body.',
        },
        { status: 500 }
      );
    }

    // Validate credentials exist
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
      return NextResponse.json(
        { error: 'Google service account credentials not configured' },
        { status: 500 }
      );
    }

    // Handle different actions
    if (action === 'validate') {
      const isValid = await validateSheetsAccess(spreadsheetId);
      return NextResponse.json({ valid: isValid, spreadsheetId });
    }

    // Fetch all sheets data
    const data = await fetchAllSheets(spreadsheetId);

    return NextResponse.json({
      success: true,
      spreadsheetId,
      data,
    });
  } catch (error: any) {
    console.error('Error in sheets API:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch data from Google Sheets',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

