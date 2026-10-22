import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { formatINR } from "@/lib/format";

export interface ClientProfile {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  gstin?: string;
  tradeName?: string;
  email?: string;
  phone?: string;
  address?: string;
  state?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  isFoundingClient?: boolean;
}

export interface ClientWithStats extends ClientProfile {
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

const DEFAULT_INDOBEST_CLIENT: ClientProfile = {
  id: "indobest",
  name: "Indobest",
  username: "Indobest",
  // Corresponds to Indobest2026
  passwordHash: "$2a$10$o1bPBabpH8KUbih084A2sebh/wlj7EbqAtQ8Ky6afiEx/meGWpqwy",
  gstin: "19AVZPC2361G1ZA",
  tradeName: "Indobest",
  email: "contact@indobest.com",
  phone: "+91 98300 00000",
  address: "Kolkata, West Bengal",
  state: "West Bengal (19)",
  status: "ACTIVE",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: new Date().toISOString(),
  isFoundingClient: true,
};

export async function getClients(): Promise<ClientProfile[]> {
  try {
    const record = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!record || !record.value || !Array.isArray(record.value)) {
      // Initialize with Indobest as founding client
      await prisma.setting.upsert({
        where: { key: SETTING_KEY },
        update: { value: [DEFAULT_INDOBEST_CLIENT] as any },
        create: {
          key: SETTING_KEY,
          value: [DEFAULT_INDOBEST_CLIENT] as any,
        },
      });
      return [DEFAULT_INDOBEST_CLIENT];
    }

    const list = record.value as unknown as ClientProfile[];
    // Ensure Indobest is present
    if (!list.some((c) => c.id === "indobest" || c.username.toLowerCase() === "indobest")) {
      list.unshift(DEFAULT_INDOBEST_CLIENT);
      await prisma.setting.update({
        where: { key: SETTING_KEY },
        data: { value: list as any },
      });
    }

    return list;
  } catch (error) {
    console.error("Error reading clients registry:", error);
    return [DEFAULT_INDOBEST_CLIENT];
  }
}

export async function getClientById(id: string): Promise<ClientProfile | null> {
  const clients = await getClients();
  const searchId = id.trim().toLowerCase();
  return clients.find((c) => c.id.toLowerCase() === searchId || c.username.toLowerCase() === searchId) || null;
}

export async function getClientByUsername(username: string): Promise<ClientProfile | null> {
  const clients = await getClients();
  return clients.find((c) => c.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

export async function createClient(data: {
  name: string;
  username: string;
  password: string;
  gstin?: string;
  tradeName?: string;
  email?: string;
  phone?: string;
  address?: string;
  state?: string;
}): Promise<ClientProfile> {
  const cleanUsername = data.username.trim();
  if (!cleanUsername) throw new Error("Username is required");
  if (cleanUsername.toLowerCase() === "admin") throw new Error("Username 'admin' is reserved for administrator");

  const clients = await getClients();
  if (clients.some((c) => c.username.toLowerCase() === cleanUsername.toLowerCase())) {
    throw new Error(`Username '${cleanUsername}' is already taken by another client`);
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(data.password, salt);

  const newClient: ClientProfile = {
    id: "client_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6),
    name: data.name.trim(),
    username: cleanUsername,
    passwordHash,
    gstin: data.gstin?.trim().toUpperCase() || undefined,
    tradeName: data.tradeName?.trim() || data.name.trim(),
    email: data.email?.trim() || undefined,
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

  return newClient;
}

export async function getClientsWithStats(): Promise<ClientWithStats[]> {
  const clients = await getClients();

  // Indobest stats (live from main database)
  const [totalInvoices, totalPurchases, totalCustomers, totalSuppliers, totalProducts, salesAgg] =
    await Promise.all([
      prisma.invoice.count(),
      prisma.purchaseInvoice.count(),
      prisma.customer.count(),
      prisma.supplier.count(),
      prisma.product.count(),
      prisma.invoice.aggregate({ _sum: { grand_total: true } }),
    ]);

  const indobestRevenue = formatINR(Number(salesAgg._sum.grand_total || 0));

  return clients.map((c) => {
    if (c.id === "indobest" || c.username.toLowerCase() === "indobest") {
      return {
        ...c,
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

    // New clients have isolated fresh partitions (0 data initially)
    return {
      ...c,
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
