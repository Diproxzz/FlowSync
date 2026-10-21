import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const COOKIE_NAME = "indobest_session";
export const SESSION_VERSION = "indobest_v2";

const SECRET_KEY = new TextEncoder().encode(env.SESSION_SECRET + "_" + SESSION_VERSION);

export interface SessionPayload {
  authenticated: boolean;
  username: string;
  createdAt: number;
}

export async function createSessionToken(username: string = "Indobest"): Promise<string> {
  return await new SignJWT({ authenticated: true, username, createdAt: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET_KEY);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    const session = payload as unknown as SessionPayload;
    if (!session || !session.authenticated) {
      return null;
    }
    // Enforce that session belongs to authorized profile
    if (!session.username || (session.username.toLowerCase() !== "indobest" && session.username.toLowerCase() !== "admin")) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

export function setSessionCookie(token: string) {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}
