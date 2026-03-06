import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSheets } from '@/lib/googleSheets';
import {
  MentorSessionFeedbackContext,
  ensureWeekFolderForSession,
  uploadPdfToDrive,
  computeProgramWeekNumber,
  generateReportBodyWithOpenAI,
} from '@/lib/googleDrive';
import {
  generateSessionFeedbackPdfFromContext,
  generateCandidateWeekConcatenatedReportsPdf,
} from '@/lib/reportPdf';
import { parseSessionDate } from '@/utils/metricsCalculator';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { google } from 'googleapis';

type SheetsRow = { [key: string]: any };

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

  const uniqueRowNumbers = Array.from(new Set(rowNumbers)).sort((a, b) => a - b);

  // Write "Yes" in a single batch request (fewer API calls)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: uniqueRowNumbers.map((rowNumber) => ({
        range: `'${sheetName.replace(/'/g, "''")}'!${colLetter}${rowNumber}`,
        values: [['Yes']],
      })),
    },
  });
}

async function ensureReportGeneratedColumnLetter(
  spreadsheetId: string,
  sheetName: string,
  headerRowNumber: number
): Promise<string> {
  const sheets = getSheetsWriteClient();
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
    colIndex = headerRow.length;
    const colLetter = columnIndexToLetter(colIndex);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName.replace(/'/g, "''")}'!${colLetter}${headerRowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Report Generated']] },
    });
    return colLetter;
  }

  return columnIndexToLetter(colIndex);
}

async function markReportsGeneratedWithKnownColumn(
  spreadsheetId: string,
  sheetName: string,
  colLetter: string,
  rowNumbers: number[]
) {
  if (!rowNumbers.length) return;
  const sheets = getSheetsWriteClient();
  const uniqueRowNumbers = Array.from(new Set(rowNumbers)).sort((a, b) => a - b);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: uniqueRowNumbers.map((rowNumber) => ({
        range: `'${sheetName.replace(/'/g, "''")}'!${colLetter}${rowNumber}`,
        values: [['Yes']],
      })),
    },
  });
}

type GenerateBody = {
  limit?: number;
  dryRun?: boolean;
  mentorName?: string;
  candidateName?: string;
  candidateNames?: string[];
  allCandidatesForWeek?: boolean;
  sessionDate?: string;
  weekNumber?: number;
};

async function handleGenerate(body: GenerateBody) {
  try {
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
    const filterSessionDate = (body.sessionDate || '').trim();
    const filterWeekNumber =
      typeof body.weekNumber === 'number' && !Number.isNaN(body.weekNumber)
        ? body.weekNumber
        : undefined;

    let candidateNamesToProcess: string[] =
      Array.isArray(body.candidateNames) && body.candidateNames.length > 0
        ? body.candidateNames.map((c) => String(c || '').toLowerCase().trim()).filter(Boolean)
        : body.candidateName
          ? [String(body.candidateName).toLowerCase().trim()]
          : [];

    // Pre-index rows so weekly "all students" doesn't become O(candidates * rows).
    // We apply the week + mentor filters up-front, then bucket by candidate name.
    const candidateBuckets = new Map<string, SheetsRow[]>();
    const prefilteredRows: SheetsRow[] = [];

    for (const row of candidateRows) {
      const menteeName = getFirstNonEmptyField(row, [
        'Candidate Name',
        'Mentee Name',
        'Student Name',
        'Full Name',
        'Name',
      ]);
      if (!menteeName) continue;
      const menteeLower = String(menteeName).toLowerCase().trim();
      if (!menteeLower) continue;

      const mentorName = getFirstNonEmptyField(row, [
        'Mentor Name',
        'mentorName',
        'Interviewer',
        'Mentor',
      ]);
      if (filterMentorName) {
        const mentorLower = String(mentorName || '').toLowerCase().trim();
        if (!mentorLower || mentorLower !== filterMentorName) {
          continue;
        }
      }

      const sessionDateRaw =
        getFirstNonEmptyField(row, [
          'Session Date',
          'Date of Session',
          'date',
          'Date',
          'Timestamp',
        ]) || getFirstNonEmptyField(row, ['When was the session?', 'Session date and time']);
      const sessionDateObj = parseSessionDate(sessionDateRaw || '');

      if (filterWeekNumber !== undefined) {
        if (!sessionDateObj) continue;
        const thisWeekNumber = computeProgramWeekNumber(earliestSessionDateObj, sessionDateObj);
        if (thisWeekNumber !== filterWeekNumber) continue;
      }

      prefilteredRows.push(row);
      const arr = candidateBuckets.get(menteeLower);
      if (arr) {
        arr.push(row);
      } else {
        candidateBuckets.set(menteeLower, [row]);
      }
    }

    // Convenience: for weekly generation, allow caller to avoid sending a huge candidateNames array.
    // When enabled, we derive all distinct candidate names for that week from the feedback rows.
    if (
      candidateNamesToProcess.length === 0 &&
      body.allCandidatesForWeek &&
      filterWeekNumber !== undefined
    ) {
      candidateNamesToProcess = Array.from(candidateBuckets.keys());
    }

    const candidatesToProcess: (string | undefined)[] =
      candidateNamesToProcess.length > 0 ? candidateNamesToProcess : [undefined];

    let created = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    const errors: Array<{ menteeEmail: string; sessionDate: string; error: string }> = [];
    const generatedSessionsKeys: string[] = [];
    const reportRowNumbers: number[] = [];
    let reportHeaderRowNumber: number | null = null;
    const logLines: string[] = [];
    const pendingMarkRowNumbers: number[] = [];
    let reportGeneratedColLetter: string | null = null;

    const log = (msg: string) => {
      logLines.push(msg);
      // eslint-disable-next-line no-console
      console.log(`[generate-reports] ${msg}`);
    };

    const flushMarksIfNeeded = async (force?: boolean) => {
      if (dryRun) return;
      if (!feedbacksSpreadsheetId) return;
      if (!reportHeaderRowNumber) return;
      if (!pendingMarkRowNumbers.length) return;
      if (!force && pendingMarkRowNumbers.length < 10) return;

      try {
        if (!reportGeneratedColLetter) {
          reportGeneratedColLetter = await ensureReportGeneratedColumnLetter(
            feedbacksSpreadsheetId,
            'Candidate feedback form filled by mentors',
            reportHeaderRowNumber
          );
        }
        const toFlush = pendingMarkRowNumbers.splice(0, pendingMarkRowNumbers.length);
        await markReportsGeneratedWithKnownColumn(
          feedbacksSpreadsheetId,
          'Candidate feedback form filled by mentors',
          reportGeneratedColLetter,
          toFlush
        );
        log(`  Marked Report Generated=Yes for ${toFlush.length} row(s)`);
      } catch (err: any) {
        // Do not fail the main request if marking fails
        // eslint-disable-next-line no-console
        console.warn('Failed to mark reports as generated in sheet:', err);
      }
    };

    log(
      `Started. Filters: candidateName=${candidatesToProcess.length === 1 && candidatesToProcess[0] ? candidatesToProcess[0] : '(batch)'}, weekNumber=${filterWeekNumber ?? '(all)'}, sessionDate=${filterSessionDate || '(all)'}, limit=${limit ?? '(none)'}`
    );

    for (const filterCandidateName of candidatesToProcess) {
      const candidateConcatSessions: Array<{
        context: MentorSessionFeedbackContext & {
          ratings: {
            scoping: string;
            structure: string;
            communication: string;
            businessAcumen: string;
            overall: string;
          };
        };
        formattedDate: string;
        openAiBody: string;
        sessionDate: Date;
        weekNumber: number;
      }> = [];
      const candidateConcatRowNumbers: number[] = [];
      let candidateCreated = 0;
      let candidateSkipped = 0;
      const candidateSkipReasons: Record<string, number> = {};
      const errorsAtStart = errors.length;
      log(
        `--- Processing: ${filterCandidateName ?? '(all)'} (week ${filterWeekNumber ?? 'all'}) ---`
      );

      const rowsToScan: SheetsRow[] =
        filterCandidateName ? candidateBuckets.get(filterCandidateName) || [] : prefilteredRows;

    for (const row of rowsToScan) {
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

      // Apply filters first so we only consider rows for the current candidate
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

      // Skip if report is already marked as generated in the sheet
      const reportGeneratedRaw =
        getFirstNonEmptyField(row, [
          'is report generated',
          'Report Generated',
          'report generated',
          'Is Report Generated',
        ]) || '';
      const reportGeneratedNormalized = reportGeneratedRaw.trim().toLowerCase();
      const isAlreadyGenerated =
        reportGeneratedNormalized === 'yes' ||
        reportGeneratedNormalized === 'true' ||
        reportGeneratedNormalized === 'done' ||
        reportGeneratedNormalized === 'generated';
      if (isAlreadyGenerated) {
        skipped++;
        candidateSkipped++;
        skipReasons.alreadyGenerated = (skipReasons.alreadyGenerated || 0) + 1;
        candidateSkipReasons.alreadyGenerated = (candidateSkipReasons.alreadyGenerated || 0) + 1;
        log(`  Skip (already generated): ${menteeName} | ${sessionDateRaw} | ${mentorName}`);
        continue;
      }

      // Raw feedback: explicitly take column K (11th column, index 10) as requested
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

      // At minimum we need some feedback text
      if (!rawFeedback) {
        skipped++;
        candidateSkipped++;
        skipReasons.noFeedback = (skipReasons.noFeedback || 0) + 1;
        candidateSkipReasons.noFeedback = (candidateSkipReasons.noFeedback || 0) + 1;
        log(`  Skip (no feedback): ${menteeName} | ${sessionDateRaw}`);
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
        sessionDateRaw = earliestSessionDateRaw;
        skipReasons.missingDateUsedEarliest =
          (skipReasons.missingDateUsedEarliest || 0) + 1;
        candidateSkipReasons.missingDateUsedEarliest =
          (candidateSkipReasons.missingDateUsedEarliest || 0) + 1;
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

      log(`  Processing: ${menteeName} | ${sessionDateRaw} | ${mentorName}`);

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
          const sessionDate = sessionDateObj || new Date();
          const weekNumber = computeProgramWeekNumber(earliestSessionDateObj, sessionDate);

          const rootFolderId = process.env.GOOGLE_REPORTS_ROOT_FOLDER_ID?.trim();
          if (!rootFolderId) {
            throw new Error(
              'GOOGLE_REPORTS_ROOT_FOLDER_ID is not configured. Please set it in your environment.'
            );
          }

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

          // Weekly mode: generate ONE concatenated PDF per student/week instead of individual PDFs.
          if (filterWeekNumber !== undefined) {
            const openAiBody = await generateReportBodyWithOpenAI({ ...context, ratings });
            candidateConcatSessions.push({
              context: { ...context, ratings },
              openAiBody,
              formattedDate: format(sessionDate, 'MMMM d, yyyy'),
              sessionDate,
              weekNumber,
            });
            if (rowNumber) {
              candidateConcatRowNumbers.push(rowNumber);
            }
            log(`    Queued for concatenation: ${format(sessionDate, 'yyyy-MM-dd')}`);
          } else {
            const pdfBuffer = await generateSessionFeedbackPdfFromContext({
              ...context,
              ratings,
            });

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
            log(`    Created: ${filename}`);

            if (rowNumber) {
              pendingMarkRowNumbers.push(rowNumber);
            }
            created++;
            candidateCreated++;
            await flushMarksIfNeeded(false);
          }
        }
        generatedSessionsKeys.push(sessionKey);
      } catch (error: any) {
        const errMsg = error?.message || 'Unknown error';
        log(`    Error: ${menteeName} | ${sessionDateRaw} | ${errMsg}`);
        errors.push({
          menteeEmail,
          sessionDate: sessionDateRaw,
          error: errMsg,
        });
      }
    }

      // Weekly mode: after collecting session pages, create one concatenated PDF and mark all rows.
      if (!dryRun && filterWeekNumber !== undefined && candidateConcatSessions.length > 0) {
        try {
          const rootFolderId = process.env.GOOGLE_REPORTS_ROOT_FOLDER_ID?.trim();
          if (!rootFolderId) {
            throw new Error(
              'GOOGLE_REPORTS_ROOT_FOLDER_ID is not configured. Please set it in your environment.'
            );
          }

          const sample = candidateConcatSessions[0];
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

          const concatenatedPdf = await generateCandidateWeekConcatenatedReportsPdf(
            candidateConcatSessions[0].context.menteeName,
            weekLabel,
            candidateConcatSessions.map((s) => ({
              context: s.context,
              formattedDate: s.formattedDate,
              openAiBody: s.openAiBody,
            }))
          );

          const count = candidateConcatSessions.length;
          const concatenatedFilename = `${candidateConcatSessions[0].context.menteeName} - ${weekLabel} - ${count} Session Report${
            count === 1 ? '' : 's'
          }.pdf`.replace(/[\\/:*?"<>|]/g, '_');

          await uploadPdfToDrive(concatenatedPdf, concatenatedFilename, weekFolderId);
          created += 1;
          candidateCreated += 1;
          log(`  Created (concatenated): ${concatenatedFilename}`);

          pendingMarkRowNumbers.push(...candidateConcatRowNumbers);
          await flushMarksIfNeeded(true);
        } catch (err: any) {
          const errMsg = err?.message || 'Failed to generate concatenated weekly report';
          log(`  Concatenated weekly report error: ${errMsg}`);
          errors.push({
            menteeEmail: candidateConcatSessions[0].context.menteeEmail,
            sessionDate: candidateConcatSessions[0].context.sessionDateRaw,
            error: errMsg,
          });
        }
      }

      log(`Done: created=${candidateCreated}, skipped=${candidateSkipped}, skipReasons=${JSON.stringify(candidateSkipReasons)}, errors=${errors.length - errorsAtStart}`);
    }

    // Mark generated rows in the "Candidate feedback form filled by mentors" sheet
    await flushMarksIfNeeded(true);

    return NextResponse.json(
      {
        success: true,
        created,
        skipped,
        skipReasons,
        errors,
        generatedSessionsKeys,
        log: logLines,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const details = error?.message || String(error);
    // eslint-disable-next-line no-console
    console.error('[generate-reports] Fatal error:', details, error?.stack);
    return NextResponse.json(
      {
        error: 'Failed to generate session feedback reports',
        details,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateBody;
  return handleGenerate(body);
}

/**
 * Find the next (student, week) batch for backfill: one student's sessions in one week,
 * ordered from the start (earliest weeks first). Only includes rows where Report Generated
 * is not yet Yes. Processes one batch per cron run to keep API costs and error risk low.
 */
async function getNextBackfillBatch(): Promise<{ candidateName: string; weekNumber: number } | null> {
  const sessionsSpreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  const feedbacksSpreadsheetId = process.env.GOOGLE_FEEDBACKS_SPREADSHEET_ID?.trim();
  if (!sessionsSpreadsheetId || !feedbacksSpreadsheetId) return null;

  const { sessions, candidateFeedbacks } = await fetchAllSheets(
    sessionsSpreadsheetId,
    feedbacksSpreadsheetId
  );
  const candidateRows: SheetsRow[] = Array.isArray(candidateFeedbacks) ? candidateFeedbacks : [];
  const sessionRows: SheetsRow[] = Array.isArray(sessions) ? sessions : [];

  const earliestSessionDateRaw = getEarliestSessionDateRaw(sessionRows);
  const earliestSessionDateObj = parseSessionDate(earliestSessionDateRaw) || new Date();

  const pendingBatches = new Map<string, number>(); // key: "menteeName|weekNumber", value: weekNumber (for sorting)

  for (const row of candidateRows) {
    const reportGeneratedRaw =
      getFirstNonEmptyField(row, [
        'is report generated',
        'Report Generated',
        'report generated',
        'Is Report Generated',
      ]) || '';
    const reportGeneratedNormalized = reportGeneratedRaw.trim().toLowerCase();
    const isAlreadyGenerated = ['yes', 'true', 'done', 'generated'].includes(reportGeneratedNormalized);
    if (isAlreadyGenerated) continue;

    const rawFeedback =
      row['_col10'] !== undefined && row['_col10'] !== null ? String(row['_col10']).trim() : '';
    if (!rawFeedback) continue;

    const menteeName = getFirstNonEmptyField(row, [
      'Candidate Name',
      'Mentee Name',
      'Student Name',
      'Full Name',
      'Name',
    ]);
    if (!menteeName) continue;

    const sessionDateRaw =
      getFirstNonEmptyField(row, [
        'Session Date',
        'Date of Session',
        'date',
        'Date',
        'Timestamp',
      ]) || getFirstNonEmptyField(row, ['When was the session?', 'Session date and time']);
    const sessionDateObj = parseSessionDate(sessionDateRaw || '');
    if (!sessionDateObj) continue;

    const weekNumber = computeProgramWeekNumber(earliestSessionDateObj, sessionDateObj);
    const key = `${menteeName}|${weekNumber}`;
    if (!pendingBatches.has(key)) {
      pendingBatches.set(key, weekNumber);
    }
  }

  if (pendingBatches.size === 0) return null;

  // Sort by weekNumber ascending, then by student name (process from start)
  const sorted = Array.from(pendingBatches.entries())
    .sort((a, b) => {
      const [keyA, weekA] = a;
      const [keyB, weekB] = b;
      if (weekA !== weekB) return weekA - weekB;
      return keyA.localeCompare(keyB);
    });

  const [firstKey, weekNumber] = sorted[0];
  const candidateName = firstKey.split('|')[0];
  return { candidateName, weekNumber };
}

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'daily';

  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10); // yyyy-MM-dd

  let body: GenerateBody;
  if (mode === 'backfill') {
    const batch = await getNextBackfillBatch();
    if (!batch) {
      return NextResponse.json(
        {
          success: true,
          created: 0,
          skipped: 0,
          message: 'No pending backfill batches. All reports are generated.',
        },
        { status: 200 }
      );
    }
    body = { candidateName: batch.candidateName, weekNumber: batch.weekNumber };
  } else {
    body = { sessionDate: isoDate };
  }

  return handleGenerate(body);
}

