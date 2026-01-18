import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { google } from 'googleapis';

function columnIndexToA1(columnIndex: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA, ...
  let n = columnIndex + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// Helper function to get Google Sheets client
function getGoogleSheetsClient() {
  const credentialsString = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  
  if (!credentialsString) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable not found');
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsString);
  } catch (error) {
    throw new Error('Invalid JSON in GOOGLE_SERVICE_ACCOUNT_CREDENTIALS');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Helper to find mentor row index by email
async function findMentorRowIndex(
  sheets: any,
  spreadsheetId: string,
  email: string
): Promise<{ rowIndex: number; passwordHashColumnIndex: number; existingHash: string | null } | null> {
  try {
    // Get the spreadsheet to find the exact sheet name
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title?.toLowerCase() === 'mentor directory'
    );

    if (!sheet || !sheet.properties?.title) {
      return null;
    }

    const exactSheetName = sheet.properties.title;
    const escapedName = exactSheetName.includes(' ') || exactSheetName.includes("'") || exactSheetName.includes('!')
      ? `'${exactSheetName.replace(/'/g, "''")}'`
      : exactSheetName;
    
    const range = `${escapedName}!A:ZZ`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      return null;
    }

    // Get headers (assuming row 1 contains headers)
    const headers = rows[0].map((h: any) => String(h || '').trim());
    
    // Find email column and password hash column
    const emailColumnIndex = headers.findIndex((h: string) => 
      h.toLowerCase() === 'mentor email' || 
      h.toLowerCase() === 'email' ||
      h.toLowerCase() === 'email address'
    );
    
    let passwordHashColumnIndex = headers.findIndex((h: string) => 
      h.toLowerCase() === 'password hash' || 
      h.toLowerCase() === 'passwordhash' ||
      h.toLowerCase() === 'password_hash'
    );

    // If Password Hash column doesn't exist, we'll need to add it
    if (passwordHashColumnIndex === -1) {
      passwordHashColumnIndex = headers.length; // Add at the end
    }

    if (emailColumnIndex === -1) {
      return null;
    }

    // Find the mentor's row
    const mentorRowIndex = rows.findIndex((row: any[], index: number) => {
      if (index === 0) return false; // Skip header row
      const rowEmail = (row[emailColumnIndex] || '').trim().toLowerCase();
      return rowEmail === email.toLowerCase();
    });

    if (mentorRowIndex === -1) {
      return null;
    }

    // Check if password hash already exists
    const mentorRow = rows[mentorRowIndex];
    let existingHash: string | null = null;
    
    // Only check for existing hash if the column exists (not a new column)
    if (passwordHashColumnIndex >= 0 && passwordHashColumnIndex < headers.length) {
      // Column exists in headers, check if row has a value
      if (passwordHashColumnIndex < mentorRow.length) {
        const hashValue = (mentorRow[passwordHashColumnIndex] || '').trim();
        if (hashValue && hashValue.length > 0) {
          existingHash = hashValue;
        }
      }
    }
    // If passwordHashColumnIndex >= headers.length, it's a new column, so existingHash stays null

    return {
      rowIndex: mentorRowIndex + 1, // Convert to 1-based index for Sheets API
      passwordHashColumnIndex,
      existingHash,
    };
  } catch (error) {
    console.error('Error finding mentor row:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password, confirmPassword } = body;

    // Validate input
    if (!email || !password || !confirmPassword) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    // Password strength validation
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const feedbacksSpreadsheetId = process.env.GOOGLE_FEEDBACKS_SPREADSHEET_ID;
    if (!feedbacksSpreadsheetId) {
      return NextResponse.json(
        { error: 'Configuration error' },
        { status: 500 }
      );
    }

    const sheets = getGoogleSheetsClient();

    // Find mentor's row in the sheet
    const mentorInfo = await findMentorRowIndex(sheets, feedbacksSpreadsheetId, email);
    
    if (!mentorInfo) {
      return NextResponse.json(
        { error: 'Mentor not found in directory' },
        { status: 404 }
      );
    }

    // Check if password is already set
    if (mentorInfo.existingHash && mentorInfo.existingHash.length > 0) {
      return NextResponse.json(
        { error: 'Password is already set for this mentor. Please contact administrator to reset it.' },
        { status: 400 }
      );
    }

    // Hash the password
    const passwordHash = createHash('sha256').update(password).digest('hex');

    // Get the sheet name
    const spreadsheet = await sheets.spreadsheets.get({ 
      spreadsheetId: feedbacksSpreadsheetId 
    });
    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title?.toLowerCase() === 'mentor directory'
    );
    const exactSheetName = sheet?.properties?.title || 'Mentor directory';
    const escapedName = exactSheetName.includes(' ') || exactSheetName.includes("'") || exactSheetName.includes('!')
      ? `'${exactSheetName.replace(/'/g, "''")}'`
      : exactSheetName;

    // Convert column index to A1 column letters (A, B, ..., Z, AA, AB, ...)
    const columnLetter = columnIndexToA1(mentorInfo.passwordHashColumnIndex);

    // If this is a new column, first update the header
    if (mentorInfo.passwordHashColumnIndex >= 0) {
      const headerRange = `${escapedName}!${columnLetter}1`;
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: feedbacksSpreadsheetId,
          range: headerRange,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['Password Hash']],
          },
        });
      } catch (error) {
        // Header might already exist, continue
      }
    }

    // Update the password hash in the mentor's row
    const cellRange = `${escapedName}!${columnLetter}${mentorInfo.rowIndex}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: feedbacksSpreadsheetId,
      range: cellRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[passwordHash]],
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Password set successfully',
    });
  } catch (error) {
    console.error('Error setting password:', error);
    return NextResponse.json(
      { error: 'An error occurred while setting password' },
      { status: 500 }
    );
  }
}
