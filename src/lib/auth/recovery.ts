import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import {
  getClientByUsername,
  updateClientPasswordHash,
} from "@/lib/clients/store";
import { decryptRecoveryEmail, maskEmail } from "@/lib/auth/crypto";

export interface ProfileRecoveryInfo {
  username: string;
  clientId: string;
  displayName: string;
  email: string;
  maskedEmail: string;
}

function getOverrideKey(username: string): string | null {
  const lower = username.trim().toLowerCase();
  const configuredUser = (process.env.APP_USERNAME || env.APP_USERNAME || "Indobest")
    .trim()
    .toLowerCase();

  if (lower === "admin") return "auth_override_admin";
  if (lower === "indobest" || lower === configuredUser) return "auth_override_indobest";
  return null;
}

export async function getPasswordOverrideHash(username: string): Promise<string | null> {
  const key = getOverrideKey(username);
  if (!key) return null;
  try {
    const record = await prisma.setting.findUnique({ where: { key } });
    const hash = (record?.value as any)?.passwordHash;
    return typeof hash === "string" && hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

export async function setProfilePasswordHash(username: string, newHash: string): Promise<boolean> {
  const overrideKey = getOverrideKey(username);
  if (overrideKey) {
    await prisma.setting.upsert({
      where: { key: overrideKey },
      update: {
        value: { passwordHash: newHash, updatedAt: new Date().toISOString() },
      },
      create: {
        key: overrideKey,
        value: { passwordHash: newHash, updatedAt: new Date().toISOString() },
      },
    });
    return true;
  }

  return await updateClientPasswordHash(username, newHash);
}

/**
 * Resolves the recovery email configuration for a profile strictly from environment variables
 * (for admin & indobest) or AES-256-GCM encrypted client registry storage (for dynamic clients).
 * Never hardcodes recovery email addresses in source code.
 */
export async function getProfileRecoveryInfo(
  username: string
): Promise<ProfileRecoveryInfo | null> {
  const clean = (username || "").trim();
  if (!clean) return null;

  const lower = clean.toLowerCase();
  const configuredUser = (process.env.APP_USERNAME || env.APP_USERNAME || "Indobest")
    .trim()
    .toLowerCase();

  if (lower === "admin") {
    const email = (process.env.ADMIN_RECOVERY_EMAIL ?? env.ADMIN_RECOVERY_EMAIL ?? "")
      .trim()
      .toLowerCase();
    if (!email) return null;
    return {
      username: "admin",
      clientId: "admin",
      displayName: "Administrator",
      email,
      maskedEmail: maskEmail(email),
    };
  }

  if (lower === "indobest" || lower === configuredUser) {
    const email = (
      process.env.INDOBEST_RECOVERY_EMAIL ??
      env.INDOBEST_RECOVERY_EMAIL ??
      ""
    )
      .trim()
      .toLowerCase();
    if (!email) return null;
    return {
      username: "Indobest",
      clientId: "indobest",
      displayName: "Indobest",
      email,
      maskedEmail: maskEmail(email),
    };
  }

  const client = await getClientByUsername(clean);
  if (!client || client.status !== "ACTIVE") {
    return null;
  }

  const decrypted = client.recoveryEmailEncrypted
    ? decryptRecoveryEmail(client.recoveryEmailEncrypted)
    : null;
  if (!decrypted) return null;

  return {
    username: client.username,
    clientId: client.id,
    displayName: client.name,
    email: decrypted,
    maskedEmail: client.recoveryEmailMasked || maskEmail(decrypted),
  };
}
