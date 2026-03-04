import { MentorSessionFeedbackContext, generateReportBodyWithOpenAI } from './googleDrive';
import { parseSessionDate } from '@/utils/metricsCalculator';
import { format } from 'date-fns';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlTemplate(
  context: MentorSessionFeedbackContext & {
    ratings: {
      scoping: string;
      structure: string;
      communication: string;
      businessAcumen: string;
      overall: string;
    };
  },
  openAiBody: string,
  formattedDate: string
): string {
  const safeBody = escapeHtml(openAiBody).replace(/\n/g, '<br />');

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Session Feedback Report</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 40px 48px;
        background: #f5f7fb;
        color: #111827;
        font-size: 12px;
      }
      .page {
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
        padding: 32px 40px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }
      .brand {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: lowercase;
        color: #111827;
      }
      .brand span {
        color: #111827;
      }
      .student-name {
        font-size: 18px;
        font-weight: 700;
        color: #111827;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 24px;
        font-size: 11px;
        margin-top: 8px;
      }
      .label {
        font-weight: 600;
        color: #4b5563;
      }
      .value {
        color: #111827;
      }
      .section-title {
        font-size: 13px;
        font-weight: 700;
        margin-top: 20px;
        margin-bottom: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid #e5e7eb;
        color: #111827;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 4px;
        font-size: 11px;
      }
      th, td {
        padding: 5px 6px;
        border: 1px solid #e5e7eb;
      }
      th {
        text-align: left;
        background: #f3f4f6;
        font-weight: 600;
        color: #374151;
      }
      td {
        color: #111827;
      }
      .content-block {
        margin-top: 6px;
        line-height: 1.5;
        color: #111827;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div class="brand"><span>grad</span>next</div>
        <div class="student-name">${escapeHtml(context.menteeName)}</div>
      </div>

      <div class="meta-grid">
        <div><span class="label">Role:</span> <span class="value">Business Generalist</span></div>
        <div><span class="label">Date:</span> <span class="value">${escapeHtml(
          formattedDate
        )}</span></div>
        <div><span class="label">Interviewer:</span> <span class="value">${escapeHtml(
          context.mentorName
        )}</span></div>
        <div><span class="label">Case Type:</span> <span class="value">${escapeHtml(
          context.caseType || 'NA'
        )}</span></div>
        <div><span class="label">Difficulty Level:</span> <span class="value">${escapeHtml(
          context.difficultyLevel || 'NA'
        )}</span></div>
        <div><span class="label">Industry:</span> <span class="value">${escapeHtml(
          context.industry || 'NA'
        )}</span></div>
      </div>

      <div class="section-title">Performance Breakdown (Score out of 5)</div>
      <table>
        <tr>
          <th>Scoping Questions</th>
          <td>${escapeHtml(context.ratings.scoping)}</td>
        </tr>
        <tr>
          <th>Case Setup and Structure</th>
          <td>${escapeHtml(context.ratings.structure)}</td>
        </tr>
        <tr>
          <th>Communication and Confidence</th>
          <td>${escapeHtml(context.ratings.communication)}</td>
        </tr>
        <tr>
          <th>Business Acumen and Creativity</th>
          <td>${escapeHtml(context.ratings.businessAcumen)}</td>
        </tr>
        <tr>
          <th>Overall Score</th>
          <td>${escapeHtml(context.ratings.overall)}</td>
        </tr>
      </table>

      <div class="section-title">Feedback Summary</div>
      <div class="content-block">
        ${safeBody}
      </div>
    </div>
  </body>
</html>
`.trim();
}

function buildWeekHtmlTemplate(
  candidateName: string,
  weekLabel: string,
  sessions: Array<{
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
  }>
): string {
  const sessionBlocks = sessions
    .map((s, idx) => {
      const c = s.context;
      const safeSummary = escapeHtml(s.summary).replace(/\n/g, '<br />');
      return `
      <div class="session-block">
        <div class="section-title">Session ${idx + 1} - ${escapeHtml(s.formattedDate)}</div>
        <div class="meta-grid">
          <div><span class="label">Mentor:</span> <span class="value">${escapeHtml(
            c.mentorName
          )}</span></div>
          <div><span class="label">Case Type:</span> <span class="value">${escapeHtml(
            c.caseType || 'NA'
          )}</span></div>
          <div><span class="label">Difficulty:</span> <span class="value">${escapeHtml(
            c.difficultyLevel || 'NA'
          )}</span></div>
        </div>
        <table>
          <tr><th>Scoping Questions</th><td>${escapeHtml(c.ratings.scoping)}</td></tr>
          <tr><th>Case Setup and Structure</th><td>${escapeHtml(
            c.ratings.structure
          )}</td></tr>
          <tr><th>Communication and Confidence</th><td>${escapeHtml(
            c.ratings.communication
          )}</td></tr>
          <tr><th>Business Acumen and Creativity</th><td>${escapeHtml(
            c.ratings.businessAcumen
          )}</td></tr>
          <tr><th>Overall Score</th><td>${escapeHtml(c.ratings.overall)}</td></tr>
        </table>
        <div class="section-title">Feedback Summary</div>
        <div class="content-block">
          ${safeSummary}
        </div>
      </div>
      `;
    })
    .join('\n');

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Weekly Feedback Report</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 40px 48px;
        background: #f5f7fb;
        color: #111827;
        font-size: 12px;
      }
      .page {
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
        padding: 32px 40px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }
      .brand {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: lowercase;
        color: #111827;
      }
      .brand span {
        color: #111827;
      }
      .student-name {
        font-size: 18px;
        font-weight: 700;
        color: #111827;
      }
      .week-label {
        font-size: 12px;
        color: #4b5563;
        margin-top: 4px;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 24px;
        font-size: 11px;
        margin-top: 8px;
      }
      .label {
        font-weight: 600;
        color: #4b5563;
      }
      .value {
        color: #111827;
      }
      .section-title {
        font-size: 13px;
        font-weight: 700;
        margin-top: 20px;
        margin-bottom: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid #e5e7eb;
        color: #111827;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 4px;
        font-size: 11px;
      }
      th, td {
        padding: 5px 6px;
        border: 1px solid #e5e7eb;
      }
      th {
        text-align: left;
        background: #f3f4f6;
        font-weight: 600;
        color: #374151;
      }
      td {
        color: #111827;
      }
      .content-block {
        margin-top: 6px;
        line-height: 1.5;
        color: #111827;
      }
      .session-block + .session-block {
        margin-top: 24px;
        border-top: 1px dashed #e5e7eb;
        padding-top: 16px;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div>
          <div class="brand"><span>grad</span>next</div>
          <div class="week-label">${escapeHtml(weekLabel)}</div>
        </div>
        <div class="student-name">${escapeHtml(candidateName)}</div>
      </div>
      ${sessionBlocks}
    </div>
  </body>
</html>
`.trim();
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const apiUrl = process.env.PLAYWRIGHT_API_URL;
  const apiKey = process.env.PLAYWRIGHT_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error(
      'PLAYWRIGHT_API_URL and PLAYWRIGHT_API_KEY must be set to generate PDFs with the Playwright API.'
    );
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      html,
      pdfOptions: {
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Playwright API error (${response.status} ${response.statusText}): ${text}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateSessionFeedbackPdfFromContext(
  context: MentorSessionFeedbackContext & {
    ratings: {
      scoping: string;
      structure: string;
      communication: string;
      businessAcumen: string;
      overall: string;
    };
  }
): Promise<Buffer> {
  const openAiBody = await generateReportBodyWithOpenAI(context);

  const sessionDate = parseSessionDate(context.sessionDateRaw);
  const formattedDate = sessionDate ? format(sessionDate, 'MMMM d, yyyy') : context.sessionDateRaw;
  const html = buildHtmlTemplate(context, openAiBody, formattedDate);
  return renderHtmlToPdf(html);
}

export async function generateCandidateWeekSummaryPdf(
  candidateName: string,
  weekLabel: string,
  sessions: Array<{
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
  }>
): Promise<Buffer> {
  const html = buildWeekHtmlTemplate(candidateName, weekLabel, sessions);
  return renderHtmlToPdf(html);
}

