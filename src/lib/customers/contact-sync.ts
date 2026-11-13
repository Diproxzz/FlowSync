import { prisma } from "@/lib/db";

/**
 * Extracts phone numbers and email addresses from raw text (addresses, notes, invoices).
 */
export function extractContactsFromText(text: string | null | undefined): {
  phone?: string;
  secondaryPhone?: string;
  email?: string;
} {
  if (!text) return {};

  const result: { phone?: string; secondaryPhone?: string; email?: string } = {};

  // Email regex
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    result.email = emailMatch[0].trim().toLowerCase();
  }

  // 10-digit Indian phone regex (or with +91)
  const phoneRegex = /(?:\+?91[\s-]*)?([6-9]\d{9})\b/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = phoneRegex.exec(text)) !== null) {
    if (!matches.includes(m[1])) {
      matches.push(m[1]);
    }
  }

  if (matches.length > 0) {
    result.phone = matches[0];
  }
  if (matches.length > 1) {
    result.secondaryPhone = matches[1];
  }

  return result;
}

/**
 * Backfills customer contact details from customer_meta settings and invoice addresses/snapshots.
 */
export async function backfillCustomerContacts() {
  const [customers, metaSettings] = await Promise.all([
    prisma.customer.findMany({
      include: {
        invoices: {
          select: {
            customer_name_snapshot: true,
            warnings: true,
          },
          take: 5,
        },
      },
    }),
    prisma.setting.findMany({
      where: { key: { startsWith: "customer_meta_" } },
    }),
  ]);

  const metaMap = new Map<string, any>();
  metaSettings.forEach((s) => {
    const custId = s.key.replace("customer_meta_", "");
    metaMap.set(custId, s.value);
  });

  let updatedCount = 0;

  for (const c of customers) {
    let newPhone = c.phone;
    let newSecondary = c.secondary_phone;
    let newEmail = c.email;
    let needsUpdate = false;

    // 1. Check customer_meta setting
    const meta = metaMap.get(c.id);
    if (!newPhone && meta?.phone && typeof meta.phone === "string" && meta.phone.trim()) {
      newPhone = meta.phone.trim();
      needsUpdate = true;
    }

    // 2. Check customer address
    if ((!newPhone || !newEmail) && c.address) {
      const extracted = extractContactsFromText(c.address);
      if (!newPhone && extracted.phone) {
        newPhone = extracted.phone;
        needsUpdate = true;
      }
      if (!newSecondary && extracted.secondaryPhone) {
        newSecondary = extracted.secondaryPhone;
        needsUpdate = true;
      }
      if (!newEmail && extracted.email) {
        newEmail = extracted.email;
        needsUpdate = true;
      }
    }

    // 3. Check invoice snapshots / warnings
    if (!newPhone || !newEmail) {
      for (const inv of c.invoices) {
        const warningsStr = typeof inv.warnings === "object" ? JSON.stringify(inv.warnings) : "";
        const extracted = extractContactsFromText(warningsStr);
        if (!newPhone && extracted.phone) {
          newPhone = extracted.phone;
          needsUpdate = true;
        }
        if (!newEmail && extracted.email) {
          newEmail = extracted.email;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      await prisma.customer.update({
        where: { id: c.id },
        data: {
          phone: newPhone,
          secondary_phone: newSecondary,
          email: newEmail,
        },
      });
      updatedCount++;
    }
  }

  return { total: customers.length, updated: updatedCount };
}
