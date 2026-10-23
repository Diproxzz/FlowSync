import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "indobest_session";
const SESSION_VERSION = "indobest_v3";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that do not require authentication
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/admin/sync-storage" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname.startsWith("/icon") ||
    pathname === "/logo.png" ||
    pathname === "/logo.jpg" ||
    pathname === "/wisp.png"
  ) {
    // If user is already authenticated and visits /login, redirect
    if (pathname === "/login") {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      if (token) {
        const secret = new TextEncoder().encode(
          (process.env.SESSION_SECRET || "development_session_secret_change_me_to_at_least_32_chars_long") +
            "_" +
            SESSION_VERSION
        );
        try {
          const { payload } = await jwtVerify(token, secret);
          if (payload && payload.authenticated === true && typeof payload.username === "string") {
            const redirectPath = payload.role === "ADMIN" ? "/admin" : "/dashboard";
            return NextResponse.redirect(new URL(redirectPath, request.url));
          }
        } catch {
          // Token invalid, proceed to login page
        }
      }
    }
    return NextResponse.next();
  }

  // Check session token
  const token = request.cookies.get(COOKIE_NAME)?.value;
  let isAuthenticated = false;
  let sessionPayload: any = null;

  if (token) {
    const secret = new TextEncoder().encode(
      (process.env.SESSION_SECRET || "development_session_secret_change_me_to_at_least_32_chars_long") +
        "_" +
        SESSION_VERSION
    );
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload && payload.authenticated === true && typeof payload.username === "string") {
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
            message: "Authentication required. Please sign in with your FlowPilot credentials.",
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

  // Admin route protection: only users with role === 'ADMIN' can access /admin
  if (pathname.startsWith("/admin") && sessionPayload?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Enforce Administrator Read-Only Mode in client workspaces
  if (
    sessionPayload?.isReadOnly === true &&
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "OPTIONS" &&
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
