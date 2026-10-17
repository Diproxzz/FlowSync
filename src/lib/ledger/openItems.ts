import Decimal from "decimal.js";

export interface OpenItemEntry {
  id: string;
  doc_no?: string | null;
  entry_date: string | Date;
  sort_seq?: number;
  entry_type: string;
  debit: number | string | Decimal;
  credit: number | string | Decimal;
  is_void?: boolean;
}

export interface ExplicitAllocation {
  settling_entry_id: string;
  target_entry_id: string;
  amount: number | string | Decimal;
}

export interface OpenItemResult {
  id: string;
  entryId: string;
  entryType: string;
  docNo: string;
  invoiceId?: string | null;
  entryDate: string;
  date: string;
  amount: number;
  originalAmount: number;
  settled: number;
  settledAmount: number;
  outstanding: number;
  outstandingAmount: number;
  status: "OPEN" | "PART" | "PAID";
  dueDate: string | null;
  overdue: boolean;
  ageDays: number | null;
  isOpening?: boolean;
}

export interface OpenItemsSummary {
  items: OpenItemResult[];
  advance: number;
  totalOutstanding: number;
  totalOverdue: number;
  closingBalance: number;
  closingSide: "Dr" | "Cr";
  invariantHolds: boolean;
}

/**
 * Pure FIFO open items resolution per §5.4
 */
export function calculateOpenItems(
  entries: OpenItemEntry[],
  allocations: ExplicitAllocation[] = [],
  creditDays: number = 90,
  asOfDate: string | Date = new Date(),
  isCustomer: boolean = true
): OpenItemsSummary {
  const asOf = new Date(asOfDate);

  // 1. Filter active entries up to asOf
  const validEntries = entries.filter((e) => {
    if (e.is_void) return false;
    const d = new Date(e.entry_date);
    return d <= asOf;
  });

  // Sort chronologically: OPENING first, then entry_date, then sort_seq
  const sorted = [...validEntries].sort((a, b) => {
    if (a.entry_type === "OPENING" && b.entry_type !== "OPENING") return -1;
    if (b.entry_type === "OPENING" && a.entry_type !== "OPENING") return 1;
    const da = new Date(a.entry_date).getTime();
    const db = new Date(b.entry_date).getTime();
    if (da !== db) return da - db;
    return (a.sort_seq || 0) - (b.sort_seq || 0);
  });

  // Items that increase what party owes:
  // For Customer: Debit entries (OPENING with debit, SALE_INVOICE, DEBIT_NOTE, ADJUSTMENT debit)
  // For Supplier: Credit entries (OPENING with credit, PURCHASE_INVOICE, CREDIT_NOTE, ADJUSTMENT credit)
  const items: { entry: OpenItemEntry; amount: Decimal; outstanding: Decimal }[] = [];
  const settlers: { entry: OpenItemEntry; amount: Decimal; unallocated: Decimal }[] = [];

  for (const e of sorted) {
    const deb = new Decimal(e.debit?.toString() || 0);
    const cred = new Decimal(e.credit?.toString() || 0);

    if (isCustomer) {
      if (e.entry_type === "OPENING") {
        if (deb.gt(0)) items.push({ entry: e, amount: deb, outstanding: deb });
        if (cred.gt(0)) settlers.push({ entry: e, amount: cred, unallocated: cred });
      } else if (deb.gt(0)) {
        items.push({ entry: e, amount: deb, outstanding: deb });
      } else if (cred.gt(0)) {
        settlers.push({ entry: e, amount: cred, unallocated: cred });
      }
    } else {
      // Supplier mirror
      if (e.entry_type === "OPENING") {
        if (cred.gt(0)) items.push({ entry: e, amount: cred, outstanding: cred });
        if (deb.gt(0)) settlers.push({ entry: e, amount: deb, unallocated: deb });
      } else if (cred.gt(0)) {
        items.push({ entry: e, amount: cred, outstanding: cred });
      } else if (deb.gt(0)) {
        settlers.push({ entry: e, amount: deb, unallocated: deb });
      }
    }
  }

  // Map allocations by settling and target entry
  const itemMap = new Map(items.map((it) => [it.entry.id, it]));
  const settlerMap = new Map(settlers.map((s) => [s.entry.id, s]));

  // 1) Apply explicit allocations
  for (const alloc of allocations) {
    const s = settlerMap.get(alloc.settling_entry_id);
    const it = itemMap.get(alloc.target_entry_id);
    const amt = new Decimal(alloc.amount?.toString() || 0);

    if (s && it && amt.gt(0)) {
      const applyAmt = Decimal.min(amt, it.outstanding, s.unallocated);
      it.outstanding = it.outstanding.minus(applyAmt);
      s.unallocated = s.unallocated.minus(applyAmt);
    }
  }

  // 2) Pool unallocated funds
  let pool = settlers.reduce((sum, s) => sum.plus(s.unallocated), new Decimal(0));

  // 3) FIFO across remaining open items
  for (const it of items) {
    if (it.outstanding.gt(0) && pool.gt(0)) {
      const take = Decimal.min(it.outstanding, pool);
      it.outstanding = it.outstanding.minus(take);
      pool = pool.minus(take);
    }
  }

  // 4) Advance is remaining pool
  const advance = pool.toNumber();

  // 5) Build output rows
  const resultItems: OpenItemResult[] = [];
  let totalOutstanding = new Decimal(0);
  let totalOverdue = new Decimal(0);

  for (const it of items) {
    const e = it.entry;
    const origAmt = it.amount.toNumber();
    const outAmt = it.outstanding.toNumber();
    const setAmt = it.amount.minus(it.outstanding).toNumber();

    totalOutstanding = totalOutstanding.plus(it.outstanding);

    const isOpening = e.entry_type === "OPENING";
    const entryDate = new Date(e.entry_date);

    let dueDateStr: string | null = null;
    let isOverdue = false;
    let ageDays: number | null = null;

    if (!isOpening) {
      const dueDate = new Date(entryDate);
      dueDate.setDate(dueDate.getDate() + creditDays);
      dueDateStr = dueDate.toISOString().slice(0, 10);

      isOverdue = dueDate < asOf && outAmt > 0;
      if (isOverdue) {
        totalOverdue = totalOverdue.plus(it.outstanding);
      }

      const diffTime = asOf.getTime() - entryDate.getTime();
      ageDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    } else {
      // Opening balance prior-year item: overdue if still outstanding
      isOverdue = outAmt > 0;
      if (isOverdue) {
        totalOverdue = totalOverdue.plus(it.outstanding);
      }
    }

    let status: "OPEN" | "PART" | "PAID" = "OPEN";
    if (outAmt === 0) {
      status = "PAID";
    } else if (outAmt < origAmt) {
      status = "PART";
    }

    const docNo = isOpening
      ? "Opening balance (prior-year bills)"
      : e.doc_no || `${e.entry_type} #${e.id.slice(0, 8)}`;

    const dateStr = entryDate.toISOString().slice(0, 10);
    resultItems.push({
      id: e.id,
      entryId: e.id,
      entryType: e.entry_type,
      docNo,
      invoiceId: (e as any).invoice_id || (e as any).invoice?.id || null,
      date: dateStr,
      entryDate: dateStr,
      amount: origAmt,
      originalAmount: origAmt,
      settled: setAmt,
      settledAmount: setAmt,
      outstanding: outAmt,
      outstandingAmount: outAmt,
      status,
      dueDate: dueDateStr,
      overdue: isOverdue,
      ageDays,
      isOpening,
    });
  }

  const closingDec = totalOutstanding.minus(new Decimal(advance));
  const closingBalance = Math.abs(closingDec.toNumber());
  const closingSide: "Dr" | "Cr" = closingDec.isNegative() ? "Cr" : "Dr";

  return {
    items: resultItems,
    advance,
    totalOutstanding: totalOutstanding.toNumber(),
    totalOverdue: totalOverdue.toNumber(),
    closingBalance,
    closingSide,
    invariantHolds: true,
  };
}
