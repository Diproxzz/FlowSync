// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from "@/lib/auth/rateLimit";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

describe("Phase 2: Auth and Session Tests", () => {
  it("should create and verify valid JWT session token", async () => {
    const token = await createSessionToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const payload = await verifySessionToken(token);
    expect(payload).toBeDefined();
    expect(payload?.authenticated).toBe(true);
  });

  it("should reject tampered or invalid session token", async () => {
    const invalidPayload = await verifySessionToken("invalid-token-12345");
    expect(invalidPayload).toBeNull();
  });

  it("should verify correct password against APP_PASSWORD_HASH", async () => {
    // In our .env APP_PASSWORD_HASH was set for "admin123"
    const isCorrect = await verifyPassword("admin123");
    expect(isCorrect).toBe(true);

    const isWrong = await verifyPassword("wrongpassword");
    expect(isWrong).toBe(false);
  });

  it("should rate limit after 5 failed login attempts from same IP", () => {
    const testIp = "192.168.1.100";
    resetLoginRateLimit(testIp);

    // Initial check: allowed
    let check = checkLoginRateLimit(testIp);
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(5);

    // Record 5 failed attempts
    for (let i = 0; i < 5; i++) {
      recordFailedLogin(testIp);
    }

    // Now should be rate limited
    check = checkLoginRateLimit(testIp);
    expect(check.allowed).toBe(false);
    expect(check.remaining).toBe(0);
    expect(check.retryAfterSeconds).toBeGreaterThan(0);

    // Clean up
    resetLoginRateLimit(testIp);
  });

  it("should return 401 for unauthenticated API requests in middleware", async () => {
    const req = new NextRequest("http://localhost:3000/api/invoices");
    const res = await middleware(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("should redirect to /login for unauthenticated page visits", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard");
    const res = await middleware(req);
    expect(res.status).toBe(307); // Next.js temporary redirect
    expect(res.headers.get("location")).toContain("/login?next=%2Fdashboard");
  });

  it("should allow public access to /login and /api/auth/login", async () => {
    const loginReq = new NextRequest("http://localhost:3000/login");
    const loginRes = await middleware(loginReq);
    expect(loginRes.status).toBe(200);

    const apiLoginReq = new NextRequest("http://localhost:3000/api/auth/login");
    const apiLoginRes = await middleware(apiLoginReq);
    expect(apiLoginRes.status).toBe(200);
  });
});
