export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashResetToken } from "@/lib/auth/crypto";
import {
  getProfileRecoveryInfo,
  setProfilePasswordHash,
} from "@/lib/auth/recovery";
import {
  getClientIp,
  checkRateLimitAsync,
  recordFailedAttemptAsync,
  resetRateLimitAsync,
} from "@/lib/auth/rateLimit";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    if (!token) {
      return NextResponse.json(
        {
          valid: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Password reset token is required.",
          },
        },
        { status: 400 }
      );
    }

    const tokenHash = hashResetToken(token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!record || record.used_at !== null || record.expires_at < new Date()) {
      return NextResponse.json(
        {
          valid: false,
          error: {
            code: "INVALID_OR_EXPIRED_TOKEN",
            message:
              "This password reset link is invalid or has already expired.",
          },
        },
        { status: 400 }
      );
    }

    const info = await getProfileRecoveryInfo(record.username);
    return NextResponse.json({
      valid: true,
      username: info?.username || record.username,
      displayName: info?.displayName || record.username,
      maskedEmail: info?.maskedEmail || null,
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    return NextResponse.json(
      {
        valid: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to verify password reset token.",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const windowMs = 15 * 60 * 1000;
    const rate = await checkRateLimitAsync(`reset:ip:${ip}`, 10, windowMs);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many reset attempts. Please try again in ${rate.retryAfterSeconds} seconds.`,
          },
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!token) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TOKEN",
            message: "Password reset token is missing.",
          },
        },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        {
          error: {
            code: "WEAK_PASSWORD",
            message: "New password must be at least 8 characters long.",
          },
        },
        { status: 400 }
      );
    }

    const tokenHash = hashResetToken(token);
    const now = new Date();
    const record = await prisma.passwordResetToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!record || record.used_at !== null || record.expires_at < now) {
      await recordFailedAttemptAsync(`reset:ip:${ip}`, windowMs);
      return NextResponse.json(
        {
          error: {
            code: "INVALID_OR_EXPIRED_TOKEN",
            message:
              "This password reset link is invalid, expired, or has already been used.",
          },
        },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    // Atomically consume this token and revoke any remaining open tokens for the user
    const consumed = await prisma.passwordResetToken.updateMany({
      where: {
        id: record.id,
        used_at: null,
        expires_at: { gte: now },
      },
      data: { used_at: now },
    });

    if (consumed.count === 0) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_OR_EXPIRED_TOKEN",
            message: "This password reset link has already been used or expired.",
          },
        },
        { status: 400 }
      );
    }

    const updated = await setProfilePasswordHash(record.username, newHash);
    if (!updated) {
      return NextResponse.json(
        {
          error: {
            code: "PROFILE_NOT_FOUND",
            message: "Unable to locate profile to update password.",
          },
        },
        { status: 404 }
      );
    }

    await prisma.passwordResetToken.updateMany({
      where: { username: record.username, used_at: null },
      data: { used_at: now },
    });

    await resetRateLimitAsync(`login:user:${record.username.toLowerCase()}`);

    const info = await getProfileRecoveryInfo(record.username);
    return NextResponse.json({
      success: true,
      username: info?.username || record.username,
      message:
        "Password updated successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to reset password.",
        },
      },
      { status: 500 }
    );
  }
}
