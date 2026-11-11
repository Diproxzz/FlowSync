export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { generateResetToken } from "@/lib/auth/crypto";
import { getProfileRecoveryInfo } from "@/lib/auth/recovery";
import {
  getClientIp,
  checkRateLimitAsync,
  recordFailedAttemptAsync,
} from "@/lib/auth/rateLimit";
import {
  sendPasswordResetEmail,
  SmtpNotConfiguredError,
} from "@/lib/email/mailer";

const RESET_TOKEN_TTL_MINUTES = 20;

function resolveAppBaseUrl(request: NextRequest): string {
  const configured = (process.env.APP_URL || env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;

  const protoHeader = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const hostHeader = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  )
    .split(",")[0]
    ?.trim();

  if (hostHeader && /^[a-zA-Z0-9.-]+(:\d+)?$/.test(hostHeader)) {
    const proto =
      protoHeader === "http" || protoHeader === "https"
        ? protoHeader
        : process.env.NODE_ENV === "production"
        ? "https"
        : "http";
    return `${proto}://${hostHeader}`;
  }

  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const body = await request.json().catch(() => null);
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";

    if (!username) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Username is required to send a password reset link.",
          },
        },
        { status: 400 }
      );
    }

    const windowMs = 15 * 60 * 1000;
    const ipRate = await checkRateLimitAsync(`forgot:ip:${ip}`, 5, windowMs);
    if (!ipRate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many password reset requests. Please try again in ${ipRate.retryAfterSeconds} seconds.`,
          },
        },
        { status: 429 }
      );
    }

    const userKey = `forgot:user:${username.toLowerCase()}`;
    const userRate = await checkRateLimitAsync(userKey, 5, windowMs);
    if (!userRate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many password reset requests for this profile. Please try again in ${userRate.retryAfterSeconds} seconds.`,
          },
        },
        { status: 429 }
      );
    }

    await recordFailedAttemptAsync(`forgot:ip:${ip}`, windowMs);
    await recordFailedAttemptAsync(userKey, windowMs);

    const smtpUser = (process.env.SMTP_USER || env.SMTP_USER || "").trim();
    const smtpPass = (process.env.SMTP_PASS || env.SMTP_PASS || "").trim();
    if (!smtpUser || !smtpPass) {
      return NextResponse.json(
        {
          error: {
            code: "SMTP_NOT_CONFIGURED",
            message:
              "Password reset email delivery is not configured yet on the server (SMTP_USER / SMTP_PASS missing).",
          },
        },
        { status: 503 }
      );
    }

    const recoveryInfo = await getProfileRecoveryInfo(username);
    if (!recoveryInfo) {
      return NextResponse.json({
        success: true,
        message:
          "If a matching profile with a configured recovery email exists, a password reset link has been sent.",
      });
    }

    const normalizedUser = recoveryInfo.username.toLowerCase();
    const { rawToken, tokenHash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.updateMany({
      where: { username: normalizedUser, used_at: null },
      data: { used_at: new Date() },
    });

    const createdToken = await prisma.passwordResetToken.create({
      data: {
        username: normalizedUser,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    const baseUrl = resolveAppBaseUrl(request);
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    try {
      await sendPasswordResetEmail({
        to: recoveryInfo.email,
        username: recoveryInfo.username,
        displayName: recoveryInfo.displayName,
        resetUrl,
        expiresMinutes: RESET_TOKEN_TTL_MINUTES,
      });
    } catch (mailError) {
      await prisma.passwordResetToken
        .delete({ where: { id: createdToken.id } })
        .catch(() => {});

      if (mailError instanceof SmtpNotConfiguredError) {
        return NextResponse.json(
          {
            error: {
              code: "SMTP_NOT_CONFIGURED",
              message: mailError.message,
            },
          },
          { status: 503 }
        );
      }

      console.error("Failed to dispatch password reset email:", mailError);
      return NextResponse.json(
        {
          error: {
            code: "EMAIL_SEND_FAILED",
            message:
              "Unable to send password reset email right now. Please verify SMTP settings or try again later.",
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      maskedEmail: recoveryInfo.maskedEmail,
      expiresMinutes: RESET_TOKEN_TTL_MINUTES,
      message: `Password reset link sent to ${recoveryInfo.maskedEmail}. The link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to process password reset request.",
        },
      },
      { status: 500 }
    );
  }
}
