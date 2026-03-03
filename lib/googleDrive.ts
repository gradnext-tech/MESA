import { google } from 'googleapis';
import { startOfWeek, differenceInCalendarWeeks, startOfDay, format } from 'date-fns';
import { Readable } from 'stream';
import { parseSessionDate } from '@/utils/metricsCalculator';

interface GoogleClients {
  drive: ReturnType<typeof google.drive>;
}

export interface MentorSessionFeedbackContext {
  sessionDateRaw: string;
  mentorName: string;
  menteeName: string;
  menteeEmail: string;
  industry: string;
  caseType?: string;
  difficultyLevel?: string;
  interviewerEmail?: string;
  rawFeedback: string;
}

export interface GeneratedReportInfo {
  documentId: string;
  documentUrl: string;
  folderId: string;
  weekNumber: number;
}

/**
 * Initialize Google Drive client with service account credentials.
 * Uses the same GOOGLE_SERVICE_ACCOUNT_CREDENTIALS env var as Sheets.
 */
export function getGoogleDriveClient(): GoogleClients {
  const credentialsString = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;

  if (!credentialsString) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable not found');
  }

  let credentials: any;
  try {
    credentials = JSON.parse(credentialsString);
  } catch {
    throw new Error(
      "Invalid JSON in GOOGLE_SERVICE_ACCOUNT_CREDENTIALS. Make sure it's a valid JSON string on a single line."
    );
  }

  if (!credentials.type || credentials.type !== 'service_account') {
    throw new Error('Invalid service account credentials format');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

  return { drive };
}

async function ensureFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentFolderId?: string
): Promise<string> {
  const qParts = [
    `mimeType = 'application/vnd.google-apps.folder'`,
    `name = '${name.replace(/'/g, "\\'")}'`,
    'trashed = false',
  ];

  if (parentFolderId) {
    qParts.push(`'${parentFolderId}' in parents`);
  }

  const listResponse = await drive.files.list({
    q: qParts.join(' and '),
    pageSize: 1,
    fields: 'files(id, name)',
    // Required to work with shared drives; without these, Drive often reports
    // "File not found" even when the ID is valid and shared.
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existing = listResponse.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const createResponse = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : undefined,
    },
    fields: 'id',
    // Also required so that the parent can be a folder in a Shared Drive
    supportsAllDrives: true,
  });

  const folderId = createResponse.data.id;
  if (!folderId) {
    throw new Error(`Failed to create folder "${name}"`);
  }
  return folderId;
}

/**
 * Compute program week number given:
 * - allSessionsEarliestDate: earliest session date in the program
 * - sessionDate: date of the current session
 *
 * Weeks run Monday–Sunday. Week 1 is the week (Mon–Sun) containing the first ever session.
 */
export function computeProgramWeekNumber(allSessionsEarliestDate: Date, sessionDate: Date): number {
  const programWeek1Start = startOfWeek(startOfDay(allSessionsEarliestDate), { weekStartsOn: 1 });
  const sessionWeekStart = startOfWeek(startOfDay(sessionDate), { weekStartsOn: 1 });

  const diffWeeks = differenceInCalendarWeeks(sessionWeekStart, programWeek1Start, {
    weekStartsOn: 1,
  });

  return diffWeeks + 1;
}

/**
 * Ensure the week-level folder hierarchy exists and return the folderId
 * where reports for this week should be stored.
 *
 * Structure:
 *   ROOT
 *     └── Week <n> (Mon dd - Sun dd yyyy)
 */
export async function ensureWeekFolderForSession(
  rootFolderId: string,
  weekNumber: number,
  sessionDate: Date
): Promise<string> {
  const { drive } = getGoogleDriveClient();
  const weekStart = startOfWeek(sessionDate, { weekStartsOn: 1 });
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekLabel = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
  const folderName = `Week ${weekNumber} (${weekLabel})`;

  const weekFolderId = await ensureFolder(drive, folderName, rootFolderId);
  return weekFolderId;
}

/**
 * Build the prompt for OpenAI to transform raw mentor feedback
 * into a structured report matching the GradNext-style template.
 */
function buildReportPrompt(context: MentorSessionFeedbackContext): string {
  const {
    sessionDateRaw,
    mentorName,
    menteeName,
    industry,
    caseType,
    difficultyLevel,
    interviewerEmail,
    rawFeedback,
  } = context;

  return `
You are writing a concise feedback summary for a case interview session.

Output plain text only (no markdown). Structure your response using exactly these three sections, in this order:

Strengths:
- 2–4 bullet points highlighting what the student did well.

Areas for Improvement:
1. 3 short, specific points explaining what the student should improve.

Action Plan for Improvement:
1. 3 concrete, actionable steps the student can take before the next session.

IMPORTANT RULES:
- Do NOT repeat scores or numeric ratings.
- Do NOT restate session metadata like role, date, case type, or industry.
- Do NOT mention gradnext, headers, or any formatting instructions.
- Use simple sentences and student-friendly language.
- Base everything strictly on the mentor's raw feedback; do not invent case content.

Context for this session (do not repeat verbatim, just use it to guide your summary):
- Student name: ${menteeName}
- Mentor name: ${mentorName}
- Date: ${sessionDateRaw}
- Case type: ${caseType || 'NA'}
- Difficulty: ${difficultyLevel || 'NA'}
- Industry: ${industry || 'NA'}
- Mentor email: ${interviewerEmail || 'NA'}

Raw feedback from mentor:
${rawFeedback}
`.trim();
}

export async function generateReportBodyWithOpenAI(
  context: MentorSessionFeedbackContext
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const prompt = buildReportPrompt(context);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a concise case interview coach who writes structured feedback reports following a fixed template. Output plain text only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `OpenAI API error (${response.status} ${response.statusText}): ${errorText}`
    );
  }

  const json: any = await response.json();
  const content =
    json.choices?.[0]?.message?.content ||
    'Feedback report could not be generated due to missing content.';

  return String(content).trim();
}

/**
 * Create a Google Doc for a single session feedback using the GradNext-style template.
 * The doc is stored inside a week-level folder under the configured root folder.
 */
export async function createSessionFeedbackReportDoc(
  feedbackContext: MentorSessionFeedbackContext,
  earliestSessionDateRaw: string,
  options?: { rootFolderId?: string }
): Promise<GeneratedReportInfo> {
  const { drive } = getGoogleDriveClient();

  const rootFolderId =
    options?.rootFolderId || process.env.GOOGLE_REPORTS_ROOT_FOLDER_ID?.trim();
  if (!rootFolderId) {
    throw new Error(
      'GOOGLE_REPORTS_ROOT_FOLDER_ID is not configured. Please set it to the Drive folder ID where reports should be stored.'
    );
  }

  const sessionDate = parseSessionDate(feedbackContext.sessionDateRaw);
  if (!sessionDate) {
    throw new Error(
      `Could not parse session date from "${feedbackContext.sessionDateRaw}" for mentee ${feedbackContext.menteeEmail}`
    );
  }

  const earliestSessionDate = parseSessionDate(earliestSessionDateRaw) || sessionDate;
  const weekNumber = computeProgramWeekNumber(earliestSessionDate, sessionDate);
  const weekFolderId = await ensureWeekFolderForSession(rootFolderId, weekNumber, sessionDate);

  const documentTitle = `${feedbackContext.menteeName || 'Student'} - Session ${format(
    sessionDate,
    'yyyy-MM-dd'
  )}`;

  const openAiBody = await generateReportBodyWithOpenAI(feedbackContext);

  // This function is now only responsible for week calculation; actual PDF
  // creation and upload is handled elsewhere.
  return {
    documentId: '',
    documentUrl: '',
    folderId: weekFolderId,
    weekNumber,
  };
}

export async function uploadPdfToDrive(
  pdfBuffer: Buffer,
  filename: string,
  weekFolderId: string
): Promise<{ fileId: string; webViewLink?: string | null }> {
  const { drive } = getGoogleDriveClient();

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [weekFolderId],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(pdfBuffer),
    },
    fields: 'id, webViewLink',
    // Needed when weekFolderId is in a Shared Drive; otherwise Drive may
    // report "File not found" for valid folder IDs in shared drives.
    supportsAllDrives: true,
  });

  return {
    fileId: response.data.id || '',
    webViewLink: response.data.webViewLink,
  };
}

