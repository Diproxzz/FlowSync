import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  COOKIE_NAME,
  SESSION_VERSION,
  DEV_SESSION_SECRET,
} from "@/lib/auth/constants";

function resolveMiddlewareSecret(): Uint8Array | null {
  const rawSecret = process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!rawSecret || rawSecret.length < 32 || rawSecret === DEV_SESSION_SECRET) {
      return null;
    }
    return new TextEncoder().encode(`${rawSecret}_${SESSION_VERSION}`);
  }

  const secret = rawSecret || DEV_SESSION_SECRET;
  return new TextEncoder().encode(`${secret}_${SESSION_VERSION}`);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that do not require authentication
  if (
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password" ||
    pathname === "/api/admin/sync-storage" ||
    pathname === "/api/admin/sync-products" ||
    (pathname === "/api/admin/backup" && !!request.headers.get("authorization")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname.startsWith("/icon") ||
    pathname === "/logo.png" ||
    pathname === "/logo.jpg" ||
    pathname === "/wisp.png"
  ) {
    // If user is already authenticated and visits /login, redirect to workspace
    if (pathname === "/login") {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      const secret = resolveMiddlewareSecret();
      if (token && secret) {
        try {
          const { payload } = await jwtVerify(token, secret);
          if (
            payload &&
            payload.authenticated === true &&
            typeof payload.username === "string"
          ) {
            const redirectPath =
              payload.role === "ADMIN" ? "/admin" : "/dashboard";
            return NextResponse.redirect(new URL(redirectPath, request.url));
          }
        } catch {
          // Token invalid, proceed to login page
        }
      }
    }
    return NextResponse.next();
  }

  // Check session token (fail closed if production secret is missing/weak/default)
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = resolveMiddlewareSecret();
  let isAuthenticated = false;
  let sessionPayload: any = null;

  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, secret);
      if (
        payload &&
        payload.authenticated === true &&
        typeof payload.username === "string"
      ) {
        isAuthenticated = true;
        sessionPayload = payload;
      }
    } catch {
      isAuthenticated = false;
    }
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message:
              "Authentication required. Please sign in with your FlowPilot credentials.",
          },
        },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Admin UI route protection: only users with role === 'ADMIN' can access /admin UI
  if (pathname.startsWith("/admin") && sessionPayload?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Admin API protection: backup is accessible to ADMIN and founding workspace (Indobest); others strictly require ADMIN
  if (pathname.startsWith("/api/admin/")) {
    const isFoundingOrAdmin =
      sessionPayload?.role === "ADMIN" ||
      sessionPayload?.clientId?.toLowerCase() === "indobest" ||
      sessionPayload?.username?.toLowerCase() === "indobest";

    const isAllowed = pathname.startsWith("/api/admin/backup")
      ? isFoundingOrAdmin
      : sessionPayload?.role === "ADMIN";

    if (!isAllowed) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Administrator access required" } },
        { status: 403 }
      );
    }
  }

  // Enforce Administrator Read-Only Mode in client workspaces
  const isMutatingMethod =
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "OPTIONS";

  // CSRF protection on browser API mutations: if Origin header is sent, it must match host
  if (
    pathname.startsWith("/api/") &&
    isMutatingMethod &&
    !request.headers.get("authorization")
  ) {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const hostHeader = (
          request.headers.get("x-forwarded-host") ||
          request.headers.get("host") ||
          ""
        )
          .split(",")[0]
          .trim();

        const isLocalDev =
          originUrl.hostname === "localhost" ||
          originUrl.hostname === "127.0.0.1" ||
          hostHeader.startsWith("localhost") ||
          hostHeader.startsWith("127.0.0.1");

        if (
          hostHeader &&
          !isLocalDev &&
          originUrl.host.toLowerCase() !== hostHeader.toLowerCase()
        ) {
          return NextResponse.json(
            {
              error: {
                code: "FORBIDDEN_CSRF",
                message: "Cross-origin API mutation rejected.",
              },
            },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN_CSRF",
              message: "Invalid request origin.",
            },
          },
          { status: 403 }
        );
      }
    }
  }

  if (
    sessionPayload?.isReadOnly === true &&
    isMutatingMethod &&
    !pathname.startsWith("/api/admin/") &&
    pathname !== "/api/auth/logout"
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_READ_ONLY",
            message:
              "Administrator is viewing this client workspace in Read-Only Mode. Write operations are reserved exclusively for the client.",
          },
        },
        { status: 403 }
      );
    }
  }

  // Multi-tenant write isolation: non-founding isolated client sessions cannot mutate shared Indobest data tables
  if (
    pathname.startsWith("/api/") &&
    isMutatingMethod &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/admin/") &&
    pathname !== "/api/wisp/chat"
  ) {
    const effectiveClientId = String(
      sessionPayload?.activeClientId || sessionPayload?.clientId || ""
    ).toLowerCase();
    const isAdminOnSettings =
      sessionPayload?.role === "ADMIN" &&
      sessionPayload?.isReadOnly !== true &&
      pathname.startsWith("/api/settings");

    if (effectiveClientId !== "indobest" && !isAdminOnSettings) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN_TENANT_ISOLATION",
            message:
              "Workspace isolation: mutations to primary dataset are restricted in isolated tenant workspaces.",
          },
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
