import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { formatINR } from "@/lib/format";
import { encryptRecoveryEmail, maskEmail } from "@/lib/auth/crypto";
import { env } from "@/lib/env";

export interface ClientProfile {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  gstin?: string;
  tradeName?: string;
  recoveryEmailEncrypted?: string;
  recoveryEmailMasked?: string;
  phone?: string;
  address?: string;
  state?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  isFoundingClient?: boolean;
}

export interface ClientPublicProfile {
  id: string;
  name: string;
  username: string;
  gstin?: string;
  tradeName?: string;
  recoveryEmailMasked?: string;
  phone?: string;
  address?: string;
  state?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  isFoundingClient?: boolean;
}

export interface ClientWithStats extends ClientPublicProfile {
  stats: {
    totalInvoices: number;
    totalPurchases: number;
    totalCustomers: number;
    totalSuppliers: number;
    totalProducts: number;
    totalRevenue: string;
  };
}

const SETTING_KEY = "flowsync_clients_registry";

function buildDefaultIndobestClient(): ClientProfile {
  const configuredRecovery = (
    process.env.INDOBEST_RECOVERY_EMAIL ||
    env.INDOBEST_RECOVERY_EMAIL ||
    ""
  ).trim();

  return {
    id: "indobest",
    name: "Indobest",
    username: env.APP_USERNAME || "Indobest",
    passwordHash: "",
    gstin: env.COMPANY_GSTIN || "19AVZPC2361G1ZA",
    tradeName: env.COMPANY_NAME || "Indobest",
    recoveryEmailMasked: configuredRecovery ? maskEmail(configuredRecovery) : undefined,
    phone: "+91 82408 92993",
    address: "Kolkata, West Bengal",
    state: "West Bengal (19)",
    status: "ACTIVE",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    isFoundingClient: true,
  };
}

export function toPublicClient(c: ClientProfile & { email?: string }): ClientPublicProfile {
  const isFounding = c.id === "indobest" || c.username.toLowerCase() === "indobest";
  let recoveryEmailMasked = c.recoveryEmailMasked;

  if (!recoveryEmailMasked && isFounding) {
    const envRecovery = (
      process.env.INDOBEST_RECOVERY_EMAIL ||
      env.INDOBEST_RECOVERY_EMAIL ||
      ""
    ).trim();
    if (envRecovery) {
      recoveryEmailMasked = maskEmail(envRecovery);
    }
  } else if (!recoveryEmailMasked && c.email) {
    recoveryEmailMasked = maskEmail(c.email);
  }

  return {
    id: c.id,
    name: c.name,
    username: c.username,
    gstin: c.gstin,
    tradeName: c.tradeName,
    recoveryEmailMasked,
    phone: c.phone,
    address: c.address,
    state: c.state,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    isFoundingClient: c.isFoundingClient,
  };
}

export async function getClients(): Promise<ClientProfile[]> {
  const defaultIndobest = buildDefaultIndobestClient();
  try {
    const record = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!record || !record.value || !Array.isArray(record.value)) {
      await prisma.setting.upsert({
        where: { key: SETTING_KEY },
        update: { value: [defaultIndobest] as any },
        create: {
          key: SETTING_KEY,
          value: [defaultIndobest] as any,
        },
      });
      return [defaultIndobest];
    }

    const list = record.value as unknown as ClientProfile[];
    if (!list.some((c) => c.id === "indobest" || c.username.toLowerCase() === "indobest")) {
      list.unshift(defaultIndobest);
      await prisma.setting.update({
        where: { key: SETTING_KEY },
        data: { value: list as any },
      });
    }

    return list;
  } catch (error) {
    console.error("Error reading clients registry:", error);
    return [defaultIndobest];
  }
}

export async function getClientById(id: string): Promise<ClientProfile | null> {
  const clients = await getClients();
  const searchId = id.trim().toLowerCase();
  return (
    clients.find(
      (c) => c.id.toLowerCase() === searchId || c.username.toLowerCase() === searchId
    ) || null
  );
}

export async function getClientByUsername(username: string): Promise<ClientProfile | null> {
  const clients = await getClients();
  return (
    clients.find((c) => c.username.toLowerCase() === username.trim().toLowerCase()) || null
  );
}

export async function createClient(data: {
  name: string;
  username: string;
  password: string;
  recoveryEmail: string;
  gstin?: string;
  tradeName?: string;
  phone?: string;
  address?: string;
  state?: string;
}): Promise<ClientPublicProfile> {
  const cleanUsername = data.username.trim();
  const cleanRecoveryEmail = (data.recoveryEmail || "").trim().toLowerCase();

  if (!cleanUsername) throw new Error("Username is required");
  if (cleanUsername.toLowerCase() === "admin") {
    throw new Error("Username 'admin' is reserved for administrator");
  }
  if (!cleanRecoveryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecoveryEmail)) {
    throw new Error("A valid recovery email ID is required");
  }

  const clients = await getClients();
  if (clients.some((c) => c.username.toLowerCase() === cleanUsername.toLowerCase())) {
    throw new Error(`Username '${cleanUsername}' is already taken by another client`);
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(data.password, salt);

  const newClient: ClientProfile = {
    id:
      "client_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).substring(2, 6),
    name: data.name.trim(),
    username: cleanUsername,
    passwordHash,
    gstin: data.gstin?.trim().toUpperCase() || undefined,
    tradeName: data.tradeName?.trim() || data.name.trim(),
    recoveryEmailEncrypted: encryptRecoveryEmail(cleanRecoveryEmail),
    recoveryEmailMasked: maskEmail(cleanRecoveryEmail),
    phone: data.phone?.trim() || undefined,
    address: data.address?.trim() || undefined,
    state: data.state?.trim() || undefined,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isFoundingClient: false,
  };

  clients.push(newClient);

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: clients as any },
    create: {
      key: SETTING_KEY,
      value: clients as any,
    },
  });

  return toPublicClient(newClient);
}

export async function updateClientPasswordHash(
  username: string,
  newPasswordHash: string
): Promise<boolean> {
  const clean = username.trim().toLowerCase();
  const clients = await getClients();
  const idx = clients.findIndex((c) => c.username.toLowerCase() === clean);
  if (idx === -1) return false;

  clients[idx] = {
    ...clients[idx],
    passwordHash: newPasswordHash,
    updatedAt: new Date().toISOString(),
  };

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: clients as any },
    create: {
      key: SETTING_KEY,
      value: clients as any,
    },
  });

  return true;
}

export async function getClientsWithStats(): Promise<ClientWithStats[]> {
  const clients = await getClients();

  const [
    totalInvoices,
    totalPurchases,
    totalCustomers,
    totalSuppliers,
    totalProducts,
    salesAgg,
  ] = await Promise.all([
    prisma.invoice.count(),
    prisma.purchaseInvoice.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.product.count(),
    prisma.invoice.aggregate({ _sum: { grand_total: true } }),
  ]);

  const indobestRevenue = formatINR(Number(salesAgg._sum.grand_total || 0));

  return clients.map((c) => {
    const publicClient = toPublicClient(c);
    if (c.id === "indobest" || c.username.toLowerCase() === "indobest") {
      return {
        ...publicClient,
        stats: {
          totalInvoices,
          totalPurchases,
          totalCustomers,
          totalSuppliers,
          totalProducts,
          totalRevenue: indobestRevenue,
        },
      };
    }

    return {
      ...publicClient,
      stats: {
        totalInvoices: 0,
        totalPurchases: 0,
        totalCustomers: 0,
        totalSuppliers: 0,
        totalProducts: 0,
        totalRevenue: "₹0.00",
      },
    };
  });
}
