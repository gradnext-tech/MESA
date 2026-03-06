import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSheets } from '@/lib/googleSheets';
import { ensureWeekFolderForSession, getGoogleDriveClient, computeProgramWeekNumber } from '@/lib/googleDrive';
import { parseSessionDate } from '@/utils/metricsCalculator';
import { sendReportEmail } from '@/lib/email';
import { google } from 'googleapis';
import { endOfWeek, format, startOfWeek } from 'date-fns';

type SheetsRow = { [key: string]: any };

function getSheetsWriteClient() {
  const credentialsString = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (!credentialsString) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable not found');
  }

  let credentials: any;
  try {
    credentials = JSON.parse(credentialsString);
  } catch {
    throw new Error(
      "Invalid JSON in GOOGLE_SERVICE_ACCOUNT_CREDENTIALS. Make sure it's a valid JSON string."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

function columnIndexToLetter(index: number): string {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode((i % 26) + 65) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

async function markReportSent(
  spreadsheetId: string,
  sheetName: string,
  headerRowNumber: number,
  rowNumber: number
) {
  const sheets = getSheetsWriteClient();

  const headerRange = `'${sheetName.replace(/'/g, "''")}'!A${headerRowNumber}:ZZ${headerRowNumber}`;
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
  });

  const headerRow = headerResp.data.values?.[0] || [];
  let colIndex = headerRow.findIndex(
    (h) => String(h || '').trim().toLowerCase() === 'report sent'
  );

  if (colIndex === -1) {
    colIndex = headerRow.length;
    const colLetter = columnIndexToLetter(colIndex);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName.replace(/'/g, "''")}'!${colLetter}${headerRowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Report Sent']] },
    });
  }

  const colLetter = columnIndexToLetter(colIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName.replace(/'/g, "''")}'!${colLetter}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['Yes']] },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      menteeEmail: string;
      menteeName: string;
      mentorName?: string;
      sessionDate: string;
    };

    const menteeEmail = (body.menteeEmail || '').trim();
    const menteeName = (body.menteeName || '').trim();
    const mentorName = (body.mentorName || '').trim();
    const sessionDateStr = (body.sessionDate || '').trim();

    if (!menteeEmail || !menteeName || !sessionDateStr) {
      return NextResponse.json(
        { error: 'menteeEmail, menteeName and sessionDate are required.' },
        { status: 400 }
      );
    }

    const sessionsSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
    const feedbacksSpreadsheetId = process.env.GOOGLE_FEEDBACKS_SPREADSHEET_ID?.trim();
    const rootFolderId = process.env.GOOGLE_REPORTS_ROOT_FOLDER_ID?.trim();

    if (!sessionsSpreadsheetId || !feedbacksSpreadsheetId || !rootFolderId) {
      return NextResponse.json(
        {
          error:
            'GOOGLE_SPREADSHEET_ID, GOOGLE_FEEDBACKS_SPREADSHEET_ID and GOOGLE_REPORTS_ROOT_FOLDER_ID must be configured.',
        },
        { status: 500 }
      );
    }

    const { sessions, candidateFeedbacks } = await fetchAllSheets(
      sessionsSpreadsheetId,
      feedbacksSpreadsheetId
    );

    const candidateRows: SheetsRow[] = Array.isArray(candidateFeedbacks)
      ? candidateFeedbacks
      : [];
    const sessionRows: SheetsRow[] = Array.isArray(sessions) ? sessions : [];

    const sessionDateObj = parseSessionDate(sessionDateStr);
    if (!sessionDateObj) {
      return NextResponse.json(
        { error: `Could not parse sessionDate: ${sessionDateStr}` },
        { status: 400 }
      );
    }

    // Determine program week number from sessions sheet (same logic as generator)
    let earliestDate: Date | null = null;
    sessionRows.forEach((s) => {
      const raw =
        s.date ||
        s.Date ||
        s['Session Date'] ||
        s['date'] ||
        s['Date of Session'] ||
        s['Session date'];
      if (!raw) return;
      const d = parseSessionDate(String(raw));
      if (!d) return;
      if (!earliestDate || d.getTime() < earliestDate.getTime()) {
        earliestDate = d;
      }
    });
    const earliestSessionDate = earliestDate || new Date();
    const weekNumber = computeProgramWeekNumber(earliestSessionDate, sessionDateObj);

    // Find corresponding feedback row to mark Report Sent later
    let targetRow: SheetsRow | null = null;
    for (const row of candidateRows) {
      const name =
        (row['Candidate Name'] ||
          row['Mentee Name'] ||
          row['Student Name'] ||
          row['Full Name'] ||
          row['Name'] ||
          '') as string;
      const dateRaw =
        (row['Session Date'] ||
          row['Date of Session'] ||
          row['date'] ||
          row['Date'] ||
          row['Timestamp'] ||
          '') as string;
      const rowDate = parseSessionDate(dateRaw);
      if (
        name &&
        name.toLowerCase().trim() === menteeName.toLowerCase().trim() &&
        rowDate &&
        rowDate.getFullYear() === sessionDateObj.getFullYear() &&
        rowDate.getMonth() === sessionDateObj.getMonth() &&
        rowDate.getDate() === sessionDateObj.getDate()
      ) {
        targetRow = row;
        break;
      }
    }

    // Locate the PDF in Drive using same naming convention
    const weekFolderId = await ensureWeekFolderForSession(
      rootFolderId,
      weekNumber,
      sessionDateObj
    );
    const filename = `${menteeName} - Session ${format(sessionDateObj, 'yyyy-MM-dd')}.pdf`.replace(
      /[\\/:*?"<>|]/g,
      '_'
    );

    const { drive } = getGoogleDriveClient();
    const listResp = await drive.files.list({
      q: `'${weekFolderId}' in parents and name = '${filename}' and trashed = false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const file = listResp.data.files?.[0];
    if (!file || !file.id) {
      return NextResponse.json(
        { error: `Report file not found in Drive for ${menteeName} on ${sessionDateStr}.` },
        { status: 404 }
      );
    }

    // Share the file with the mentee as reader
    await drive.permissions.create({
      fileId: file.id,
      requestBody: {
        role: 'reader',
        type: 'user',
        emailAddress: menteeEmail,
      },
      sendNotificationEmail: false,
      supportsAllDrives: true,
    });

    const viewUrl = `https://drive.google.com/file/d/${file.id}/view`;

    // Send email via SMTP
    const subject = `Your Gradnext session report - ${format(sessionDateObj, 'MMM d, yyyy')}`;
    const plainText = `Hi ${menteeName},

Your Gradnext session report is ready.

You can view it here: ${viewUrl}

Best,
Gradnext Team`;

    const html = `<p>Hi ${menteeName},</p>
<p>Your Gradnext session report is ready.</p>
<p><a href="${viewUrl}" target="_blank" rel="noopener noreferrer">View your report</a></p>
<p style="margin-top:16px;">Best,<br/>Gradnext Team</p>`;

    await sendReportEmail({
      to: menteeEmail,
      subject,
      text: plainText,
      html,
    });

    // Mark "Report Sent" in sheet if we found the row
    if (targetRow && typeof targetRow._rowNumber === 'number') {
      const headerRowNumber =
        typeof targetRow._headerRowNumber === 'number'
          ? targetRow._headerRowNumber
          : 1;
      await markReportSent(
        feedbacksSpreadsheetId,
        'Candidate feedback form filled by mentors',
        headerRowNumber,
        targetRow._rowNumber
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Report email sent to ${menteeEmail}`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to send session report email',
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

