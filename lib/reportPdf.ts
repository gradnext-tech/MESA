import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { MentorSessionFeedbackContext, generateReportBodyWithOpenAI } from './googleDrive';
import { parseSessionDate } from '@/utils/metricsCalculator';
import { format } from 'date-fns';

function isSupportedFontFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);

    // TrueType: 0x00010000, OpenType: 'OTTO'
    const hex = buf.toString('hex');
    const ascii = buf.toString('ascii');
    return hex === '00010000' || ascii === 'OTTO';
  } catch {
    return false;
  }
}

function tryRegisterReportFonts(doc: PDFKit.PDFDocument): { regular: string; bold: string } {
  const fontsDir = path.join(process.cwd(), 'assets/fonts');
  const regularCandidate = path.join(fontsDir, 'Report-Regular.ttf');
  const boldCandidate = path.join(fontsDir, 'Report-Bold.ttf');

  const regularOk = fs.existsSync(regularCandidate) && isSupportedFontFile(regularCandidate);
  const boldOk = fs.existsSync(boldCandidate) && isSupportedFontFile(boldCandidate);

  if (regularOk) {
    doc.registerFont('ReportRegular', regularCandidate);
  }
  if (boldOk) {
    doc.registerFont('ReportBold', boldCandidate);
  }

  // Prefer custom fonts when valid; otherwise fall back to built-ins.
  const regular = regularOk ? 'ReportRegular' : 'Helvetica';
  const bold = boldOk ? 'ReportBold' : 'Helvetica-Bold';

  if (!regularOk || !boldOk) {
    // eslint-disable-next-line no-console
    console.warn(
      '[reportPdf] Invalid/missing font(s) in assets/fonts; falling back to Helvetica.',
      {
        regularPath: regularCandidate,
        regularOk,
        boldPath: boldCandidate,
        boldOk,
      }
    );
  }

  return { regular, bold };
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

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((c) => Buffer.from(c)))));
    doc.on('error', (err) => reject(err));

    const { regular: FONT_REGULAR, bold: FONT_BOLD } = tryRegisterReportFonts(doc);

    const sessionDate = parseSessionDate(context.sessionDateRaw);
    const formattedDate = sessionDate ? format(sessionDate, 'MMMM d, yyyy') : context.sessionDateRaw;

    // Header
    doc
      .fontSize(20)
      .font(FONT_BOLD)
      .text('gradnext', { align: 'left' });

    doc
      .fontSize(18)
      .font(FONT_BOLD)
      .text(context.menteeName || '', { align: 'right' });

    doc.moveDown(1);

    doc.fontSize(10).font(FONT_REGULAR);

    // Meta information (two columns)
    const leftX = doc.x;
    const topY = doc.y;
    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;

    const metaLinesLeft = [
      `Role: Business Generalist`,
      `Interviewer: ${context.mentorName || 'NA'}`,
      `Difficulty Level: ${context.difficultyLevel || 'NA'}`,
    ];

    const metaLinesRight = [
      `Date: ${formattedDate}`,
      `Case Type: ${context.caseType || 'NA'}`,
      `Industry: ${context.industry || 'NA'}`,
    ];

    doc.text(metaLinesLeft.join('\n'), leftX, topY, { width: colWidth });
    doc.text(metaLinesRight.join('\n'), leftX + colWidth + 20, topY, { width: colWidth });

    doc.moveDown(2.5);

    // Performance Breakdown table header
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text('Performance Breakdown (Score out of 5)', { align: 'left' });

    doc.moveDown(0.5);

    // Simple table: parameter | score
    doc.fontSize(10).font(FONT_REGULAR);
    const tableX = doc.x;
    let tableY = doc.y;
    const labelWidth = 260;
    const valueWidth = 40;
    const rowHeight = 16;

    const rows: Array<[string, string]> = [
      ['Scoping Questions', context.ratings.scoping || 'NA'],
      ['Case Setup and Structure', context.ratings.structure || 'NA'],
      ['Communication and Confidence', context.ratings.communication || 'NA'],
      ['Business Acumen and Creativity', context.ratings.businessAcumen || 'NA'],
      ['Overall Score', context.ratings.overall || 'NA'],
    ];

    rows.forEach(([label, value]) => {
      // Border rectangles
      doc
        .rect(tableX, tableY, labelWidth, rowHeight)
        .strokeColor('#e5e7eb')
        .stroke();
      doc
        .rect(tableX + labelWidth, tableY, valueWidth, rowHeight)
        .strokeColor('#e5e7eb')
        .stroke();

      doc
        .fillColor('#111827')
        .text(label, tableX + 4, tableY + 3, { width: labelWidth - 8, height: rowHeight });
      doc
        .text(value, tableX + labelWidth + 4, tableY + 3, {
          width: valueWidth - 8,
          height: rowHeight,
          align: 'left',
        });

      tableY += rowHeight;
    });

    doc.moveTo(tableX, tableY).moveDown(1.5);

    // Feedback Summary
    doc
      .moveDown(1.5)
      .fontSize(12)
      .font(FONT_BOLD)
      .fillColor('#111827')
      .text('Feedback Summary', { align: 'left' });

    doc.moveDown(0.5);
    doc.fontSize(10).font(FONT_REGULAR).fillColor('#111827');
    doc.text(openAiBody, {
      align: 'left',
      lineGap: 2,
    });

    doc.end();
  });
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
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks.map((c) => Buffer.from(c)))));
    doc.on('error', (err) => reject(err));

    const { regular: FONT_REGULAR, bold: FONT_BOLD } = tryRegisterReportFonts(doc);

    // Header
    doc
      .fontSize(20)
      .font(FONT_BOLD)
      .text('gradnext', { align: 'left' });

    doc
      .fontSize(18)
      .font(FONT_BOLD)
      .text(candidateName || '', { align: 'right' });

    doc.moveDown(0.5);

    doc
      .fontSize(12)
      .font(FONT_REGULAR)
      .fillColor('#4b5563')
      .text(weekLabel, { align: 'left' });

    doc.moveDown(1.5);

    sessions.forEach((s, idx) => {
      const c = s.context;

      if (idx > 0) {
        doc
          .moveDown(1.5)
          .strokeColor('#e5e7eb')
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .stroke()
          .moveDown(1);
      }

      doc
        .fontSize(12)
        .font(FONT_BOLD)
        .fillColor('#111827')
        .text(`Session ${idx + 1} - ${s.formattedDate}`, { align: 'left' });

      doc.moveDown(0.5);
      doc.fontSize(10).font(FONT_REGULAR).fillColor('#111827');

      const leftX = doc.x;
      const topY = doc.y;
      const colWidth =
        (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;

      const metaLinesLeft = [`Mentor: ${c.mentorName || 'NA'}`, `Case Type: ${c.caseType || 'NA'}`];
      const metaLinesRight = [
        `Difficulty: ${c.difficultyLevel || 'NA'}`,
        `Industry: ${c.industry || 'NA'}`,
      ];

      doc.text(metaLinesLeft.join('\n'), leftX, topY, { width: colWidth });
      doc.text(metaLinesRight.join('\n'), leftX + colWidth + 20, topY, { width: colWidth });

      doc.moveDown(2);

      // Ratings table
      const tableX = doc.x;
      let tableY = doc.y;
      const labelWidth = 260;
      const valueWidth = 40;
      const rowHeight = 16;

      const rows: Array<[string, string]> = [
        ['Scoping Questions', c.ratings.scoping || 'NA'],
        ['Case Setup and Structure', c.ratings.structure || 'NA'],
        ['Communication and Confidence', c.ratings.communication || 'NA'],
        ['Business Acumen and Creativity', c.ratings.businessAcumen || 'NA'],
        ['Overall Score', c.ratings.overall || 'NA'],
      ];

      rows.forEach(([label, value]) => {
        doc
          .rect(tableX, tableY, labelWidth, rowHeight)
          .strokeColor('#e5e7eb')
          .stroke();
        doc
          .rect(tableX + labelWidth, tableY, valueWidth, rowHeight)
          .strokeColor('#e5e7eb')
          .stroke();

        doc
          .fillColor('#111827')
          .text(label, tableX + 4, tableY + 3, { width: labelWidth - 8, height: rowHeight });
        doc
          .text(value, tableX + labelWidth + 4, tableY + 3, {
            width: valueWidth - 8,
            height: rowHeight,
            align: 'left',
          });

        tableY += rowHeight;
      });

      doc.moveTo(tableX, tableY).moveDown(1.5);

      doc
        .moveDown(0.5)
        .fontSize(12)
        .font(FONT_BOLD)
        .fillColor('#111827')
        .text('Feedback Summary', { align: 'left' });

      doc.moveDown(0.5);
      doc.fontSize(10).font(FONT_REGULAR).fillColor('#111827');
      doc.text(s.summary, {
        align: 'left',
        lineGap: 2,
      });
    });

    doc.end();
  });
}

