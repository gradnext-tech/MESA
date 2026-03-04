import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSheets } from '@/lib/googleSheets';
import {
  MentorSessionFeedbackContext,
  ensureWeekFolderForSession,
  uploadPdfToDrive,
  computeProgramWeekNumber,
  generateReportBodyWithOpenAI,
} from '@/lib/googleDrive';
import { generateSessionFeedbackPdfFromContext, generateCandidateWeekSummaryPdf } from '@/lib/reportPdf';
import { parseSessionDate } from '@/utils/metricsCalculator';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { google } from 'googleapis';

type SheetsRow = { [key: string]: any };

interface CandidateWeekSession {
  context: MentorSessionFeedbackContext & {
    ratings: {
      scoping: string;
      structure: string;
      communication: string;
      businessAcumen: string;
      overall: string;
    };
  };
  summary: string;
  formattedDate: string;
  sessionDate: Date;
  weekNumber: number;
}

function isAuthenticated(_request: NextRequest): boolean {
  // TODO: enhance with real auth when available
  return true;
}

function getFirstNonEmptyField(row: SheetsRow, candidates: string[]): string {
  for (const key of candidates) {
    if (row[key] && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
    // Case-insensitive fallback
    const lowerKey = key.toLowerCase();
    for (const actualKey of Object.keys(row)) {
      if (
        actualKey.toLowerCase() === lowerKey ||
        actualKey.toLowerCase().replace(/\s+/g, '') === lowerKey.replace(/\s+/g, '')
      ) {
        const value = row[actualKey];
        if (value && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
    }
  }
  return '';
}

function buildMenteeIndustryIndex(students: SheetsRow[]): Map<string, string> {
  const map = new Map<string, string>();

  students.forEach((row) => {
    const email = getFirstNonEmptyField(row, ['Email', 'Mentee Email', 'Candidate Email', 'email'])
      .toLowerCase()
      .trim();
    if (!email) return;

    const industry = getFirstNonEmptyField(row, [
      'Industry',
      'Target Industry',
      'Preferred Industry',
      'Current Industry',
    ]);

    if (industry) {
      map.set(email, industry);
    }
  });

  return map;
}

function getEarliestSessionDateRaw(sessions: SheetsRow[]): string {
  let earliestDate: Date | null = null;
  let earliestRaw = '';

  sessions.forEach((s) => {
    const raw =
      s.date ||
      s.Date ||
      s['Session Date'] ||
      s['date'] ||
      s['Date of Session'] ||
      s['Session date'];
    if (!raw) return;

    const parsed = parseSessionDate(String(raw));
    if (!parsed) return;

    if (!earliestDate || parsed.getTime() < earliestDate.getTime()) {
      earliestDate = parsed;
      earliestRaw = String(raw);
    }
  });

  // Fallback: today if nothing else
  return earliestRaw || new Date().toISOString().slice(0, 10);
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

function columnIndexToLetter(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA ...
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode((i % 26) + 65) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

async function markReportsGenerated(
  spreadsheetId: string,
  sheetName: string,
  headerRowNumber: number,
  rowNumbers: number[]
) {
  if (!rowNumbers.length) return;

  const sheets = getSheetsWriteClient();

  // Read the header row to find or create the "Report Generated" column
  const headerRange = `'${sheetName.replace(/'/g, "''")}'!A${headerRowNumber}:ZZ${headerRowNumber}`;
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
  });

  const headerRow = headerResp.data.values?.[0] || [];
  let colIndex = headerRow.findIndex(
    (h) => String(h || '').trim().toLowerCase() === 'report generated'
  );

  if (colIndex === -1) {
    // Append new header cell
    colIndex = headerRow.length;
    const colLetter = columnIndexToLetter(colIndex);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName.replace(/'/g, "''")}'!${colLetter}${headerRowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Report Generated']] },
    });
  }

  const colLetter = columnIndexToLetter(colIndex);

  // Write "Yes" for each generated row
  const requests = rowNumbers.map((rowNumber) =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName.replace(/'/g, "''")}'!${colLetter}${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Yes']] },
    })
  );

  await Promise.all(requests);
}

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      dryRun?: boolean;
      mentorName?: string;
      candidateName?: string;
      sessionDate?: string;
      weekNumber?: number;
    };

    const sessionsSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
    const feedbacksSpreadsheetId = process.env.GOOGLE_FEEDBACKS_SPREADSHEET_ID?.trim();

    if (!sessionsSpreadsheetId || !feedbacksSpreadsheetId) {
      return NextResponse.json(
        {
          error:
            'Both GOOGLE_SPREADSHEET_ID and GOOGLE_FEEDBACKS_SPREADSHEET_ID must be configured in the environment.',
        },
        { status: 500 }
      );
    }

    // Load all relevant sheets in one go
    const { sessions, candidateFeedbacks, students } = await fetchAllSheets(
      sessionsSpreadsheetId,
      feedbacksSpreadsheetId
    );

    const candidateRows: SheetsRow[] = Array.isArray(candidateFeedbacks)
      ? candidateFeedbacks
      : [];
    const studentRows: SheetsRow[] = Array.isArray(students) ? students : [];
    const sessionRows: SheetsRow[] = Array.isArray(sessions) ? sessions : [];

    if (candidateRows.length === 0) {
      return NextResponse.json(
        {
          success: true,
          created: 0,
          skipped: 0,
          message:
            'No mentor-to-mentee feedback rows were found in the feedback spreadsheet (Candidate feedback form filled by mentors sheet).',
        },
        { status: 200 }
      );
    }

    const menteeIndustryIndex = buildMenteeIndustryIndex(studentRows);
    const earliestSessionDateRaw = getEarliestSessionDateRaw(sessionRows);
    const earliestSessionDateObj = parseSessionDate(earliestSessionDateRaw) || new Date();

    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : undefined;
    const dryRun = Boolean(body.dryRun);

    const filterMentorName = (body.mentorName || '').toLowerCase().trim();
    const filterCandidateName = (body.candidateName || '').toLowerCase().trim();
    const filterSessionDate = (body.sessionDate || '').trim();
    const filterWeekNumber =
      typeof body.weekNumber === 'number' && !Number.isNaN(body.weekNumber)
        ? body.weekNumber
        : undefined;

    let created = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    const errors: Array<{ menteeEmail: string; sessionDate: string; error: string }> = [];
    const generatedSessionsKeys: string[] = [];
    const candidateWeekSessions: CandidateWeekSession[] = [];
    const reportRowNumbers: number[] = [];
    let reportHeaderRowNumber: number | null = null;

    for (const row of candidateRows) {
      if (limit && created >= limit) {
        break;
      }

      let menteeEmail = '';

      let menteeName = getFirstNonEmptyField(row, [
        'Candidate Name',
        'Mentee Name',
        'Student Name',
        'Full Name',
        'Name',
      ]);

      // Fallback: any "name" column that is not clearly mentor-related
      // No additional fallback needed beyond generic "name" keys

      let mentorName = getFirstNonEmptyField(row, [
        'Mentor Name',
        'mentorName',
        'Interviewer',
        'Mentor',
      ]);

      const mentorEmail = getFirstNonEmptyField(row, [
        'Mentor Email',
        'mentorEmail',
        'Interviewer Email',
      ]);
      let sessionDateRaw =
        getFirstNonEmptyField(row, [
          'Session Date',
          'Date of Session',
          'date',
          'Date',
          'Timestamp',
        ]) || getFirstNonEmptyField(row, ['When was the session?', 'Session date and time']);

      // Fallback: any date/timestamp-like column
      if (!sessionDateRaw) {
        for (const key of Object.keys(row)) {
          const lower = key.toLowerCase();
          if (
            (lower.includes('date') ||
              lower.includes('time') ||
              lower.includes('timestamp')) &&
            row[key]
          ) {
            const value = String(row[key] || '').trim();
            if (value) {
              sessionDateRaw = value;
              break;
            }
          }
        }
      }

      const sessionDateObj = parseSessionDate(sessionDateRaw || '');

      // Raw feedback: explicitly take column K (11th column, index 10) as requested
      // googleSheets util always adds index-based keys: _col0, _col1, ...
      let rawFeedback = '';
      if (row['_col10'] !== undefined && row['_col10'] !== null) {
        rawFeedback = String(row['_col10']).trim();
      }

      const caseType = getFirstNonEmptyField(row, ['Case Type', 'caseType', 'Case type']);
      const difficultyLevel = getFirstNonEmptyField(row, [
        'Difficulty Level',
        'difficultyLevel',
        'Difficulty',
      ]);

      // If specific filters are provided, enforce them
      if (filterMentorName) {
        const mentorNameLower = (mentorName || '').toLowerCase().trim();
        if (!mentorNameLower || mentorNameLower !== filterMentorName) {
          continue;
        }
      }

      if (filterCandidateName) {
        const candidateLower = (menteeName || '').toLowerCase().trim();
        if (!candidateLower || candidateLower !== filterCandidateName) {
          continue;
        }
      }

      if (filterSessionDate) {
        const rowDateStr = String(sessionDateRaw || '').trim();
        if (!rowDateStr) {
          continue;
        }

        const bodyDate = parseSessionDate(filterSessionDate);
        const rowDate = parseSessionDate(rowDateStr);

        if (!bodyDate || !rowDate) {
          continue;
        }

        const sameDay =
          bodyDate.getFullYear() === rowDate.getFullYear() &&
          bodyDate.getMonth() === rowDate.getMonth() &&
          bodyDate.getDate() === rowDate.getDate();

        if (!sameDay) {
          continue;
        }
      }

      if (filterWeekNumber !== undefined) {
        if (!sessionDateObj) {
          continue;
        }
        const thisWeekNumber = computeProgramWeekNumber(earliestSessionDateObj, sessionDateObj);
        if (thisWeekNumber !== filterWeekNumber) {
          continue;
        }
      }

      // At minimum we need some feedback text
      if (!rawFeedback) {
        skipped++;
        skipReasons.noFeedback = (skipReasons.noFeedback || 0) + 1;
        continue;
      }

      // Reasonable defaults for missing values so we still generate a report
      if (!menteeName) {
        menteeName = menteeEmail.split('@')[0] || 'Student';
      }
      if (!mentorName) {
        mentorName = 'Mentor';
      }
      if (!sessionDateRaw) {
        // Fallback to earliest session date if we truly can't find a date
        sessionDateRaw = earliestSessionDateRaw;
        skipReasons.missingDateUsedEarliest =
          (skipReasons.missingDateUsedEarliest || 0) + 1;
      }

      const industry =
        (menteeEmail && menteeIndustryIndex.get(menteeEmail.toLowerCase())) || '';

      const context: MentorSessionFeedbackContext = {
        sessionDateRaw,
        mentorName,
        menteeName,
        menteeEmail,
        industry,
        caseType,
        difficultyLevel,
        interviewerEmail: mentorEmail || undefined,
        rawFeedback,
      };

      const sessionKey = `${menteeName}|${mentorName}|${sessionDateRaw}`;

      try {
        if (!dryRun) {
          const ratings = {
            scoping: getFirstNonEmptyField(row, ['Rating on scoping questions', '_col6']) || 'NA',
            structure:
              getFirstNonEmptyField(row, ['Rating on case setup and structure', '_col7']) || 'NA',
            communication:
              getFirstNonEmptyField(row, ['Rating on communication and confidence', '_col8']) ||
              'NA',
            businessAcumen:
              getFirstNonEmptyField(row, ['Rating on business acumen and creativity', '_col9']) ||
              'NA',
            overall: getFirstNonEmptyField(row, ['Overall Rating', '_col11']) || 'NA',
          };
          const pdfBuffer = await generateSessionFeedbackPdfFromContext({
            ...context,
            ratings,
          });

          const sessionDate = sessionDateObj || new Date();
          const weekNumber = computeProgramWeekNumber(earliestSessionDateObj, sessionDate);

          const rootFolderId = process.env.GOOGLE_REPORTS_ROOT_FOLDER_ID?.trim();
          if (!rootFolderId) {
            throw new Error(
              'GOOGLE_REPORTS_ROOT_FOLDER_ID is not configured. Please set it in your environment.'
            );
          }

          const weekFolderId = await ensureWeekFolderForSession(
            rootFolderId,
            weekNumber,
            sessionDate
          );

          const filename = `${menteeName} - Session ${format(
            sessionDate,
            'yyyy-MM-dd'
          )}.pdf`.replace(/[\\/:*?"<>|]/g, '_');

          await uploadPdfToDrive(pdfBuffer, filename, weekFolderId);

          // Track the sheet row so we can mark "Report Generated" = Yes
          const rowNumber =
            typeof row._rowNumber === 'number' && row._rowNumber > 0 ? row._rowNumber : null;
          const headerRowNumber =
            typeof row._headerRowNumber === 'number' && row._headerRowNumber > 0
              ? row._headerRowNumber
              : null;
          if (rowNumber && headerRowNumber) {
            reportRowNumbers.push(rowNumber);
            if (reportHeaderRowNumber == null) {
              reportHeaderRowNumber = headerRowNumber;
            }
          }

          // Collect for candidate+week summary if requested
          if (filterCandidateName && filterWeekNumber !== undefined) {
            const summaryText = await generateReportBodyWithOpenAI(context);
            candidateWeekSessions.push({
              context: {
                ...context,
                ratings,
              },
              summary: summaryText,
              formattedDate: format(sessionDate, 'MMMM d, yyyy'),
              sessionDate,
              weekNumber,
            });
          }
        }
        created++;
        generatedSessionsKeys.push(sessionKey);
      } catch (error: any) {
        errors.push({
          menteeEmail,
          sessionDate: sessionDateRaw,
          error: error?.message || 'Unknown error',
        });
      }
    }

    // If candidateName + weekNumber filters were provided, generate a weekly
    // concatenated report for that candidate and week.
    if (
      !dryRun &&
      filterCandidateName &&
      filterWeekNumber !== undefined &&
      candidateWeekSessions.length > 0
    ) {
      try {
        const rootFolderId = process.env.GOOGLE_REPORTS_ROOT_FOLDER_ID?.trim();
        if (!rootFolderId) {
          throw new Error(
            'GOOGLE_REPORTS_ROOT_FOLDER_ID is not configured. Please set it in your environment.'
          );
        }

        const sample = candidateWeekSessions[0];
        const weekNumber = sample.weekNumber;
        const weekStart = startOfWeek(sample.sessionDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(sample.sessionDate, { weekStartsOn: 1 });
        const weekLabel = `Week ${weekNumber} (${format(
          weekStart,
          'MMM d'
        )} - ${format(weekEnd, 'MMM d, yyyy')})`;

        const weekFolderId = await ensureWeekFolderForSession(
          rootFolderId,
          weekNumber,
          sample.sessionDate
        );

        const summaryPdf = await generateCandidateWeekSummaryPdf(
          sample.context.menteeName,
          weekLabel,
          candidateWeekSessions
        );

        const summaryFilename = `${sample.context.menteeName} - ${weekLabel} Summary.pdf`.replace(
          /[\\/:*?"<>|]/g,
          '_'
        );

        await uploadPdfToDrive(summaryPdf, summaryFilename, weekFolderId);
        created += 1;
      } catch (err: any) {
        errors.push({
          menteeEmail: candidateWeekSessions[0].context.menteeEmail,
          sessionDate: candidateWeekSessions[0].context.sessionDateRaw,
          error: err?.message || 'Failed to generate weekly summary report',
        });
      }
    }

    // Mark generated rows in the "Candidate feedback form filled by mentors" sheet
    if (!dryRun && reportRowNumbers.length && reportHeaderRowNumber && feedbacksSpreadsheetId) {
      try {
        await markReportsGenerated(
          feedbacksSpreadsheetId,
          'Candidate feedback form filled by mentors',
          reportHeaderRowNumber,
          Array.from(new Set(reportRowNumbers))
        );
      } catch (err) {
        // Do not fail the main request if marking fails
        // eslint-disable-next-line no-console
        console.warn('Failed to mark reports as generated in sheet:', err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        created,
        skipped,
        skipReasons,
        errors,
        generatedSessionsKeys,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to generate session feedback reports',
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

