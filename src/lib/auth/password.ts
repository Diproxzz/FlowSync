import bcrypt from "bcryptjs";
import { env } from "@/lib/env";

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = env.APP_PASSWORD_HASH || process.env.APP_PASSWORD_HASH;
  if (!hash) {
    console.error("APP_PASSWORD_HASH is not set in environment.");
    return false;
  }
  let cleanHash = hash.replace(/\\/g, "");
  return await bcrypt.compare(password, cleanHash);
}
