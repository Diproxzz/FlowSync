import { prisma } from "@/lib/db";
import { calculateStatementTotals } from "./balances";

/**
 * Finds or automatically creates/links a regular LedgerAccount for a Customer.
 */
export async function getOrCreateCustomerLedgerAccount(customerId: string) {
  let account = await prisma.ledgerAccount.findUnique({
    where: { customer_id: customerId },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });

  if (account) return account;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) return null;

  // Check if there is an unlinked regular CUSTOMER ledger account matching name
  const unlinked = await prisma.ledgerAccount.findFirst({
    where: {
      customer_id: null,
      informal_customer_id: null,
      account_type: "CUSTOMER",
      is_informal: false,
      display_name: { equals: customer.name, mode: "insensitive" },
    },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });

  if (unlinked) {
    return prisma.ledgerAccount.update({
      where: { id: unlinked.id },
      data: { customer_id: customer.id, is_informal: false },
      include: {
        entries: {
          where: { is_void: false },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
    });
  }

  return prisma.ledgerAccount.create({
    data: {
      account_type: "CUSTOMER",
      is_informal: false,
      customer_id: customer.id,
      display_name: customer.name,
      credit_days: 90,
    },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });
}

/**
 * Finds or automatically creates/links an Informal LedgerAccount for a Customer.
 */
export async function getOrCreateCustomerInformalLedgerAccount(customerId: string) {
  let account = await prisma.ledgerAccount.findUnique({
    where: { informal_customer_id: customerId },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });

  if (account) return account;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) return null;

  const informalDisplayName = `${customer.name} (Informal)`;

  // Check if there is an unlinked CUSTOMER informal ledger account matching name
  const unlinked = await prisma.ledgerAccount.findFirst({
    where: {
      customer_id: null,
      informal_customer_id: null,
      account_type: "CUSTOMER",
      is_informal: true,
      display_name: { equals: informalDisplayName, mode: "insensitive" },
    },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });

  if (unlinked) {
    return prisma.ledgerAccount.update({
      where: { id: unlinked.id },
      data: {
        informal_customer_id: customer.id,
        is_informal: true,
      },
      include: {
        entries: {
          where: { is_void: false },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
    });
  }

  return prisma.ledgerAccount.create({
    data: {
      account_type: "CUSTOMER",
      is_informal: true,
      informal_customer_id: customer.id,
      display_name: informalDisplayName,
      credit_days: 90,
    },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });
}

/**
 * Finds or automatically creates/links a LedgerAccount for a Supplier.
 */
export async function getOrCreateSupplierLedgerAccount(supplierId: string) {
  let account = await prisma.ledgerAccount.findUnique({
    where: { supplier_id: supplierId },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });

  if (account) return account;

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) return null;

  const unlinked = await prisma.ledgerAccount.findFirst({
    where: {
      supplier_id: null,
      account_type: "SUPPLIER",
      display_name: { equals: supplier.name, mode: "insensitive" },
    },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });

  if (unlinked) {
    return prisma.ledgerAccount.update({
      where: { id: unlinked.id },
      data: { supplier_id: supplier.id },
      include: {
        entries: {
          where: { is_void: false },
          orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
        },
      },
    });
  }

  return prisma.ledgerAccount.create({
    data: {
      account_type: "SUPPLIER",
      supplier_id: supplier.id,
      display_name: supplier.name,
      credit_days: 90,
    },
    include: {
      entries: {
        where: { is_void: false },
        orderBy: [{ entry_date: "asc" }, { sort_seq: "asc" }, { id: "asc" }],
      },
    },
  });
}

/**
 * Calculates current ledger total due for a customer or supplier account.
 */
export function calculateAccountTotalDue(account: any, isCustomer: boolean): number {
  if (!account || !account.entries || account.entries.length === 0) {
    return 0;
  }

  const openingEntry = account.entries.find((e: any) => e.entry_type === "OPENING");
  let openingBalance = 0;
  let openingSide: "Dr" | "Cr" = "Dr";
  if (openingEntry) {
    const deb = Number(openingEntry.debit);
    const cred = Number(openingEntry.credit);
    openingBalance = deb > 0 ? deb : cred;
    openingSide = deb >= cred ? "Dr" : "Cr";
  }

  const totals = calculateStatementTotals(
    account.entries,
    openingSide === "Dr" ? openingBalance : -openingBalance
  );

  if (isCustomer) {
    // Dr closing balance means customer owes us money (receivable)
    return totals.closingSide === "Dr" ? totals.closingBalance : 0;
  } else {
    // Cr closing balance means we owe supplier money (payable)
    return totals.closingSide === "Cr" ? totals.closingBalance : 0;
  }
}
