import { Prisma } from "@prisma/client";
import { prisma } from "../db";

/**
 * Calculates the 2-digit financial year string (YY-YY) from a given date.
 * Financial year runs from 1st April to 31st March.
 * E.g.
 * 16-10-2026 -> "26-27"
 * 01-04-2027 -> "27-28"
 * 15-02-2027 -> "26-27"
 */
export function getFinancialYearCode(dateInput?: Date | string | null): string {
  const date = dateInput
    ? typeof dateInput === "string"
      ? new Date(dateInput)
      : dateInput
    : new Date();

  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = April

  let startYear: number;
  let endYear: number;

  if (month >= 3) {
    // April to December
    startYear = year;
    endYear = year + 1;
  } else {
    // January to March
    startYear = year - 1;
    endYear = year;
  }

  const startYY = (startYear % 100).toString().padStart(2, "0");
  const endYY = (endYear % 100).toString().padStart(2, "0");

  return `${startYY}-${endYY}`;
}

export function formatInvoiceNumber(fy: string, seq: number): string {
  const paddedSeq = seq.toString().padStart(4, "0");
  return `IB${fy}/${paddedSeq}`;
}

async function getMaxInvoiceSequence(
  db: Prisma.TransactionClient | typeof prisma,
  fy: string
): Promise<number> {
  const prefix = `IB${fy}/`;
  const invoices = await db.invoice.findMany({
    where: {
      invoice_number: {
        startsWith: prefix,
      },
    },
    select: { invoice_number: true },
  });

  let maxSeq = 0;
  const regex = new RegExp(`^IB${fy}/(\\d+)`);
  for (const inv of invoices) {
    const match = inv.invoice_number.match(regex);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxSeq) {
        maxSeq = val;
      }
    }
  }
  return maxSeq;
}

/**
 * Gets the next running invoice number for a given date/FY without consuming it.
 * Reads the latest recorded sequence from Setting and checks existing Invoices.
 */
export async function peekNextInvoiceNumber(dateInput?: Date | string | null): Promise<{
  invoiceNumber: string;
  financialYear: string;
  sequence: number;
}> {
  const fy = getFinancialYearCode(dateInput);
  const settingKey = `invoice_generator_seq_${fy}`;

  const [setting, maxDbSeq] = await Promise.all([
    prisma.setting.findUnique({ where: { key: settingKey } }),
    getMaxInvoiceSequence(prisma, fy),
  ]);

  const settingSeq =
    setting && typeof (setting.value as any)?.last_sequence === "number"
      ? ((setting.value as any).last_sequence as number)
      : 0;

  const nextSeq = Math.max(settingSeq, maxDbSeq) + 1;

  return {
    invoiceNumber: formatInvoiceNumber(fy, nextSeq),
    financialYear: fy,
    sequence: nextSeq,
  };
}

/**
 * Acquires a row-level lock (FOR UPDATE) on the financial-year sequence setting row.
 */
export async function lockSequenceSettingRow(
  tx: Prisma.TransactionClient,
  fy: string
): Promise<number> {
  const settingKey = `invoice_generator_seq_${fy}`;
  const defaultValue = JSON.stringify({
    last_sequence: 0,
    updated_at: new Date().toISOString(),
  });

  await tx.$executeRaw`
    INSERT INTO settings ("key", "value")
    VALUES (${settingKey}, ${defaultValue}::jsonb)
    ON CONFLICT ("key") DO NOTHING
  `;

  const lockedRows = await tx.$queryRaw<Array<{ key: string; value: any }>>`
    SELECT "key", "value" FROM settings WHERE "key" = ${settingKey} FOR UPDATE
  `;

  const val = lockedRows[0]?.value as any;
  return typeof val?.last_sequence === "number" ? val.last_sequence : 0;
}

/**
 * Advances the sequence setting inside an already-open transaction using FOR UPDATE locking.
 */
export async function advanceInvoiceSequence(
  tx: Prisma.TransactionClient,
  fy: string,
  seqVal: number
): Promise<void> {
  const settingKey = `invoice_generator_seq_${fy}`;
  const currentLast = await lockSequenceSettingRow(tx, fy);
  if (seqVal >= currentLast) {
    await tx.setting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: { last_sequence: seqVal, updated_at: new Date().toISOString() },
      },
      update: {
        value: { last_sequence: seqVal, updated_at: new Date().toISOString() },
      },
    });
  }
}

/**
 * Commits and consumes the next running invoice number inside a safe transaction
 * guarded by a row-level FOR UPDATE lock. Only called when an invoice is actually saved.
 */
export async function commitNextInvoiceNumber(
  dateInput?: Date | string | null,
  outerTx?: Prisma.TransactionClient
): Promise<{
  invoiceNumber: string;
  financialYear: string;
  sequence: number;
}> {
  const fy = getFinancialYearCode(dateInput);
  const settingKey = `invoice_generator_seq_${fy}`;

  const run = async (tx: Prisma.TransactionClient) => {
    const settingSeq = await lockSequenceSettingRow(tx, fy);
    const maxDbSeq = await getMaxInvoiceSequence(tx, fy);
    const nextSeq = Math.max(settingSeq, maxDbSeq) + 1;

    await tx.setting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: { last_sequence: nextSeq, updated_at: new Date().toISOString() },
      },
      update: {
        value: { last_sequence: nextSeq, updated_at: new Date().toISOString() },
      },
    });

    return {
      invoiceNumber: formatInvoiceNumber(fy, nextSeq),
      financialYear: fy,
      sequence: nextSeq,
    };
  };

  if (outerTx) {
    return await run(outerTx);
  }
  return await prisma.$transaction(run);
}
