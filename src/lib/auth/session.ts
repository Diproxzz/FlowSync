import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const COOKIE_NAME = "indobest_session";
export const SESSION_VERSION = "indobest_v3";

const SECRET_KEY = new TextEncoder().encode(env.SESSION_SECRET + "_" + SESSION_VERSION);

export interface SessionPayload {
  authenticated: boolean;
  username: string;
  role: "ADMIN" | "CLIENT";
  clientId: string;
  clientName: string;
  activeClientId?: string;
  activeClientName?: string;
  isReadOnly?: boolean;
  createdAt: number;
}

export async function createSessionToken(
  payloadOrUsername: string | Partial<SessionPayload> = "Indobest"
): Promise<string> {
  const isString = typeof payloadOrUsername === "string";
  const username = isString ? payloadOrUsername : payloadOrUsername.username || "Indobest";
  const isAdmin = username.toLowerCase() === "admin" || (!isString && payloadOrUsername.role === "ADMIN");

  const fullPayload: SessionPayload = {
    authenticated: true,
    username,
    role: isAdmin ? "ADMIN" : (!isString && payloadOrUsername.role) || "CLIENT",
    clientId: (!isString && payloadOrUsername.clientId) || (isAdmin ? "admin" : "indobest"),
    clientName: (!isString && payloadOrUsername.clientName) || (isAdmin ? "Administrator" : "Indobest"),
    activeClientId: !isString ? payloadOrUsername.activeClientId : undefined,
    activeClientName: !isString ? payloadOrUsername.activeClientName : undefined,
    isReadOnly: !isString ? !!payloadOrUsername.isReadOnly : false,
    createdAt: Date.now(),
  };

  return await new SignJWT(fullPayload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET_KEY);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    const session = payload as unknown as SessionPayload;
    if (!session || !session.authenticated || !session.username) {
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

export async function getActiveClientContext(): Promise<{
  clientId: string;
  isFoundingClient: boolean;
  isReadOnly: boolean;
  isAdmin: boolean;
}> {
  const session = await getSession();
  const clientId = session?.activeClientId || session?.clientId || "indobest";
  const isFoundingClient = clientId.toLowerCase() === "indobest";
  return {
    clientId,
    isFoundingClient,
    isReadOnly: !!session?.isReadOnly,
    isAdmin: session?.role === "ADMIN",
  };
}
