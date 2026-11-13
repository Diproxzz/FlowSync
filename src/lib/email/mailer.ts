import nodemailer, { type SendMailOptions } from "nodemailer";
import { env } from "@/lib/env";

export class SmtpNotConfiguredError extends Error {
  constructor(
    message = "Email delivery is not configured yet. Please set SMTP_USER and SMTP_PASS in the server environment."
  ) {
    super(message);
    this.name = "SmtpNotConfiguredError";
  }
}

export interface PasswordResetEmailParams {
  to: string;
  username: string;
  displayName: string;
  resetUrl: string;
  expiresMinutes: number;
}

async function sendMailWithTransportFallback(options: {
  host: string;
  preferredPort: number;
  user: string;
  pass: string;
  mailOptions: SendMailOptions;
}): Promise<void> {
  // If preferred port is 587, try [587, 465]; otherwise try [465, 587]
  const portsToTry = options.preferredPort === 587 ? [587, 465] : [465, 587];
  let lastError: any = null;

  for (const port of portsToTry) {
    try {
      const transporter = nodemailer.createTransport({
        host: options.host,
        port,
        secure: port === 465,
        auth: {
          user: options.user,
          pass: options.pass,
        },
        family: 4, // Explicitly force IPv4 to prevent IPv6 connection timeouts on cloud platforms (e.g. Railway)
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
      } as any);

      await transporter.sendMail(options.mailOptions);
      return;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[SMTP] Delivery attempt on port ${port} failed (${err.code || err.message}). Trying alternate port if available...`
      );
    }
  }

  throw lastError;
}

export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams
): Promise<void> {
  // System email credentials for password resets
  const smtpUser = (
    process.env.FLOWPILOT_SMTP_USER ||
    process.env.SMTP_USER ||
    env.SMTP_USER ||
    "flowpilot.admin@gmail.com"
  ).trim();
  const smtpPass = (
    process.env.FLOWPILOT_SMTP_PASS ||
    process.env.SMTP_PASS ||
    env.SMTP_PASS ||
    ""
  ).trim();
  const smtpHost = (process.env.SMTP_HOST || env.SMTP_HOST || "smtp.gmail.com").trim();
  const smtpPortRaw = Number(process.env.SMTP_PORT || env.SMTP_PORT || "465");
  const smtpPort = Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? smtpPortRaw : 465;
  const smtpFrom = (
    process.env.SMTP_FROM ||
    env.SMTP_FROM ||
    `FlowPilot Security <${smtpUser}>`
  ).trim();

  const cleanPass = smtpPass.replace(/\s+/g, "");

  if (!smtpUser || !cleanPass) {
    throw new SmtpNotConfiguredError(
      "Password reset email delivery is not configured yet. Please set FLOWPILOT_SMTP_PASS (or SMTP_PASS) with the App Password for flowpilot.admin@gmail.com in the server environment."
    );
  }

  const subject = `FlowPilot Password Reset (${params.username})`;
  const textBody = [
    `Hello ${params.displayName},`,
    ``,
    `A password reset was requested for the FlowPilot account "${params.username}".`,
    ``,
    `Open this one-time link within ${params.expiresMinutes} minutes to set a new password:`,
    params.resetUrl,
    ``,
    `If you did not request this password reset, you can safely ignore this email.`,
  ].join("\n");

  const safeDisplay = escapeHtml(params.displayName);
  const safeUser = escapeHtml(params.username);
  const safeUrl = escapeHtml(params.resetUrl);

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111827; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px;">
      <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #111827;">FlowPilot Password Reset</h2>
      <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #374151;">
        Hello <strong>${safeDisplay}</strong>,
      </p>
      <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: #374151;">
        A password reset was requested for username <code>${safeUser}</code>. Use the button below within <strong>${params.expiresMinutes} minutes</strong> to choose a new password.
      </p>
      <div style="margin: 24px 0;">
        <a href="${safeUrl}" style="display: inline-block; padding: 11px 20px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 6px;">
          Reset Password
        </a>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; word-break: break-all;">
        Or copy and paste this link into your browser:<br />
        <a href="${safeUrl}" style="color: #2563eb;">${safeUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="margin: 0; font-size: 12px; color: #6b7280;">
        This link can only be used once and expires automatically. If you did not initiate this request, you may ignore this message.
      </p>
    </div>
  `;

  await sendMailWithTransportFallback({
    host: smtpHost,
    preferredPort: smtpPort,
    user: smtpUser,
    pass: cleanPass,
    mailOptions: {
      from: smtpFrom,
      to: params.to,
      subject,
      text: textBody,
      html: htmlBody,
    },
  });
}

export interface CustomerStatementEmailParams {
  to: string;
  customerName: string;
  totalDueFormatted: string;
  closingBalanceNumber?: number;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

export async function sendCustomerStatementEmail(
  params: CustomerStatementEmailParams
): Promise<void> {
  // Business email credentials for Indobest customer communications
  const smtpUser = (
    process.env.INDOBEST_SMTP_USER ||
    process.env.COMPANY_SMTP_USER ||
    process.env.SMTP_USER ||
    env.SMTP_USER ||
    "indobest@gmail.com"
  ).trim();
  const smtpPass = (
    process.env.INDOBEST_SMTP_PASS ||
    process.env.COMPANY_SMTP_PASS ||
    process.env.SMTP_PASS ||
    env.SMTP_PASS ||
    ""
  ).trim();
  const smtpHost = (process.env.SMTP_HOST || env.SMTP_HOST || "smtp.gmail.com").trim();
  const smtpPortRaw = Number(process.env.SMTP_PORT || env.SMTP_PORT || "465");
  const smtpPort = Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? smtpPortRaw : 465;

  // Strict requirement: All emails to the customers will be sent from "indobest@gmail.com"
  const senderEmail = smtpUser || "indobest@gmail.com";
  const smtpFrom = `Indobest <${senderEmail}>`;

  const cleanPass = smtpPass.replace(/\s+/g, "");

  if (!smtpUser || !cleanPass) {
    throw new SmtpNotConfiguredError(
      "Indobest customer email delivery is not configured yet. Please set INDOBEST_SMTP_PASS (or SMTP_PASS) with the Google App Password for indobest@gmail.com in your .env / server environment."
    );
  }

  const subject = `Account Statement - ${params.customerName} | Balance Due: ${params.totalDueFormatted}`;

  const textBody = [
    `Dear ${params.customerName},`,
    ``,
    `Please find attached your updated statement of account from Indobest.`,
    ``,
    `Current Total Due (Closing Balance): ${params.totalDueFormatted}`,
    ``,
    `Kindly review the attached statement and arrange for the clearance of the outstanding balance at your earliest convenience.`,
    ``,
    `If payment has already been initiated, or if you have any questions or require any clarification regarding any entries, please feel free to reach out to us at 8240892993 or reply directly to this email at ${senderEmail}.`,
    ``,
    `We value your business and look forward to our continued partnership.`,
    ``,
    `Warm regards,`,
    `Indobest`,
    `19/10/2, Gobinda Khatick Road, Kolkata - 700046`,
    `Phone: 8240892993 | E-Mail: ${senderEmail}`,
  ].join("\n");

  const safeCustomerName = escapeHtml(params.customerName);
  const safeDue = escapeHtml(params.totalDueFormatted);

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px;">
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">INDOBEST</h1>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
          19/10/2, Gobinda Khatick Road, Kolkata - 700046 &bull; Phone: 8240892993 &bull; E-Mail: ${senderEmail}
        </p>
      </div>

      <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #334155;">
        Dear <strong>${safeCustomerName}</strong>,
      </p>

      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
        Please find attached your updated statement of account detailing your recent invoices, receipts, and current account position.
      </p>

      <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <div style="font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          Total Due (Closing Balance)
        </div>
        <div style="font-size: 22px; font-weight: 800; color: #b45309; font-family: monospace;">
          ${safeDue}
        </div>
        <div style="font-size: 12px; color: #78350f; margin-top: 4px;">
          Party balance pending clearance as per ledger records.
        </div>
      </div>

      <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #334155;">
        Kindly review the attached PDF statement (<strong>${escapeHtml(params.pdfFilename)}</strong>) and arrange for the settlement of the pending amount at your earliest convenience.
      </p>

      <p style="margin: 0 0 14px 0; font-size: 13px; line-height: 1.6; color: #64748b;">
        If you have already processed this payment, or if you need any clarification or reconciliation support, please do not hesitate to contact us at <strong>8240892993</strong> or reply directly to this email.
      </p>

      <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #334155;">
        Thank you for your valued partnership.
      </p>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
        <strong>Indobest Accounts Department</strong><br />
        19/10/2, Gobinda Khatick Road, Kolkata - 700046<br />
        Phone: 8240892993 | E-Mail: <a href="mailto:${senderEmail}" style="color: #2563eb; text-decoration: none;">${senderEmail}</a>
      </div>
    </div>
  `;

  await sendMailWithTransportFallback({
    host: smtpHost,
    preferredPort: smtpPort,
    user: smtpUser,
    pass: cleanPass,
    mailOptions: {
      from: smtpFrom,
      to: params.to,
      subject,
      text: textBody,
      html: htmlBody,
      attachments: [
        {
          filename: params.pdfFilename,
          content: params.pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
