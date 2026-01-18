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

function getGoogleSheetsClient() {
  const credentialsString = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (!credentialsString) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable not found');
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsString);
  } catch {
    throw new Error('Invalid JSON in GOOGLE_SERVICE_ACCOUNT_CREDENTIALS');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function findStudentRowIndex(
  sheets: any,
  spreadsheetId: string,
  email: string
): Promise<{ rowIndex: number; passwordHashColumnIndex: number; existingHash: string | null; sheetName: string } | null> {
  // Find exact sheet name
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find(
    (s: any) => s.properties?.title?.toLowerCase() === 'mentee directory'
  );
  if (!sheet || !sheet.properties?.title) return null;

  const exactSheetName = sheet.properties.title;
  const escapedName =
    exactSheetName.includes(' ') || exactSheetName.includes("'") || exactSheetName.includes('!')
      ? `'${exactSheetName.replace(/'/g, "''")}'`
      : exactSheetName;

  const range = `${escapedName}!A:ZZ`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values;
  if (!rows || rows.length < 2) return null;

  const headers = rows[0].map((h: any) => String(h || '').trim());

  const emailColumnIndex = headers.findIndex((h: string) => {
    const v = h.toLowerCase().trim();
    return v === 'email' || v === 'email address' || v === 'mentee email' || v === 'candidate email';
  });
  if (emailColumnIndex === -1) return null;

  let passwordHashColumnIndex = headers.findIndex((h: string) => {
    const v = h.toLowerCase().trim();
    return v === 'password hash' || v === 'passwordhash' || v === 'password_hash';
  });
  if (passwordHashColumnIndex === -1) {
    passwordHashColumnIndex = headers.length; // append
  }

  const normalizedEmail = email.trim().toLowerCase();
  const mentorRowIndex = rows.findIndex((row: any[], index: number) => {
    if (index === 0) return false;
    const rowEmail = (row[emailColumnIndex] || '').trim().toLowerCase();
    return rowEmail === normalizedEmail;
  });
  if (mentorRowIndex === -1) return null;

  // Only check existing hash if column exists in headers (not a new column)
  const row = rows[mentorRowIndex];
  let existingHash: string | null = null;
  if (passwordHashColumnIndex >= 0 && passwordHashColumnIndex < headers.length) {
    if (passwordHashColumnIndex < row.length) {
      const hashValue = (row[passwordHashColumnIndex] || '').trim();
      if (hashValue) existingHash = hashValue;
    }
  }

  return {
    rowIndex: mentorRowIndex + 1, // 1-based for A1
    passwordHashColumnIndex,
    existingHash,
    sheetName: exactSheetName,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password, confirmPassword } = body;

    if (!email || !password || !confirmPassword) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }

    const feedbacksSpreadsheetId = process.env.GOOGLE_FEEDBACKS_SPREADSHEET_ID;
    if (!feedbacksSpreadsheetId) {
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const sheets = getGoogleSheetsClient();
    const info = await findStudentRowIndex(sheets, feedbacksSpreadsheetId, email);
    if (!info) {
      return NextResponse.json({ error: 'Student not found in directory' }, { status: 404 });
    }

    if (info.existingHash) {
      return NextResponse.json(
        { error: 'Password is already set for this student. Please contact administrator to reset it.' },
        { status: 400 }
      );
    }

    const passwordHash = createHash('sha256').update(password).digest('hex');

    const escapedName =
      info.sheetName.includes(' ') || info.sheetName.includes("'") || info.sheetName.includes('!')
        ? `'${info.sheetName.replace(/'/g, "''")}'`
        : info.sheetName;

    const columnLetter = columnIndexToA1(info.passwordHashColumnIndex);

    // Ensure header exists
    const headerRange = `${escapedName}!${columnLetter}1`;
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: feedbacksSpreadsheetId,
        range: headerRange,
        valueInputOption: 'RAW',
        requestBody: { values: [['Password Hash']] },
      });
    } catch {
      // ignore
    }

    const cellRange = `${escapedName}!${columnLetter}${info.rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: feedbacksSpreadsheetId,
      range: cellRange,
      valueInputOption: 'RAW',
      requestBody: { values: [[passwordHash]] },
    });

    return NextResponse.json({ success: true, message: 'Password set successfully' });
  } catch (error) {
    console.error('Error setting student password:', error);
    return NextResponse.json({ error: 'An error occurred while setting password' }, { status: 500 });
  }
}

