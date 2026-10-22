import { NextRequest, NextResponse } from "next/server";
import { getSession, createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { getClientById } from "@/lib/clients/store";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Administrator access required" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { clientId, returnToAdmin } = body;

    if (returnToAdmin) {
      const token = await createSessionToken({
        authenticated: true,
        username: "admin",
        role: "ADMIN",
        clientId: "admin",
        clientName: "Administrator",
        isReadOnly: false,
      });
      setSessionCookie(token);
      return NextResponse.json({
        success: true,
        message: "Returned to Administrator Portal",
        redirectUrl: "/admin",
      });
    }

    if (!clientId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Client ID is required" } },
        { status: 400 }
      );
    }

    const targetClient = await getClientById(clientId);
    if (!targetClient) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Client not found" } },
        { status: 404 }
      );
    }

    // Admin views client workspace strictly in READ-ONLY mode
    const token = await createSessionToken({
      authenticated: true,
      username: "admin",
      role: "ADMIN",
      clientId: "admin",
      clientName: "Administrator",
      activeClientId: targetClient.id,
      activeClientName: targetClient.name,
      isReadOnly: true, // Strictly read-only for admin in client workspace
    });
    setSessionCookie(token);

    return NextResponse.json({
      success: true,
      message: `Now viewing ${targetClient.name} in read-only mode`,
      redirectUrl: "/dashboard",
    });
  } catch (error: any) {
    console.error("Switch client error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: error?.message || "Failed to switch client workspace" } },
      { status: 500 }
    );
  }
}
