import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        username: session.username,
        role: session.role,
        clientId: session.clientId,
        clientName: session.clientName,
        activeClientId: session.activeClientId || (session.role === "ADMIN" ? "indobest" : session.clientId),
        activeClientName: session.activeClientName || (session.role === "ADMIN" ? "Indobest Kolkata" : session.clientName),
        isReadOnly: !!session.isReadOnly,
        isAdmin: session.role === "ADMIN",
      },
    });
  } catch (error: any) {
    console.error("Session me error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch session" } },
      { status: 500 }
    );
  }
}
