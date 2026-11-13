import { NextResponse } from "next/server";
import {
  getWhatsAppStatus,
  connectWhatsApp,
  disconnectWhatsApp,
  requestWhatsAppPairingCode,
} from "@/lib/whatsapp/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getWhatsAppStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err?.message || "Failed to retrieve WhatsApp status" } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "connect";

    if (action === "disconnect") {
      await disconnectWhatsApp();
      return NextResponse.json({
        status: "DISCONNECTED",
        phoneNumber: null,
        qrCode: null,
        lastError: null,
      });
    }

    if (action === "refresh") {
      const status = await connectWhatsApp(true);
      return NextResponse.json(status);
    }

    if (action === "pairing_code") {
      const phone = body.phone;
      if (!phone || typeof phone !== "string") {
        return NextResponse.json(
          { error: { message: "Phone number is required for pairing code" } },
          { status: 400 }
        );
      }
      const pairingCode = await requestWhatsAppPairingCode(phone);
      return NextResponse.json({
        status: "PAIRING_CODE_READY",
        pairingCode,
      });
    }

    // Default to connecting
    const status = await connectWhatsApp(false);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: err?.message || "Failed to process WhatsApp action" } },
      { status: 500 }
    );
  }
}
