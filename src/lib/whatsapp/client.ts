import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { getPrismaAuthState } from "./auth-adapter";
import { prisma } from "@/lib/db";

export type WhatsAppConnectionState =
  | "CONNECTED"
  | "CONNECTING"
  | "QR_READY"
  | "DISCONNECTED";

export interface WhatsAppStatus {
  status: WhatsAppConnectionState;
  phoneNumber: string | null;
  qrCode: string | null;
  lastError: string | null;
}

interface GlobalWhatsAppState {
  socket: WASocket | null;
  status: WhatsAppConnectionState;
  qrCode: string | null;
  phoneNumber: string | null;
  lastError: string | null;
  isInitializing: boolean;
  reconnectTimer: NodeJS.Timeout | null;
}

const globalForWhatsApp = globalThis as unknown as {
  __whatsappClientState?: GlobalWhatsAppState;
};

const waState: GlobalWhatsAppState =
  globalForWhatsApp.__whatsappClientState ?? {
    socket: null,
    status: "DISCONNECTED",
    qrCode: null,
    phoneNumber: null,
    lastError: null,
    isInitializing: false,
    reconnectTimer: null,
  };

globalForWhatsApp.__whatsappClientState = waState;

/**
 * Normalizes an Indian or international phone number into a valid WhatsApp JID
 * e.g. "98301 23456" -> "919830123456@s.whatsapp.net"
 * e.g. "+91-9830123456" -> "919830123456@s.whatsapp.net"
 */
export function normalizeWhatsAppJid(phone: string): { jid: string; cleanNumber: string } {
  // Strip all non-digit characters
  let digits = phone.replace(/\D/g, "");

  // If starts with 0, strip leading 0
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // If 10 digits (standard Indian mobile), prepend 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  if (digits.length < 10) {
    throw new Error(`Invalid phone number format: "${phone}". Minimum 10 digits required.`);
  }

  return {
    jid: `${digits}@s.whatsapp.net`,
    cleanNumber: `+${digits}`,
  };
}

let activeConnectPromise: Promise<WhatsAppStatus> | null = null;

/**
 * Connects or restarts the WhatsApp background socket and waits for initial QR or open connection.
 */
export async function connectWhatsApp(forceNewQr = false, timeoutMs = 15_000): Promise<WhatsAppStatus> {
  if (waState.status === "CONNECTED" && waState.socket) {
    return getWhatsAppStatus();
  }

  if (!forceNewQr && waState.status === "QR_READY" && waState.qrCode) {
    return getWhatsAppStatus();
  }

  if (forceNewQr) {
    waState.qrCode = null;
    waState.status = "CONNECTING";
  }

  if (activeConnectPromise && !forceNewQr) {
    return activeConnectPromise;
  }

  activeConnectPromise = (async () => {
    waState.isInitializing = true;
    waState.status = "CONNECTING";
    waState.lastError = null;

    try {
      // If an existing socket is running, terminate it before starting a fresh one
      if (waState.socket) {
        try {
          waState.socket.end(undefined);
        } catch {}
        waState.socket = null;
      }

      // Check whether existing creds in DB have an authenticated session (me.id)
      const existingCredsRow = await prisma.whatsAppSession.findUnique({
        where: { id: "creds" },
      });
      let isRegisteredSession = false;
      if (existingCredsRow?.data) {
        try {
          const parsed = JSON.parse(existingCredsRow.data);
          isRegisteredSession = !!(parsed?.me?.id || parsed?.registered === true);
        } catch {}
      }

      // If forcing a new QR/pairing, or if DB contains stale/unauthenticated partial data, purge it
      if (forceNewQr || !isRegisteredSession) {
        await prisma.whatsAppSession.deleteMany({});
      }

      const { state, saveCreds, clearAuth } = await getPrismaAuthState();
      const logger = pino({ level: "silent" });

      let version: [number, number, number] | undefined = undefined;
      try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
      } catch (e) {
        console.warn("[WhatsApp] Could not fetch latest Baileys version, using default:", e);
      }

      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
      });

      waState.socket = sock;

      // Handle credential updates
      sock.ev.on("creds.update", async () => {
        await saveCreds();
      });

      // Handle connection lifecycle
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        console.log("[WhatsApp] connection.update received:", {
          connection,
          hasQr: !!qr,
          qrPreview: qr ? qr.slice(0, 25) : null,
          error: lastDisconnect?.error ? String(lastDisconnect.error) : null,
        });

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              scale: 7,
              color: { dark: "#0f172a", light: "#ffffff" },
            });
            waState.qrCode = qrDataUrl;
            waState.status = "QR_READY";
            waState.isInitializing = false;
          } catch (err: any) {
            console.error("[WhatsApp] QR generation error:", err);
            waState.lastError = "Failed to render QR code";
          }
        }

        if (connection === "open") {
          waState.status = "CONNECTED";
          waState.qrCode = null;
          waState.lastError = null;
          waState.isInitializing = false;

          // Extract user's phone number
          const userJid = sock.user?.id || "";
          const rawDigits = userJid.split(":")[0]?.replace(/\D/g, "") || userJid.split("@")[0]?.replace(/\D/g, "") || "";
          waState.phoneNumber = rawDigits ? `+${rawDigits}` : "Connected";
          console.log(`[WhatsApp] Successfully connected as ${waState.phoneNumber}`);
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isRestart = statusCode === DisconnectReason.restartRequired || statusCode === 515;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.log(
            `[WhatsApp] Connection closed (code: ${statusCode}, isRestart: ${isRestart}, isLoggedOut: ${isLoggedOut})`
          );

          if (isLoggedOut) {
            await clearAuth();
            waState.status = "DISCONNECTED";
            waState.socket = null;
            waState.qrCode = null;
            waState.phoneNumber = null;
            waState.lastError = "Session unlinked from phone. Please scan QR again.";
          } else if (isRestart) {
            // Handshake completed! WhatsApp server requests immediate reconnection to open authenticated stream
            console.log("[WhatsApp] Stream restart required (code 515). Reconnecting immediately to finalize login...");
            waState.status = "CONNECTING";
            waState.socket = null;
            waState.qrCode = null;
            activeConnectPromise = null;
            setTimeout(() => {
              connectWhatsApp(false).catch((e) =>
                console.error("[WhatsApp] Restart reconnection failed:", e)
              );
            }, 500);
          } else {
            // If QR is already generated and awaiting scan, do not wipe it
            if (!waState.qrCode) {
              waState.status = "DISCONNECTED";
              waState.socket = null;
            }
          }
        }
      });

      // Wait up to timeoutMs for the initial QR code or connection
      const waitStart = Date.now();
      while (Date.now() - waitStart < timeoutMs) {
        const cur = waState.status as string;
        if (cur === "QR_READY" || cur === "CONNECTED") {
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      return getWhatsAppStatus();
    } catch (err: any) {
      waState.status = "DISCONNECTED";
      waState.lastError = err?.message || "Failed to initialize WhatsApp socket";
      console.error("[WhatsApp] Initialization error:", err);
      return getWhatsAppStatus();
    } finally {
      waState.isInitializing = false;
    }
  })().finally(() => {
    activeConnectPromise = null;
  });

  return activeConnectPromise;
}

/**
 * Disconnects and unlinks WhatsApp session completely
 */
export async function disconnectWhatsApp(): Promise<void> {
  if (waState.reconnectTimer) {
    clearTimeout(waState.reconnectTimer);
    waState.reconnectTimer = null;
  }

  try {
    if (waState.socket) {
      await waState.socket.logout();
    }
  } catch {
    // Ignore logout socket closure errors
  }

  const { clearAuth } = await getPrismaAuthState();
  await clearAuth();

  waState.socket = null;
  waState.status = "DISCONNECTED";
  waState.qrCode = null;
  waState.phoneNumber = null;
  waState.lastError = null;
}

/**
 * Gets the current WhatsApp connection status.
 * If creds exist in DB and socket is disconnected, attempts background auto-reconnect only if registered.
 */
export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  // If disconnected but registered creds exist in DB, auto-trigger connect
  if (waState.status === "DISCONNECTED" && !waState.isInitializing && !activeConnectPromise) {
    try {
      const credsRow = await prisma.whatsAppSession.findUnique({
        where: { id: "creds" },
      });
      if (credsRow?.data) {
        const parsed = JSON.parse(credsRow.data);
        const isPaired = !!(parsed?.me?.id || parsed?.registered === true);
        if (isPaired) {
          connectWhatsApp().catch((err) =>
            console.error("[WhatsApp] Background reconnect trigger error:", err)
          );
        }
      }
    } catch {
      // Ignore DB query errors during startup
    }
  }

  return {
    status: waState.status,
    phoneNumber: waState.phoneNumber,
    qrCode: waState.qrCode,
    lastError: waState.lastError,
  };
}

/**
 * Dispatches a WhatsApp text message and optional PDF statement document
 */
export async function sendWhatsAppStatementMessage(params: {
  recipientPhone: string;
  messageText: string;
  pdfAttachment?: {
    buffer: Buffer;
    fileName: string;
  };
}): Promise<{ messageId: string; jid: string; cleanNumber: string }> {
  if (waState.status !== "CONNECTED" || !waState.socket) {
    throw new Error(
      "WhatsApp is not connected. Please link your WhatsApp device in Settings first."
    );
  }

  const { jid, cleanNumber } = normalizeWhatsAppJid(params.recipientPhone);

  if (params.pdfAttachment) {
    // Send PDF document with the message text as the caption
    const result = await waState.socket.sendMessage(jid, {
      document: params.pdfAttachment.buffer,
      mimetype: "application/pdf",
      fileName: params.pdfAttachment.fileName,
      caption: params.messageText,
    });

    return {
      messageId: result?.key?.id || "sent",
      jid,
      cleanNumber,
    };
  }

  // Pure text message
  const result = await waState.socket.sendMessage(jid, {
    text: params.messageText,
  });

  return {
    messageId: result?.key?.id || "sent",
    jid,
    cleanNumber,
  };
}

/**
 * Requests an 8-character pairing code from WhatsApp using phone number
 */
export async function requestWhatsAppPairingCode(phone: string): Promise<string> {
  const { cleanNumber } = normalizeWhatsAppJid(phone);
  const digitsOnly = cleanNumber.replace(/\D/g, "");

  if (waState.status === "CONNECTED" && waState.socket) {
    throw new Error("WhatsApp is already connected.");
  }

  // Ensure fresh connection is ready
  await connectWhatsApp(true);

  if (!waState.socket) {
    throw new Error("WhatsApp client not ready. Please try again.");
  }

  // Give socket 2 seconds to establish connection to WhatsApp server
  await new Promise((r) => setTimeout(r, 2000));

  // Request pairing code from WhatsApp
  const rawCode = await waState.socket.requestPairingCode(digitsOnly);
  const formatted = rawCode ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : rawCode;
  return formatted;
}
