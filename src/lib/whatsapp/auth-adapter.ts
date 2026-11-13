import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
} from "@whiskeysockets/baileys";
import { prisma } from "@/lib/db";

/**
 * PostgreSQL / Prisma persistent auth store for Baileys WhatsApp Multi-Device.
 * Stores creds and keys in the `whatsapp_sessions` database table,
 * surviving container restarts, rebuilds, and cloud redeployments.
 */
export async function getPrismaAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAuth: () => Promise<void>;
}> {
  const readData = async (key: string): Promise<any | null> => {
    try {
      const row = await prisma.whatsAppSession.findUnique({
        where: { id: key },
      });
      if (!row || !row.data) return null;
      return JSON.parse(row.data, BufferJSON.reviver);
    } catch (err) {
      console.error(`[WhatsApp Auth] Failed to read key "${key}":`, err);
      return null;
    }
  };

  const writeData = async (key: string, data: any): Promise<void> => {
    try {
      const serialized = JSON.stringify(data, BufferJSON.replacer);
      await prisma.whatsAppSession.upsert({
        where: { id: key },
        update: { data: serialized },
        create: { id: key, data: serialized },
      });
    } catch (err) {
      console.error(`[WhatsApp Auth] Failed to write key "${key}":`, err);
    }
  };

  const removeData = async (key: string): Promise<void> => {
    try {
      await prisma.whatsAppSession.deleteMany({
        where: { id: key },
      });
    } catch (err) {
      console.error(`[WhatsApp Auth] Failed to delete key "${key}":`, err);
    }
  };

  // 1. Load or initialize creds
  const creds: AuthenticationCreds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: any } = {};
          const keysToFetch = ids.map((id) => `${type}-${id}`);

          try {
            const rows = await prisma.whatsAppSession.findMany({
              where: { id: { in: keysToFetch } },
            });

            const rowMap = new Map<string, string>();
            for (const r of rows) {
              rowMap.set(r.id, r.data);
            }

            for (const id of ids) {
              const fullKey = `${type}-${id}`;
              const raw = rowMap.get(fullKey);
              if (raw) {
                let value = JSON.parse(raw, BufferJSON.reviver);
                if (type === "app-state-sync-key" && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
              } else {
                data[id] = null;
              }
            }
          } catch (err) {
            console.error(`[WhatsApp Auth] Batch read error for type ${type}:`, err);
            for (const id of ids) {
              data[id] = null;
            }
          }

          return data;
        },
        set: async (data) => {
          const writes: Promise<void>[] = [];
          const dataRecord = data as Record<string, Record<string, any>>;
          for (const category of Object.keys(dataRecord)) {
            const items = dataRecord[category];
            if (!items) continue;
            for (const id of Object.keys(items)) {
              const value = items[id];
              const fullKey = `${category}-${id}`;
              if (value) {
                writes.push(writeData(fullKey, value));
              } else {
                writes.push(removeData(fullKey));
              }
            }
          }
          await Promise.all(writes);
        },
      },
    },
    saveCreds: async () => {
      await writeData("creds", creds);
    },
    clearAuth: async () => {
      await prisma.whatsAppSession.deleteMany({});
    },
  };
}
