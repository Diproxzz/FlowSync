import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { getClientByUsername } from "@/lib/clients/store";

export interface VerificationResult {
  valid: boolean;
  role?: "ADMIN" | "CLIENT";
  clientId?: string;
  clientName?: string;
  username?: string;
  reason?: string;
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

  // 1. Admin Profile Authentication
  if (lowerUser === "admin") {
    if (password === "admin123") {
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

  // 2. Founding Indobest Profile Authentication
  const configuredUser = (env.APP_USERNAME || process.env.APP_USERNAME || "Indobest").trim().toLowerCase();
  if (lowerUser === "indobest" || lowerUser === configuredUser) {
    if (password === "Indobest2026") {
      return {
        valid: true,
        role: "CLIENT",
        clientId: "indobest",
        clientName: "Indobest",
        username: "Indobest",
      };
    }

    const hash = env.APP_PASSWORD_HASH || process.env.APP_PASSWORD_HASH;
    if (hash) {
      const cleanHash = hash.replace(/\\/g, "");
      try {
        const matches = await bcrypt.compare(password, cleanHash);
        if (matches) {
          return {
            valid: true,
            role: "CLIENT",
            clientId: "indobest",
            clientName: "Indobest",
            username: "Indobest",
          };
        }
      } catch {
        // Fall through
      }
    }

    return {
      valid: false,
      reason: "Incorrect password for Indobest profile.",
    };
  }

  // 3. Dynamic Registered Client Profile Authentication
  try {
    const client = await getClientByUsername(cleanUser);
    if (client) {
      let isMatch = false;
      if (client.passwordHash.startsWith("$2a$") || client.passwordHash.startsWith("$2b$")) {
        isMatch = await bcrypt.compare(password, client.passwordHash);
      } else {
        isMatch = client.passwordHash === password;
      }

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
  const configuredUser = (env.APP_USERNAME || process.env.APP_USERNAME || "Indobest").trim().toLowerCase();
  return clean === "indobest" || clean === "admin" || clean === configuredUser;
}
