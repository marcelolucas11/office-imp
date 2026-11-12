import nodemailer from 'nodemailer';
import { getSmtp, type SmtpSettings } from './settings';

export interface MailInput {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string | Buffer }[];
}

/** Em testes, capture os e-mails em vez de enviar. */
export const testOutbox: MailInput[] = [];
let testMode = false;
export function setMailTestMode(on: boolean) {
  testMode = on;
  testOutbox.length = 0;
}

function transport(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    connectionTimeout: 15000,
  });
}

export async function sendMail(input: MailInput, smtp?: SmtpSettings | null): Promise<void> {
  if (testMode) {
    testOutbox.push(input);
    return;
  }
  const s = smtp ?? (await getSmtp());
  if (!s) throw new Error('SMTP não configurado.');
  await transport(s).sendMail({ from: s.from || s.user, to: input.to.join(', '), subject: input.subject, text: input.text, html: input.html, attachments: input.attachments });
}

export async function verifySmtp(s: SmtpSettings): Promise<void> {
  await transport(s).verify();
}
