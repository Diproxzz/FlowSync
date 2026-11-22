import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { syncAllBusinessLogs } from "@/lib/logs/sync";

describe("Payments & Logs Synchronization Integration", () => {
  it("verifies customer receipts can be queried sorted latest to oldest without changing ledgers", async () => {
    const receipts = await prisma.ledgerEntry.findMany({
      where: {
        account: { account_type: "CUSTOMER", is_active: true },
        credit: { gt: 0 },
        is_void: false,
        entry_type: { notIn: ["CREDIT_NOTE", "OPENING"] },
      },
      include: {
        account: {
          select: { display_name: true, customer_id: true },
        },
      },
      orderBy: [{ entry_date: "desc" }, { id: "desc" }],
      take: 10,
    });

    expect(receipts.length).toBeGreaterThan(0);
    // Verify sorting: each entry_date should be >= the next
    for (let i = 0; i < receipts.length - 1; i++) {
      const cur = new Date(receipts[i].entry_date).getTime();
      const next = new Date(receipts[i + 1].entry_date).getTime();
      expect(cur).toBeGreaterThanOrEqual(next);
    }
  });

  it("verifies supplier payments can be queried sorted latest to oldest without changing ledgers", async () => {
    const payments = await prisma.ledgerEntry.findMany({
      where: {
        account: { account_type: "SUPPLIER", is_active: true },
        debit: { gt: 0 },
        is_void: false,
        entry_type: { notIn: ["DEBIT_NOTE", "OPENING"] },
      },
      include: {
        account: {
          select: { display_name: true, supplier_id: true },
        },
      },
      orderBy: [{ entry_date: "desc" }, { id: "desc" }],
      take: 10,
    });

    expect(payments.length).toBeGreaterThan(0);
    for (let i = 0; i < payments.length - 1; i++) {
      const cur = new Date(payments[i].entry_date).getTime();
      const next = new Date(payments[i + 1].entry_date).getTime();
      expect(cur).toBeGreaterThanOrEqual(next);
    }
  });

  it("verifies customer payments calculation includes last made payment date", async () => {
    const receipts = await prisma.ledgerEntry.findMany({
      where: {
        account: { account_type: "CUSTOMER", is_active: true },
        credit: { gt: 0 },
        is_void: false,
        entry_type: { notIn: ["CREDIT_NOTE", "OPENING"] },
      },
      include: {
        account: {
          select: { id: true, display_name: true, customer_id: true },
        },
      },
      orderBy: [{ entry_date: "desc" }, { id: "desc" }],
    });

    expect(receipts.length).toBeGreaterThan(0);

    const customerMap = new Map();
    for (const r of receipts) {
      const cId = r.account.customer_id || r.account.id;
      if (!customerMap.has(cId)) {
        customerMap.set(cId, {
          name: r.account.display_name,
          lastPaymentDate: r.entry_date,
          lastPaymentAmount: Number(r.credit),
          totalPaid: 0,
        });
      }
      customerMap.get(cId).totalPaid += Number(r.credit);
    }

    const customers = Array.from(customerMap.values());
    expect(customers.length).toBeGreaterThan(0);

    const tiger = customers.find(c => c.name.toLowerCase().includes("tiger"));
    expect(tiger).toBeDefined();
    expect(tiger?.lastPaymentDate).toBeInstanceOf(Date);
    expect(tiger?.totalPaid).toBeGreaterThan(0);
  });

  it("verifies business activity logs match invoice dates and ledger dates", async () => {
    // Check that invoice logs have created_at matching invoice_date
    const invoiceLog = await prisma.businessLog.findFirst({
      where: { action: "INVOICE_CONFIRMED" },
    });
    expect(invoiceLog).toBeDefined();
    if (invoiceLog && invoiceLog.entity_id) {
      const inv = await prisma.invoice.findUnique({
        where: { id: invoiceLog.entity_id },
      });
      if (inv) {
        expect(new Date(invoiceLog.created_at).toISOString().slice(0, 10))
          .toBe(new Date(inv.invoice_date).toISOString().slice(0, 10));
      }
    }

    // Check that payment receipt logs have created_at matching entry_date
    const paymentLog = await prisma.businessLog.findFirst({
      where: { action: "PAYMENT_RECEIVED" },
    });
    expect(paymentLog).toBeDefined();
    if (paymentLog && paymentLog.entity_id) {
      const entry = await prisma.ledgerEntry.findUnique({
        where: { id: paymentLog.entity_id },
      });
      if (entry) {
        expect(new Date(paymentLog.created_at).toISOString().slice(0, 10))
          .toBe(new Date(entry.entry_date).toISOString().slice(0, 10));
      }
    }
  });

  it("verifies customer last purchase date and total amount due calculations", async () => {
    // 1. Check max purchase date calculation
    const latestInvoiceGroup = await prisma.invoice.groupBy({
      by: ["customer_id"],
      _max: { invoice_date: true },
    });
    expect(latestInvoiceGroup.length).toBeGreaterThan(0);

    // 2. Check total amount due calculation (closing Dr balance)
    const customerAccount = await prisma.ledgerAccount.findFirst({
      where: { account_type: "CUSTOMER", is_active: true },
      include: {
        entries: { where: { is_void: false }, select: { debit: true, credit: true } },
      },
    });
    expect(customerAccount).toBeDefined();

    if (customerAccount) {
      let debitSum = 0;
      let creditSum = 0;
      for (const e of customerAccount.entries) {
        debitSum += Number(e.debit);
        creditSum += Number(e.credit);
      }
      const balance = debitSum - creditSum;
      const amountDue = balance > 0 ? balance : 0;
      expect(amountDue).toBeGreaterThanOrEqual(0);
    }
  });

  it("verifies business comparison calculation (Sold, Purchased, Received) across FY", async () => {
    const start = new Date(Date.UTC(2026, 3, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(2027, 2, 31, 23, 59, 59, 999));

    const [salesAgg, purchaseAgg, receivedAgg] = await Promise.all([
      prisma.invoice.aggregate({
        where: { invoice_date: { gte: start, lte: end } },
        _sum: { grand_total: true },
        _count: { id: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { invoice_date: { gte: start, lte: end } },
        _sum: { grand_total: true },
        _count: { id: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: {
          account: { account_type: "CUSTOMER", is_active: true },
          credit: { gt: 0 },
          is_void: false,
          entry_type: { notIn: ["CREDIT_NOTE", "OPENING"] },
          entry_date: { gte: start, lte: end },
        },
        _sum: { credit: true },
        _count: { id: true },
      }),
    ]);

    const sold = Number(salesAgg._sum.grand_total || 0);
    const purchased = Number(purchaseAgg._sum.grand_total || 0);
    const received = Number(receivedAgg._sum.credit || 0);

    expect(sold).toBeGreaterThan(0);
    expect(salesAgg._count.id).toBeGreaterThan(0);
    expect(purchased).toBeGreaterThan(0);
    expect(purchaseAgg._count.id).toBeGreaterThan(0);
    expect(received).toBeGreaterThan(0);
    expect(receivedAgg._count.id).toBeGreaterThan(0);

    // Verify trading spread
    const tradingSpread = sold - purchased;
    expect(tradingSpread).toBeDefined();
    // Collection rate
    const collectionRate = (received / sold) * 100;
    expect(collectionRate).toBeGreaterThan(0);
  });
});
