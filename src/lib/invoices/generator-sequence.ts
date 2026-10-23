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

/**
 * Gets the next running invoice number for a given date/FY without consuming it.
 * Reads the latest recorded sequence from Setting or checks existing Invoices.
 */
export async function peekNextInvoiceNumber(dateInput?: Date | string | null): Promise<{
  invoiceNumber: string;
  financialYear: string;
  sequence: number;
}> {
  const fy = getFinancialYearCode(dateInput);
  const settingKey = `invoice_generator_seq_${fy}`;

  // 1. Check setting
  const setting = await prisma.setting.findUnique({
    where: { key: settingKey },
  });

  let nextSeq = 1;

  if (setting && typeof (setting.value as any)?.last_sequence === "number") {
    nextSeq = ((setting.value as any).last_sequence as number) + 1;
  } else {
    // 2. Fallback: inspect invoices table for any invoices starting with IB{fy}/
    const prefix = `IB${fy}/`;
    const invoices = await prisma.invoice.findMany({
      where: {
        invoice_number: {
          startsWith: prefix,
        },
      },
      select: { invoice_number: true },
    });

    let maxSeq = 0;
    for (const inv of invoices) {
      const match = inv.invoice_number.match(new RegExp(`^IB${fy}/(\\d+)`));
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > maxSeq) {
          maxSeq = val;
        }
      }
    }

    nextSeq = maxSeq > 0 ? maxSeq + 1 : 1;
  }

  return {
    invoiceNumber: formatInvoiceNumber(fy, nextSeq),
    financialYear: fy,
    sequence: nextSeq,
  };
}

/**
 * Commits and consumes the next running invoice number inside a safe transaction.
 * Only called when an invoice is actually saved.
 */
export async function commitNextInvoiceNumber(dateInput?: Date | string | null): Promise<{
  invoiceNumber: string;
  financialYear: string;
  sequence: number;
}> {
  const fy = getFinancialYearCode(dateInput);
  const settingKey = `invoice_generator_seq_${fy}`;

  return await prisma.$transaction(async (tx) => {
    const setting = await tx.setting.findUnique({
      where: { key: settingKey },
    });

    let nextSeq = 1;

    if (setting && typeof (setting.value as any)?.last_sequence === "number") {
      nextSeq = ((setting.value as any).last_sequence as number) + 1;
    } else {
      const prefix = `IB${fy}/`;
      const invoices = await tx.invoice.findMany({
        where: {
          invoice_number: {
            startsWith: prefix,
          },
        },
        select: { invoice_number: true },
      });

      let maxSeq = 0;
      for (const inv of invoices) {
        const match = inv.invoice_number.match(new RegExp(`^IB${fy}/(\\d+)`));
        if (match) {
          const val = parseInt(match[1], 10);
          if (!isNaN(val) && val > maxSeq) {
            maxSeq = val;
          }
        }
      }

      nextSeq = maxSeq > 0 ? maxSeq + 1 : 1;
    }

    // Persist consumed sequence in Setting table
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
  });
}
