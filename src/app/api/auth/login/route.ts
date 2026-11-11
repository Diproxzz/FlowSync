export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import {
  getClientIp,
  checkRateLimitAsync,
  recordFailedAttemptAsync,
  resetRateLimitAsync,
} from "@/lib/auth/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.password !== "string" || !body.password.trim()) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Password is required",
          },
        },
        { status: 400 }
      );
    }

    const username =
      typeof body.username === "string" && body.username.trim()
        ? body.username.trim()
        : "Indobest";
    const ipKey = `login:ip:${ip}`;
    const userKey = `login:user:${username.toLowerCase()}`;

    const [ipRate, userRate] = await Promise.all([
      checkRateLimitAsync(ipKey, 5, 5 * 60 * 1000),
      checkRateLimitAsync(userKey, 8, 5 * 60 * 1000),
    ]);

    if (!ipRate.allowed || !userRate.allowed) {
      const retryAfter = Math.max(
        ipRate.retryAfterSeconds || 0,
        userRate.retryAfterSeconds || 0
      );
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many failed login attempts. Please try again in ${retryAfter} seconds.`,
          },
        },
        { status: 429 }
      );
    }

    const credResult = await verifyCredentials(username, body.password);

    if (!credResult.valid) {
      await Promise.all([
        recordFailedAttemptAsync(ipKey, 5 * 60 * 1000),
        recordFailedAttemptAsync(userKey, 5 * 60 * 1000),
      ]);
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: credResult.reason || "Incorrect username or password",
          },
        },
        { status: 401 }
      );
    }

    await Promise.all([
      resetRateLimitAsync(ipKey),
      resetRateLimitAsync(userKey),
    ]);

    const token = await createSessionToken({
      authenticated: true,
      username: credResult.username || username,
      role: credResult.role || "CLIENT",
      clientId: credResult.clientId || "indobest",
      clientName: credResult.clientName || "Indobest",
      isReadOnly: false,
    });
    setSessionCookie(token);

    const redirectUrl = credResult.role === "ADMIN" ? "/admin" : "/dashboard";

    return NextResponse.json({
      success: true,
      message: "Logged in successfully",
      role: credResult.role,
      redirectUrl,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred during login",
        },
      },
      { status: 500 }
    );
  }
}
