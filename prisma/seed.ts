import { seedFromXlsx } from "../scripts/seed-from-xlsx";

async function main() {
  await seedFromXlsx({ withLegacyTransactions: true });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
