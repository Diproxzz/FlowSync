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

interface EmailDispatchPayload {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
  attachment?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  };
  smtpFallback: {
    host: string;
    preferredPort: number;
    user: string;
    pass: string;
  };
}

async function sendViaBrevo(apiKey: string, payload: EmailDispatchPayload): Promise<void> {
  const body: any = {
    sender: { name: payload.fromName, email: payload.fromEmail },
    to: [{ email: payload.toEmail, name: payload.toName || payload.toEmail }],
    subject: payload.subject,
    htmlContent: payload.html,
    textContent: payload.text,
  };

  if (payload.attachment) {
    body.attachment = [
      {
        name: payload.attachment.filename,
        content: payload.attachment.content.toString("base64"),
      },
    ];
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey.trim(),
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Brevo HTTPS API error (${response.status}): ${errorDetails}`);
  }
}

async function sendViaResend(apiKey: string, payload: EmailDispatchPayload): Promise<void> {
  const from = payload.fromName
    ? `${payload.fromName} <${payload.fromEmail}>`
    : payload.fromEmail;

  const body: any = {
    from,
    to: [payload.toEmail],
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  };

  if (payload.attachment) {
    body.attachments = [
      {
        filename: payload.attachment.filename,
        content: payload.attachment.content.toString("base64"),
      },
    ];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Resend HTTPS API error (${response.status}): ${errorDetails}`);
  }
}

async function sendViaGoogleAppsScript(bridgeUrl: string, payload: EmailDispatchPayload): Promise<void> {
  const requestBody = {
    to: payload.toEmail,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    fromName: payload.fromName,
    attachments: payload.attachment
      ? [
          {
            filename: payload.attachment.filename,
            base64: payload.attachment.content.toString("base64"),
            mimeType: payload.attachment.contentType || "application/pdf",
          },
        ]
      : [],
  };

  const response = await fetch(bridgeUrl.trim(), {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Google Apps Script Bridge error (${response.status}): ${errorDetails}`);
  }

  const resultText = await response.text();
  try {
    const json = JSON.parse(resultText);
    if (json.error) {
      throw new Error(`Google Apps Script error: ${json.error}`);
    }
  } catch (err: any) {
    if (err.message.includes("Google Apps Script error:")) {
      throw err;
    }
  }
}

async function dispatchEmail(payload: EmailDispatchPayload): Promise<void> {
  const gasBridgeUrl = (
    process.env.GMAIL_HTTP_BRIDGE_URL ||
    process.env.EMAIL_HTTP_BRIDGE_URL ||
    ""
  ).trim();
  const brevoKey = (process.env.BREVO_API_KEY || "").trim();
  const resendKey = (process.env.RESEND_API_KEY || "").trim();

  // 1. Try Google Apps Script HTTP Bridge if provided (100% Free, sends from your Gmail, Port 443)
  if (gasBridgeUrl) {
    try {
      await sendViaGoogleAppsScript(gasBridgeUrl, payload);
      return;
    } catch (err: any) {
      console.warn(`[Email] Google Apps Script HTTP bridge failed (${err.message}). Trying fallback transport...`);
    }
  }

  // 2. Try Brevo HTTPS API if key is provided (Port 443, never blocked by Railway)
  if (brevoKey) {
    try {
      await sendViaBrevo(brevoKey, payload);
      return;
    } catch (err: any) {
      console.warn(`[Email] Brevo HTTPS dispatch failed (${err.message}). Trying fallback transport...`);
    }
  }

  // 3. Try Resend HTTPS API if key is provided (Port 443, never blocked by Railway)
  if (resendKey) {
    try {
      await sendViaResend(resendKey, payload);
      return;
    } catch (err: any) {
      console.warn(`[Email] Resend HTTPS dispatch failed (${err.message}). Trying fallback transport...`);
    }
  }

  // 3. Fallback to direct SMTP (ports 587 / 465)
  await sendMailWithTransportFallback({
    host: payload.smtpFallback.host,
    preferredPort: payload.smtpFallback.preferredPort,
    user: payload.smtpFallback.user,
    pass: payload.smtpFallback.pass,
    mailOptions: {
      from: `${payload.fromName} <${payload.fromEmail}>`,
      to: payload.toEmail,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments: payload.attachment
        ? [
            {
              filename: payload.attachment.filename,
              content: payload.attachment.content,
              contentType: payload.attachment.contentType || "application/pdf",
            },
          ]
        : undefined,
    },
  });
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
        family: 4, // Explicitly force IPv4 to prevent IPv6 connection timeouts on cloud platforms
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

  if (lastError?.code === "ETIMEDOUT" || lastError?.message?.includes("timeout")) {
    console.error(
      `[SMTP] Outbound connection timed out. Railway blocks outbound SMTP ports (465, 587, 25) on Hobby/Personal plans. To deliver email from Railway, upgrade to the Pro plan or configure an HTTPS provider like BREVO_API_KEY or RESEND_API_KEY.`
    );
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

  await dispatchEmail({
    fromEmail: smtpUser,
    fromName: "FlowPilot Security",
    toEmail: params.to,
    toName: params.displayName,
    subject,
    text: textBody,
    html: htmlBody,
    smtpFallback: {
      host: smtpHost,
      preferredPort: smtpPort,
      user: smtpUser,
      pass: cleanPass,
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
    `Please find attached your updated Statement of Account from Indobest. The current Total Due is ${params.totalDueFormatted}.`,
    ``,
    `Kindly review and arrange for clearance at your earliest convenience.`,
    ``,
    `Regards,`,
    `Indobest`,
  ].join("\n");

  const safeCustomerName = escapeHtml(params.customerName);
  const safeDue = escapeHtml(params.totalDueFormatted);

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #1e293b;">
        Dear <strong>${safeCustomerName}</strong>,
      </p>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #1e293b;">
        Please find attached your updated Statement of Account from Indobest. The current Total Due is <strong>${safeDue}</strong>.
      </p>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #1e293b;">
        Kindly review and arrange for clearance at your earliest convenience.
      </p>
      <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #1e293b;">
        Regards,<br />
        <strong>Indobest</strong>
      </p>
    </div>
  `;

  await dispatchEmail({
    fromEmail: senderEmail,
    fromName: "Indobest",
    toEmail: params.to,
    toName: params.customerName,
    subject,
    text: textBody,
    html: htmlBody,
    attachment: {
      filename: params.pdfFilename,
      content: params.pdfBuffer,
      contentType: "application/pdf",
    },
    smtpFallback: {
      host: smtpHost,
      preferredPort: smtpPort,
      user: smtpUser,
      pass: cleanPass,
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
