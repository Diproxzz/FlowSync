import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, verifyCredentials } from "@/lib/auth/password";
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

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const credResult = await verifyCredentials(username || "Indobest", body.password);

    if (!credResult.valid) {
      recordFailedLogin(ip);
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

    resetLoginRateLimit(ip);
    const token = await createSessionToken({
      authenticated: true,
      username: credResult.username || username,
      role: credResult.role || "CLIENT",
      clientId: credResult.clientId || "indobest",
      clientName: credResult.clientName || "Indobest Kolkata",
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
