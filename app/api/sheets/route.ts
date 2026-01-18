import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSheets, validateSheetsAccess } from '@/lib/googleSheets';

// Authentication check helper
function isAuthenticated(request: NextRequest): boolean {
  // In a production app, validate JWT tokens from Authorization header
  // For now, we rely on client-side session management
  // This should be enhanced with proper JWT validation
  return true;
}

export async function POST(request: NextRequest) {
  // Check authentication
  if (!isAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { action, sessionsSpreadsheetId: bodySessionsId, feedbacksSpreadsheetId: bodyFeedbacksId } = body;

    // Prefer server env; allow optional override from body if explicitly provided
    const sessionsSpreadsheetId =
      process.env.GOOGLE_SPREADSHEET_ID?.trim() || bodySessionsId?.trim();
    
    const feedbacksSpreadsheetId =
      process.env.GOOGLE_FEEDBACKS_SPREADSHEET_ID?.trim() || bodyFeedbacksId?.trim();

    if (!sessionsSpreadsheetId) {
      return NextResponse.json(
        {
          error:
            'GOOGLE_SPREADSHEET_ID is not configured. Add it to your environment variables or provide a sessionsSpreadsheetId in the request body.',
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
      const isValid = await validateSheetsAccess(sessionsSpreadsheetId);
      const feedbacksValid = feedbacksSpreadsheetId 
        ? await validateSheetsAccess(feedbacksSpreadsheetId).catch(() => false)
        : false;
      
      return NextResponse.json({ 
        valid: isValid, 
        sessionsSpreadsheetId,
        feedbacksValid,
        feedbacksSpreadsheetId: feedbacksSpreadsheetId || null,
      });
    }

    // Fetch all sheets data from both spreadsheets
    const data = await fetchAllSheets(sessionsSpreadsheetId, feedbacksSpreadsheetId);

    return NextResponse.json({
      success: true,
      sessionsSpreadsheetId,
      feedbacksSpreadsheetId: feedbacksSpreadsheetId || null,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to fetch data from Google Sheets',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

