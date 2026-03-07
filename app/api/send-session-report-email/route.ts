import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSheets, fetchSheetData } from '@/lib/googleSheets';
import { ensureWeekFolderForSession, getGoogleDriveClient, computeProgramWeekNumber } from '@/lib/googleDrive';
import { parseSessionDate } from '@/utils/metricsCalculator';
import { sendReportEmail } from '@/lib/email';
import { google } from 'googleapis';
import { format, startOfWeek, addWeeks } from 'date-fns';

type SheetsRow = { [key: string]: any };

const CORPORATE_TRACKER_SPREADSHEET_ID = '1nhceEQCKYw3G_1MdwH4eq2xNaXo-QpBgkxZjvjY_TCc';
const CORPORATE_TRACKER_COLUMN_Y = 'Y';

function getFirstNonEmptyField(row: SheetsRow, candidates: string[]): string {
  for (const key of candidates) {
    if (row[key] != null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
    const lowerKey = key.toLowerCase();
    for (const actualKey of Object.keys(row)) {
      if (
        actualKey.toLowerCase() === lowerKey ||
        actualKey.toLowerCase().replace(/\s+/g, '') === lowerKey.replace(/\s+/g, '')
      ) {
        const value = row[actualKey];
        if (value != null && String(value).trim() !== '') return String(value).trim();
      }
    }
  }
  return '';
}

function buildSessionMatchKey(menteeName: string, sessionDateRaw: string): string {
  const name = (menteeName || '').toLowerCase().trim();
  const parsed = parseSessionDate(sessionDateRaw || '');
  const dateStr = parsed ? format(parsed, 'yyyy-MM-dd') : String(sessionDateRaw || '').trim();
  return `${name}|${dateStr}`;
}

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

async function markCorporateTrackerReportSent(
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number
) {
  const sheets = getSheetsWriteClient();
  const escaped = sheetName.replace(/'/g, "''");
  const rangePrefix = escaped.includes(' ') || escaped.includes("'") ? `'${escaped}'` : escaped;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${rangePrefix}!${CORPORATE_TRACKER_COLUMN_Y}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['Yes']] },
  });
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
      sessionDate?: string;
      weekNumber?: number;
    };

    const menteeEmail = (body.menteeEmail || '').trim();
    const menteeName = (body.menteeName || '').trim();
    const mentorName = (body.mentorName || '').trim();
    const sessionDateStr = (body.sessionDate || '').trim();
    const bodyWeekNumber =
      typeof body.weekNumber === 'number' && !Number.isNaN(body.weekNumber)
        ? body.weekNumber
        : undefined;

    const useWeekMode = bodyWeekNumber !== undefined;
    if (!menteeEmail || !menteeName) {
      return NextResponse.json(
        { error: 'menteeEmail and menteeName are required.' },
        { status: 400 }
      );
    }
    if (!useWeekMode && !sessionDateStr) {
      return NextResponse.json(
        { error: 'Either sessionDate or weekNumber is required.' },
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
    const programWeek1Start = startOfWeek(earliestSessionDate, { weekStartsOn: 1 });

    let weekNumber: number;
    let sessionDateObj: Date;
    let targetRows: SheetsRow[] = [];

    if (useWeekMode) {
      weekNumber = bodyWeekNumber;
      sessionDateObj = addWeeks(programWeek1Start, weekNumber - 1);
      const menteeLower = menteeName.toLowerCase().trim();
      for (const row of candidateRows) {
        const name = getFirstNonEmptyField(row, [
          'Candidate Name',
          'Mentee Name',
          'Student Name',
          'Full Name',
          'Name',
        ]);
        if ((name || '').toLowerCase().trim() !== menteeLower) continue;
        const dateRaw = getFirstNonEmptyField(row, [
          'Session Date',
          'Date of Session',
          'date',
          'Date',
          'Timestamp',
        ]);
        const rowDate = parseSessionDate(dateRaw);
        if (!rowDate) continue;
        const rowWeek = computeProgramWeekNumber(earliestSessionDate, rowDate);
        if (rowWeek !== weekNumber) continue;
        targetRows.push(row);
      }
    } else {
      sessionDateObj = parseSessionDate(sessionDateStr)!;
      if (!sessionDateObj) {
        return NextResponse.json(
          { error: `Could not parse sessionDate: ${sessionDateStr}` },
          { status: 400 }
        );
      }
      weekNumber = computeProgramWeekNumber(earliestSessionDate, sessionDateObj);
      for (const row of candidateRows) {
        const name = getFirstNonEmptyField(row, [
          'Candidate Name',
          'Mentee Name',
          'Student Name',
          'Full Name',
          'Name',
        ]);
        const dateRaw = getFirstNonEmptyField(row, [
          'Session Date',
          'Date of Session',
          'date',
          'Date',
          'Timestamp',
        ]);
        const rowDate = parseSessionDate(dateRaw);
        if (
          name &&
          name.toLowerCase().trim() === menteeName.toLowerCase().trim() &&
          rowDate &&
          rowDate.getFullYear() === sessionDateObj.getFullYear() &&
          rowDate.getMonth() === sessionDateObj.getMonth() &&
          rowDate.getDate() === sessionDateObj.getDate()
        ) {
          targetRows = [row];
          break;
        }
      }
    }

    // Do not resend if all relevant rows are already marked as sent
    const allAlreadySent =
      targetRows.length > 0 &&
      targetRows.every((row) => {
        const raw = getFirstNonEmptyField(row, ['Report Sent', 'report sent', 'Is Report Sent']);
        const norm = raw.toLowerCase();
        return ['yes', 'true', 'sent', 'done'].includes(norm);
      });
    if (allAlreadySent) {
      return NextResponse.json(
        { success: true, message: 'Report was already sent; no duplicate sent.', alreadySent: true },
        { status: 200 }
      );
    }

    // Locate the PDF in Drive: week folder first, then find the specific report
    const weekFolderId = await ensureWeekFolderForSession(
      rootFolderId,
      weekNumber,
      sessionDateObj
    );

    const { drive } = getGoogleDriveClient();
    const listResp = await drive.files.list({
      q: `'${weekFolderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const candidates = (listResp.data.files || []).filter((f) => {
      if (!f.name || !f.name.endsWith('.pdf')) return false;
      const hasName = f.name.includes(menteeName);
      const hasWeek = f.name.includes('Week') || f.name.includes('week');
      const hasSessionReport =
        f.name.includes('Session Report') || f.name.includes('Session report');
      return hasName && hasWeek && hasSessionReport;
    });

    let file: { id?: string | null; name?: string | null } | null = candidates[0] ?? null;
    if (!file?.id && !useWeekMode) {
      const individualFilename = `${menteeName} - Session ${format(sessionDateObj, 'yyyy-MM-dd')}.pdf`.replace(
        /[\\/:*?"<>|]/g,
        '_'
      );
      const singleResp = await drive.files.list({
        q: `'${weekFolderId}' in parents and name = '${individualFilename}' and trashed = false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      file = singleResp.data.files?.[0] ?? null;
    }

    if (!file || !file.id) {
      return NextResponse.json(
        {
          error: `Report file not found in Drive for ${menteeName}${useWeekMode ? ` in week ${weekNumber}` : ` on ${sessionDateStr}`}. Search week folder first, then the specific report. Only send when a report is present.`,
        },
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
    const weekLabel = useWeekMode
      ? `Week ${weekNumber}`
      : format(sessionDateObj, 'MMM d, yyyy');
    const subject = `Your Gradnext session report - ${weekLabel}`;
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

    // Mark "Report Sent" in feedback sheet for all matching rows
    for (const targetRow of targetRows) {
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
    }

    // Mark "Report Sent" in corporate tracker (column Y) for all matching rows
    const corporateTrackerSpreadsheetId = (
      process.env.GOOGLE_CORPORATE_TRACKER_SPREADSHEET_ID || CORPORATE_TRACKER_SPREADSHEET_ID
    ).trim();
    const corporateTrackerSheetName = (
      process.env.GOOGLE_CORPORATE_TRACKER_SHEET_NAME || 'Sheet1'
    ).trim();
    if (corporateTrackerSpreadsheetId && targetRows.length > 0) {
      try {
        const corporateRows = await fetchSheetData(
          corporateTrackerSpreadsheetId,
          corporateTrackerSheetName
        );
        const matchedKeys = new Set(
          targetRows.map((r) => {
            const dateRaw = getFirstNonEmptyField(r, [
              'Session Date',
              'Date of Session',
              'date',
              'Date',
              'Timestamp',
            ]);
            return buildSessionMatchKey(menteeName, dateRaw);
          })
        );
        for (const r of corporateRows as SheetsRow[]) {
          const name = getFirstNonEmptyField(r, [
            'Candidate Name',
            'Mentee Name',
            'Student Name',
            'Full Name',
            'Name',
          ]);
          const dateRaw = getFirstNonEmptyField(r, [
            'Session Date',
            'Date of Session',
            'date',
            'Date',
            'Timestamp',
          ]);
          const key = buildSessionMatchKey(name, dateRaw);
          if (matchedKeys.has(key) && typeof r._rowNumber === 'number') {
            await markCorporateTrackerReportSent(
              corporateTrackerSpreadsheetId,
              corporateTrackerSheetName,
              r._rowNumber
            );
          }
        }
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('Failed to mark corporate tracker Report Sent:', err);
      }
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

