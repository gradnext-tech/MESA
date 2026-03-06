import nodemailer from 'nodemailer';

export interface SendReportEmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS must be configured to send emails.'
    );
  }

  const secure = port === 465;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return cachedTransporter;
}

export async function sendReportEmail(payload: SendReportEmailPayload) {
  const transporter = getTransporter();
  const from =
    process.env.SMTP_FROM || `Mesa Reports <${process.env.SMTP_USER || 'no-reply@example.com'}>`;

  await transporter.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}

