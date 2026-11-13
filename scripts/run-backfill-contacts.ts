import { backfillCustomerContacts } from "../src/lib/customers/contact-sync";
import { prisma } from "../src/lib/db";

async function main() {
  const res = await backfillCustomerContacts();
  console.log("Customer contact backfill result:", res);
}

main().finally(() => prisma.$disconnect());
