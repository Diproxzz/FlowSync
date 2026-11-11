import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { getClientByUsername } from "@/lib/clients/store";
import { getPasswordOverrideHash } from "@/lib/auth/recovery";

export interface VerificationResult {
  valid: boolean;
  role?: "ADMIN" | "CLIENT";
  clientId?: string;
  clientName?: string;
  username?: string;
  reason?: string;
}

async function matchesBcryptHash(password: string, hash: string): Promise<boolean> {
  const cleanHash = (hash || "").replace(/\\/g, "").trim();
  if (!cleanHash || (!cleanHash.startsWith("$2a$") && !cleanHash.startsWith("$2b$") && !cleanHash.startsWith("$2y$"))) {
    return false;
  }
  try {
    return await bcrypt.compare(password, cleanHash);
  } catch {
    return false;
  }
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<VerificationResult> {
  if (!username || typeof username !== "string") {
    return { valid: false, reason: "Username is required" };
  }
  if (!password || typeof password !== "string") {
    return { valid: false, reason: "Password is required" };
  }

  const cleanUser = username.trim();
  const lowerUser = cleanUser.toLowerCase();

  // 1. Admin Profile Authentication (DB password-reset override first, then env hash)
  if (lowerUser === "admin") {
    const overrideHash = await getPasswordOverrideHash("admin");
    const envAdminHash = (process.env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD_HASH || "").trim();
    const effectiveHash = overrideHash || envAdminHash;

    if (!effectiveHash) {
      return {
        valid: false,
        reason:
          "Administrator password is not configured. Use Reset Password with your recovery email or set ADMIN_PASSWORD_HASH.",
      };
    }

    const isMatch = await matchesBcryptHash(password, effectiveHash);
    if (isMatch) {
      return {
        valid: true,
        role: "ADMIN",
        clientId: "admin",
        clientName: "Administrator",
        username: "admin",
      };
    }

    return {
      valid: false,
      reason: "Incorrect password for administrator profile.",
    };
  }

  // 2. Founding Indobest Profile Authentication (DB password-reset override first, then APP_PASSWORD_HASH)
  const configuredUser = (process.env.APP_USERNAME || env.APP_USERNAME || "Indobest")
    .trim()
    .toLowerCase();
  if (lowerUser === "indobest" || lowerUser === configuredUser) {
    const overrideHash = await getPasswordOverrideHash("indobest");
    const envHash = (process.env.APP_PASSWORD_HASH || env.APP_PASSWORD_HASH || "").trim();
    const effectiveHash = overrideHash || envHash;

    if (!effectiveHash) {
      return {
        valid: false,
        reason:
          "Indobest password is not configured. Use Reset Password with your recovery email or set APP_PASSWORD_HASH.",
      };
    }

    const matches = await matchesBcryptHash(password, effectiveHash);
    if (matches) {
      return {
        valid: true,
        role: "CLIENT",
        clientId: "indobest",
        clientName: "Indobest",
        username: "Indobest",
      };
    }

    return {
      valid: false,
      reason: "Incorrect password for Indobest profile.",
    };
  }

  // 3. Dynamic Registered Client Profile Authentication (strictly bcrypt hash & active status)
  try {
    const client = await getClientByUsername(cleanUser);
    if (client) {
      if (client.status !== "ACTIVE") {
        return {
          valid: false,
          reason: `Client profile '${client.name}' is currently inactive.`,
        };
      }

      const isMatch = await matchesBcryptHash(password, client.passwordHash);
      if (isMatch) {
        return {
          valid: true,
          role: "CLIENT",
          clientId: client.id,
          clientName: client.name,
          username: client.username,
        };
      }

      return {
        valid: false,
        reason: `Incorrect password for client '${client.name}'.`,
      };
    }
  } catch (err) {
    console.error("Error verifying dynamic client:", err);
  }

  return {
    valid: false,
    reason: "Invalid username. Please enter an authorized profile username.",
  };
}

export async function verifyPassword(password: string): Promise<boolean> {
  const adminRes = await verifyCredentials("admin", password);
  if (adminRes.valid) return true;
  const indoRes = await verifyCredentials("Indobest", password);
  return indoRes.valid;
}

export function verifyUsername(username: string): boolean {
  if (!username || typeof username !== "string") return false;
  const clean = username.trim().toLowerCase();
  const configuredUser = (process.env.APP_USERNAME || env.APP_USERNAME || "Indobest")
    .trim()
    .toLowerCase();
  return clean === "indobest" || clean === "admin" || clean === configuredUser;
}
