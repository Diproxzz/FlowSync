import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env, isProductionRuntime, isStrongSessionSecret } from "@/lib/env";
import { COOKIE_NAME, SESSION_VERSION } from "@/lib/auth/constants";

export { COOKIE_NAME, SESSION_VERSION };

function getSigningSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || env.SESSION_SECRET;
  if (isProductionRuntime() && !isStrongSessionSecret(secret)) {
    throw new Error("Invalid production SESSION_SECRET configuration");
  }
  return new TextEncoder().encode(`${secret}_${SESSION_VERSION}`);
}

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
  const username = isString
    ? payloadOrUsername
    : payloadOrUsername.username || "Indobest";
  const isAdmin =
    username.toLowerCase() === "admin" ||
    (!isString && payloadOrUsername.role === "ADMIN");

  const fullPayload: SessionPayload = {
    authenticated: true,
    username,
    role: isAdmin ? "ADMIN" : (!isString && payloadOrUsername.role) || "CLIENT",
    clientId:
      (!isString && payloadOrUsername.clientId) ||
      (isAdmin ? "admin" : "indobest"),
    clientName:
      (!isString && payloadOrUsername.clientName) ||
      (isAdmin ? "Administrator" : "Indobest"),
    activeClientId: !isString ? payloadOrUsername.activeClientId : undefined,
    activeClientName: !isString ? payloadOrUsername.activeClientName : undefined,
    isReadOnly: !isString ? !!payloadOrUsername.isReadOnly : false,
    createdAt: Date.now(),
  };

  return await new SignJWT(fullPayload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSigningSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningSecret());
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
    secure:
      process.env.COOKIE_SECURE === "true" ||
      process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure:
      process.env.COOKIE_SECURE === "true" ||
      process.env.NODE_ENV === "production",
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
  if (!session || !session.authenticated) {
    return {
      clientId: "",
      isFoundingClient: false,
      isReadOnly: false,
      isAdmin: false,
    };
  }

  const clientId = session.activeClientId || session.clientId || "";
  const isFoundingClient = clientId.toLowerCase() === "indobest";
  return {
    clientId,
    isFoundingClient,
    isReadOnly: !!session.isReadOnly,
    isAdmin: session.role === "ADMIN",
  };
}

export async function requireFoundingReadResponse(): Promise<NextResponse | null> {
  const ctx = await getActiveClientContext();
  if (!ctx.clientId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }
  if (!ctx.isFoundingClient) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN_TENANT_ISOLATION",
          message: "Workspace isolation: access denied for this workspace.",
        },
      },
      { status: 403 }
    );
  }
  return null;
}

export async function requireFoundingWrite(options?: {
  allowAdminOnSettings?: boolean;
}): Promise<
  | { ok: true; ctx: Awaited<ReturnType<typeof getActiveClientContext>> }
  | { ok: false; response: NextResponse }
> {
  const ctx = await getActiveClientContext();
  if (!ctx.clientId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      ),
    };
  }
  if (ctx.isReadOnly) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_READ_ONLY",
            message: "Read-only session cannot modify workspace records.",
          },
        },
        { status: 403 }
      ),
    };
  }
  const allowed =
    ctx.isFoundingClient || Boolean(options?.allowAdminOnSettings && ctx.isAdmin);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_TENANT_ISOLATION",
            message: "Workspace isolation: mutations are restricted in isolated workspaces.",
          },
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true, ctx };
}
