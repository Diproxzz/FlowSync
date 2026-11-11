import crypto from "crypto";
import { DEV_SESSION_SECRET } from "./constants";

/**
 * Constant-time string comparison via SHA-256 digests so lengths never leak via timing.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
}

/**
 * Masks an email address while preserving minimal recognizable hints.
 * Examples:
 * - "indobest@gmail.com" -> "in******@gmail.com"
 * - "diprochowdhury123@gmail.com" -> "di***************@gmail.com"
 */
export function maskEmail(email: string): string {
  const trimmed = (email || "").trim();
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx <= 0) return "***";

  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);

  let maskedLocal: string;
  if (local.length <= 1) {
    maskedLocal = "*";
  } else if (local.length === 2) {
    maskedLocal = `${local[0]}*`;
  } else {
    const starCount = Math.max(4, local.length - 2);
    maskedLocal = `${local.slice(0, 2)}${"*".repeat(starCount)}`;
  }

  return `${maskedLocal}@${domain}`;
}

function getRecoveryEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || DEV_SESSION_SECRET;
  return crypto
    .createHash("sha256")
    .update(`${secret}:recovery_email_v1`, "utf8")
    .digest();
}

export function encryptRecoveryEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  const key = getRecoveryEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptRecoveryEmail(payload: string): string | null {
  try {
    const parts = (payload || "").split(":");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    const iv = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");
    const encrypted = Buffer.from(parts[3], "hex");
    const key = getRecoveryEncryptionKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim(), "utf8").digest("hex");
}

export function generateResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  return { rawToken, tokenHash };
}
