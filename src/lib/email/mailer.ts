import nodemailer from "nodemailer";
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

export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams
): Promise<void> {
  const smtpUser = (process.env.SMTP_USER || env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || env.SMTP_PASS || "").trim();
  const smtpHost = (process.env.SMTP_HOST || env.SMTP_HOST || "smtp.gmail.com").trim();
  const smtpPortRaw = Number(process.env.SMTP_PORT || env.SMTP_PORT || "465");
  const smtpPort = Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? smtpPortRaw : 465;
  const smtpFrom = (
    process.env.SMTP_FROM ||
    env.SMTP_FROM ||
    `FlowPilot Security <${smtpUser}>`
  ).trim();

  if (!smtpUser || !smtpPass) {
    throw new SmtpNotConfiguredError();
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

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

  await transporter.sendMail({
    from: smtpFrom,
    to: params.to,
    subject,
    text: textBody,
    html: htmlBody,
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
