// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  maskEmail,
  encryptRecoveryEmail,
  decryptRecoveryEmail,
  generateResetToken,
  hashResetToken,
} from "@/lib/auth/crypto";
import { calculateInvoice } from "@/lib/invoices/calculations";
import { createClient } from "@/lib/clients/store";
import { getProfileRecoveryInfo } from "@/lib/auth/recovery";

const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: mockCookieGet,
    set: vi.fn(),
  }),
}));

describe("Security, Recovery Email Masking & IGST Calculations", () => {
  let origIndobestEmail: string | undefined;
  let origAdminEmail: string | undefined;

  beforeEach(() => {
    mockCookieGet.mockReset();
    origIndobestEmail = process.env.INDOBEST_RECOVERY_EMAIL;
    origAdminEmail = process.env.ADMIN_RECOVERY_EMAIL;
  });

  afterEach(() => {
    if (origIndobestEmail === undefined) delete process.env.INDOBEST_RECOVERY_EMAIL;
    else process.env.INDOBEST_RECOVERY_EMAIL = origIndobestEmail;

    if (origAdminEmail === undefined) delete process.env.ADMIN_RECOVERY_EMAIL;
    else process.env.ADMIN_RECOVERY_EMAIL = origAdminEmail;
  });

  it("masks email local parts while preserving domain recognizability", () => {
    expect(maskEmail("sampleuser@example.com")).toBe("sa********@example.com");
    expect(maskEmail("verylonglocalpart123@example.com")).toBe(
      "ve******************@example.com"
    );
    expect(maskEmail("alice@example.org")).toBe("al****@example.org");
    expect(maskEmail("ab@x.com")).toBe("a*@x.com");
    expect(maskEmail("a@x.com")).toBe("*@x.com");
    expect(maskEmail("invalid-email")).toBe("***");
  });

  it("encrypts and decrypts recovery emails with AES-256-GCM and rejects tampering", () => {
    const email = "Recovery.User+Test@Example.COM";
    const encrypted = encryptRecoveryEmail(email);

    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted).not.toContain("recovery.user");
    expect(decryptRecoveryEmail(encrypted)).toBe("recovery.user+test@example.com");

    const parts = encrypted.split(":");
    const flippedCipher = `${parts[3].slice(0, -2)}${parts[3].endsWith("00") ? "ff" : "00"}`;
    expect(decryptRecoveryEmail(`${parts[0]}:${parts[1]}:${parts[2]}:${flippedCipher}`)).toBeNull();
  });

  it("generates unique random reset tokens and deterministic 64-hex SHA-256 hashes", () => {
    const first = generateResetToken();
    const second = generateResetToken();

    expect(first.rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rawToken).not.toBe(first.tokenHash);
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(hashResetToken(`  ${first.rawToken}  `)).toBe(first.tokenHash);
  });

  it("resolves and masks Indobest and Admin recovery emails strictly from env vars", async () => {
    process.env.INDOBEST_RECOVERY_EMAIL = "alphaowner@example.net";
    process.env.ADMIN_RECOVERY_EMAIL = "systemadmin123@example.net";

    const indoInfo = await getProfileRecoveryInfo("indobest");
    expect(indoInfo).not.toBeNull();
    expect(indoInfo?.email).toBe("alphaowner@example.net");
    expect(indoInfo?.maskedEmail).toBe("al********@example.net");

    const adminInfo = await getProfileRecoveryInfo("ADMIN");
    expect(adminInfo).not.toBeNull();
    expect(adminInfo?.email).toBe("systemadmin123@example.net");
    expect(adminInfo?.maskedEmail).toBe("sy************@example.net");

    process.env.INDOBEST_RECOVERY_EMAIL = "";
    expect(await getProfileRecoveryInfo("indobest")).toBeNull();
  });

  it("fails closed in getActiveClientContext() when unauthenticated", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const { getActiveClientContext } = await import("@/lib/auth/session");
    const ctx = await getActiveClientContext();

    expect(ctx).toEqual({
      clientId: "",
      isFoundingClient: false,
      isReadOnly: false,
      isAdmin: false,
    });
  });

  it("requires valid recoveryEmail when creating a client profile", async () => {
    await expect(
      createClient({
        name: "Acme Trading",
        username: "acmetrading",
        password: "StrongPassword123!",
        recoveryEmail: "",
      })
    ).rejects.toThrow(/recovery email/i);

    await expect(
      createClient({
        name: "Acme Trading",
        username: "acmetrading",
        password: "StrongPassword123!",
        recoveryEmail: "not-an-email",
      })
    ).rejects.toThrow(/recovery email/i);
  });

  it("computes inter-state IGST totals and preserves explicit 0% GST rate", () => {
    const igstInvoice = calculateInvoice(
      [
        {
          qty: 100,
          pack: "2 x 50Kg",
          product: "CHEMICAL X",
          hsn: "3402",
          rate: 250,
          discountPct: 0,
          gstPct: 18,
        },
      ],
      0,
      { isInterState: true }
    );

    expect(igstInvoice.isInterState).toBe(true);
    expect(igstInvoice.taxableTotal).toBe("25000.00");
    expect(igstInvoice.cgstTotal).toBe("0.00");
    expect(igstInvoice.sgstTotal).toBe("0.00");
    expect(igstInvoice.igstTotal).toBe("4500.00");
    expect(igstInvoice.igstRatePct).toBe("18 %");
    expect(igstInvoice.grandTotal).toBe("29500.00");
    expect(igstInvoice.gstSummaryLine).toContain("4500.00IGST");

    const zeroGstInvoice = calculateInvoice([
      {
        qty: 10,
        pack: "1 x 10Kg",
        product: "EXEMPT ITEM",
        hsn: "3402",
        rate: 100,
        discountPct: 0,
        gstPct: 0,
      },
    ]);

    expect(zeroGstInvoice.cgstTotal).toBe("0.00");
    expect(zeroGstInvoice.sgstTotal).toBe("0.00");
    expect(zeroGstInvoice.igstTotal).toBe("0.00");
    expect(zeroGstInvoice.grandTotal).toBe("1000.00");
  });
});
