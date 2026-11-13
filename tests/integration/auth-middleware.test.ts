// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { verifyPassword, verifyUsername, verifyCredentials } from "@/lib/auth/password";
import * as recoveryModule from "@/lib/auth/recovery";
import { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from "@/lib/auth/rateLimit";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

describe("Phase 2: Auth and Session Tests", () => {
  const testIndobestPass = `test-indo-${crypto.randomUUID()}`;
  const testAdminPass = `test-admin-${crypto.randomUUID()}`;
  let origAppHash: string | undefined;
  let origAdminHash: string | undefined;
  let origAppUser: string | undefined;

  beforeAll(() => {
    origAppHash = process.env.APP_PASSWORD_HASH;
    origAdminHash = process.env.ADMIN_PASSWORD_HASH;
    origAppUser = process.env.APP_USERNAME;

    process.env.APP_USERNAME = "Indobest";
    process.env.APP_PASSWORD_HASH = bcrypt.hashSync(testIndobestPass, 4);
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(testAdminPass, 4);
    vi.spyOn(recoveryModule, "getPasswordOverrideHash").mockResolvedValue(null);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    if (origAppHash === undefined) delete process.env.APP_PASSWORD_HASH;
    else process.env.APP_PASSWORD_HASH = origAppHash;

    if (origAdminHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = origAdminHash;

    if (origAppUser === undefined) delete process.env.APP_USERNAME;
    else process.env.APP_USERNAME = origAppUser;
  });

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

  it("should verify correct password against configured APP_PASSWORD_HASH and ADMIN_PASSWORD_HASH", async () => {
    const isCorrectIndobest = await verifyPassword(testIndobestPass);
    expect(isCorrectIndobest).toBe(true);

    const isCorrectAdmin = await verifyPassword(testAdminPass);
    expect(isCorrectAdmin).toBe(true);

    const isWrong = await verifyPassword("wrongpassword");
    expect(isWrong).toBe(false);
  });

  it("should verify Indobest and Admin credentials dynamically without hardcoded fallbacks", async () => {
    expect(verifyUsername("Indobest")).toBe(true);
    expect(verifyUsername("indobest")).toBe(true);
    expect(verifyUsername("INDOBEST")).toBe(true);
    expect(verifyUsername("admin")).toBe(true);
    expect(verifyUsername("wronguser")).toBe(false);

    const validCreds = await verifyCredentials("Indobest", testIndobestPass);
    expect(validCreds.valid).toBe(true);
    expect(validCreds.clientId).toBe("indobest");

    const validAdmin = await verifyCredentials("admin", testAdminPass);
    expect(validAdmin.valid).toBe(true);
    expect(validAdmin.role).toBe("ADMIN");

    const invalidUser = await verifyCredentials("randomUser", testIndobestPass);
    expect(invalidUser.valid).toBe(false);

    const invalidPass = await verifyCredentials("Indobest", "wrongpass");
    expect(invalidPass.valid).toBe(false);
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
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?next=%2Fdashboard");
  });

  it("should allow public access to login and password reset routes", async () => {
    for (const p of [
      "/login",
      "/reset-password",
      "/api/auth/login",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
    ]) {
      const req = new NextRequest(`http://localhost:3000${p}`);
      const res = await middleware(req);
      expect(res.status).toBe(200);
    }
  });

  it("should enforce admin and tenant isolation in middleware", async () => {
    const indobestToken = await createSessionToken("Indobest");
    const reqAdminApi = new NextRequest("http://localhost:3000/api/admin/clients", {
      headers: { cookie: `indobest_session=${indobestToken}` },
    });
    const resAdminApi = await middleware(reqAdminApi);
    expect(resAdminApi.status).toBe(403);

    const isolatedToken = await createSessionToken({
      username: "isolated_demo",
      role: "CLIENT",
      clientId: "client_demo_1",
      clientName: "Isolated Demo",
    });
    const reqIsolatedMutation = new NextRequest("http://localhost:3000/api/invoices", {
      method: "POST",
      headers: { cookie: `indobest_session=${isolatedToken}` },
    });
    const resIsolatedMutation = await middleware(reqIsolatedMutation);
    expect(resIsolatedMutation.status).toBe(403);
  });

  it("should allow access when authenticated with Indobest session token", async () => {
    const validToken = await createSessionToken("Indobest");
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: `indobest_session=${validToken}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it("should reject cross-origin mutating API requests with mismatched Origin header", async () => {
    const validToken = await createSessionToken("Indobest");
    const reqMismatchedOrigin = new NextRequest("https://flowpilot.up.railway.app/api/invoices", {
      method: "POST",
      headers: {
        cookie: `indobest_session=${validToken}`,
        origin: "https://malicious-site.com",
        host: "flowpilot.up.railway.app",
      },
    });
    const res = await middleware(reqMismatchedOrigin);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN_CSRF");
  });

  it("should allow same-origin mutating API requests with matching Origin header", async () => {
    const validToken = await createSessionToken("Indobest");
    const reqMatchingOrigin = new NextRequest("https://flowpilot.up.railway.app/api/invoices", {
      method: "POST",
      headers: {
        cookie: `indobest_session=${validToken}`,
        origin: "https://flowpilot.up.railway.app",
        host: "flowpilot.up.railway.app",
      },
    });
    const res = await middleware(reqMatchingOrigin);
    // In middleware, an authenticated Indobest session for /api/invoices proceeds to route handler (NextResponse.next -> status 200)
    expect(res.status).toBe(200);
  });

  it("should redirect unauthenticated root / visits to /login", async () => {
    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
