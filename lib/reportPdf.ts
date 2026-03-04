import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { MentorSessionFeedbackContext, generateReportBodyWithOpenAI } from './googleDrive';
import { parseSessionDate } from '@/utils/metricsCalculator';
import { format } from 'date-fns';

function pageLeft(doc: PDFKit.PDFDocument) {
  return doc.page.margins.left;
}
function pageRight(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.right;
}
function contentWidth(doc: PDFKit.PDFDocument) {
  return pageRight(doc) - pageLeft(doc);
}

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

function fitFontSizeToWidth(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  fontName: string,
  startSize: number,
  minSize: number
) {
  let size = startSize;
  doc.font(fontName).fontSize(size);
  while (size > minSize && doc.widthOfString(text) > maxWidth) {
    size -= 1;
    doc.fontSize(size);
  }
  return size;
}

function resetCursor(doc: PDFKit.PDFDocument) {
  doc.x = pageLeft(doc);
}

function drawTopHeader(doc: PDFKit.PDFDocument, brand: string, name: string, fontBold: string) {
  const left = pageLeft(doc);
  const right = pageRight(doc);
  const y = doc.y;

  const brandSize = 20;
  const nameStartSize = 20;
  const minNameSize = 14;

  doc.fillColor('#111827').font(fontBold).fontSize(brandSize);
  doc.text(brand, left, y, { lineBreak: false });
  const brandLineHeight = doc.currentLineHeight(true);

  const maxNameWidth = Math.max(140, Math.floor(contentWidth(doc) * 0.6));
  const fittedNameSize = fitFontSizeToWidth(
    doc,
    name || '',
    maxNameWidth,
    fontBold,
    nameStartSize,
    minNameSize
  );
  doc.font(fontBold).fontSize(fittedNameSize);
  const nameWidth = doc.widthOfString(name || '');
  const nameX = Math.max(left + 140, right - nameWidth);
  doc.text(name || '', nameX, y, { lineBreak: false });
  const nameLineHeight = doc.currentLineHeight(true);

  doc.y = y + Math.max(brandLineHeight, nameLineHeight) + 8;
  resetCursor(doc);
}

function drawDivider(doc: PDFKit.PDFDocument) {
  const left = pageLeft(doc);
  const right = pageRight(doc);
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(1)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke();
  doc.moveDown(1);
  resetCursor(doc);
}

function drawRatingsTable(
  doc: PDFKit.PDFDocument,
  opts: {
    x: number;
    y: number;
    width: number;
    fontRegular: string;
    fontBold: string;
    rows: Array<[string, string]>;
  }
): number {
  const { x, y, width, fontRegular, fontBold, rows } = opts;

  const colScoreWidth = 44;
  const colLabelWidth = width - colScoreWidth;
  const rowHeight = 18;
  const border = '#d1d5db';
  const headerBg = '#f3f4f6';
  const textColor = '#111827';

  let cursorY = y;

  // Header row
  doc
    .rect(x, cursorY, width, rowHeight)
    .fillColor(headerBg)
    .fill();
  doc
    .rect(x, cursorY, width, rowHeight)
    .strokeColor(border)
    .lineWidth(1)
    .stroke();
  doc
    .moveTo(x + colLabelWidth, cursorY)
    .lineTo(x + colLabelWidth, cursorY + rowHeight)
    .strokeColor(border)
    .lineWidth(1)
    .stroke();

  doc.fillColor(textColor).font(fontBold).fontSize(10);
  doc.text('Parameter', x + 6, cursorY + 4, { width: colLabelWidth - 12, lineBreak: false });
  doc.text('Score', x + colLabelWidth + 6, cursorY + 4, {
    width: colScoreWidth - 12,
    align: 'left',
    lineBreak: false,
  });

  cursorY += rowHeight;

  doc.font(fontRegular).fontSize(10);
  rows.forEach(([label, value], idx) => {
    // Alternate row shading (subtle)
    if (idx % 2 === 0) {
      doc
        .rect(x, cursorY, width, rowHeight)
        .fillColor('#ffffff')
        .fill();
    } else {
      doc
        .rect(x, cursorY, width, rowHeight)
        .fillColor('#fafafa')
        .fill();
    }

    doc
      .rect(x, cursorY, width, rowHeight)
      .strokeColor(border)
      .lineWidth(1)
      .stroke();
    doc
      .moveTo(x + colLabelWidth, cursorY)
      .lineTo(x + colLabelWidth, cursorY + rowHeight)
      .strokeColor(border)
      .lineWidth(1)
      .stroke();

    doc.fillColor(textColor);
    doc.text(label, x + 6, cursorY + 4, { width: colLabelWidth - 12, lineBreak: false });
    doc.text(value || 'NA', x + colLabelWidth + 6, cursorY + 4, {
      width: colScoreWidth - 12,
      align: 'left',
      lineBreak: false,
    });

    cursorY += rowHeight;
  });

  // Important: drawing at absolute positions leaves doc.x wherever the last text landed.
  resetCursor(doc);
  return cursorY;
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
    drawTopHeader(doc, 'gradnext', context.menteeName || '', FONT_BOLD);
    drawDivider(doc);

    // Meta information (two columns)
    doc.fontSize(10).font(FONT_REGULAR).fillColor('#374151');
    const leftX = pageLeft(doc);
    const topY = doc.y;
    const colWidth = contentWidth(doc) / 2 - 10;

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

    const lineHeight = doc.currentLineHeight(true) + 2;
    const metaHeight = Math.max(metaLinesLeft.length, metaLinesRight.length) * lineHeight;
    doc.y = topY + metaHeight + 14;
    resetCursor(doc);

    // Performance Breakdown (left aligned for smoother flow)
    const tableWidth = Math.min(340, contentWidth(doc));
    const tableX = pageLeft(doc);
    const tableHeadingY = doc.y;

    doc.fontSize(12).font(FONT_BOLD).fillColor('#111827');
    doc.text('Performance Breakdown (Score out of 5)', tableX, tableHeadingY, {
      width: tableWidth,
      align: 'left',
    });
    doc.y = tableHeadingY + doc.currentLineHeight(true) + 6;
    resetCursor(doc);

    const rows: Array<[string, string]> = [
      ['Scoping Questions', context.ratings.scoping || 'NA'],
      ['Case Setup and Structure', context.ratings.structure || 'NA'],
      ['Communication and Confidence', context.ratings.communication || 'NA'],
      ['Business Acumen and Creativity', context.ratings.businessAcumen || 'NA'],
      ['Overall Score', context.ratings.overall || 'NA'],
    ];

    const tableBottomY = drawRatingsTable(doc, {
      x: tableX,
      y: doc.y,
      width: tableWidth,
      fontRegular: FONT_REGULAR,
      fontBold: FONT_BOLD,
      rows,
    });

    doc.y = tableBottomY + 20;
    resetCursor(doc);

    // Feedback Summary
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .fillColor('#111827')
      .text('Feedback Summary', { align: 'left' });

    doc.moveDown(0.5);
    doc.fontSize(10).font(FONT_REGULAR).fillColor('#111827');
    doc.text(openAiBody, pageLeft(doc), doc.y, {
      width: contentWidth(doc),
      align: 'left',
      lineGap: 3,
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
    drawTopHeader(doc, 'gradnext', candidateName || '', FONT_BOLD);

    doc
      .fontSize(12)
      .font(FONT_REGULAR)
      .fillColor('#4b5563')
      .text(weekLabel, { align: 'left' });

    doc.moveDown(1);
    drawDivider(doc);

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

      // Ratings table (left aligned for consistency with main report)
      const tableWidth = Math.min(340, contentWidth(doc));
      const tableX = pageLeft(doc);

      const rows: Array<[string, string]> = [
        ['Scoping Questions', c.ratings.scoping || 'NA'],
        ['Case Setup and Structure', c.ratings.structure || 'NA'],
        ['Communication and Confidence', c.ratings.communication || 'NA'],
        ['Business Acumen and Creativity', c.ratings.businessAcumen || 'NA'],
        ['Overall Score', c.ratings.overall || 'NA'],
      ];

      const tableBottomY = drawRatingsTable(doc, {
        x: tableX,
        y: doc.y,
        width: tableWidth,
        fontRegular: FONT_REGULAR,
        fontBold: FONT_BOLD,
        rows,
      });

      doc.y = tableBottomY + 14;
      resetCursor(doc);

      doc
        .moveDown(0.5)
        .fontSize(12)
        .font(FONT_BOLD)
        .fillColor('#111827')
        .text('Feedback Summary', { align: 'left' });

      doc.moveDown(0.5);
      doc.fontSize(10).font(FONT_REGULAR).fillColor('#111827');
      doc.text(s.summary, pageLeft(doc), doc.y, {
        width: contentWidth(doc),
        align: 'left',
        lineGap: 3,
      });
    });

    doc.end();
  });
}

