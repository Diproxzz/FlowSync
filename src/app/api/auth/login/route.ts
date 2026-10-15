import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from "@/lib/auth/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const ip = request.ip || request.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateCheck = checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Too many failed login attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
          },
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.password !== "string") {
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

    const isValid = await verifyPassword(body.password);
    if (!isValid) {
      recordFailedLogin(ip);
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Incorrect password",
          },
        },
        { status: 401 }
      );
    }

    resetLoginRateLimit(ip);
    const token = await createSessionToken();
    setSessionCookie(token);

    return NextResponse.json({ success: true, message: "Logged in successfully" });
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
