import path from "path";
import ExcelJS from "exceljs";
import { PrismaClient, MovementType } from "@prisma/client";
import { Decimal } from "decimal.js";

const prisma = new PrismaClient();

interface SeedOptions {
  withLegacyTransactions?: boolean;
}

export async function seedFromXlsx(options: SeedOptions = {}) {
  const xlsxPath = path.resolve(process.cwd(), "data/seed/Leather_Chemicals_Stock_System_2026-27.xlsx");
  console.log(`Reading workbook from: ${xlsxPath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);

  const productMasterSheet = workbook.getWorksheet("Product_Master");
  if (!productMasterSheet) {
    throw new Error("Worksheet 'Product_Master' not found in workbook");
  }

  console.log("Seeding products and opening stock...");
  let productCount = 0;
  let totalOpeningStock = new Decimal(0);

  const productMap = new Map<string, string>(); // code -> id
  const productRows: Array<{
    code: string;
    name: string;
    category: string | null;
    openingStock: Decimal;
    packSize: Decimal | null;
    purchaseRate: Decimal | null;
    saleRate: Decimal | null;
    reorderLevel: Decimal | null;
  }> = [];

  // Iterate rows in Product_Master (skip header row 1)
  productMasterSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const codeVal = row.getCell(1).value;
    if (!codeVal) return;

    const code = String(codeVal).trim();
    if (!code || code.toUpperCase() === "TOTAL") return;

    const categoryVal = row.getCell(2).value;
    const category = categoryVal ? String(categoryVal).trim() : null;

    const openingStockVal = row.getCell(3).value;
    const openingStock = openingStockVal !== null && openingStockVal !== undefined && !isNaN(Number(openingStockVal))
      ? new Decimal(Number(openingStockVal))
      : new Decimal(0);

    const packSizeVal = row.getCell(4).value;
    const packSize = packSizeVal !== null && packSizeVal !== undefined && !isNaN(Number(packSizeVal))
      ? new Decimal(Number(packSizeVal))
      : null;

    const purchaseRateVal = row.getCell(5).value;
    const purchaseRate = purchaseRateVal !== null && purchaseRateVal !== undefined && !isNaN(Number(purchaseRateVal))
      ? new Decimal(Number(purchaseRateVal))
      : null;

    const saleRateVal = row.getCell(6).value;
    const saleRate = saleRateVal !== null && saleRateVal !== undefined && !isNaN(Number(saleRateVal))
      ? new Decimal(Number(saleRateVal))
      : null;

    const reorderVal = row.getCell(7).value;
    const reorderLevel = reorderVal !== null && reorderVal !== undefined && !isNaN(Number(reorderVal))
      ? new Decimal(Number(reorderVal))
      : null;

    productRows.push({
      code,
      name: code,
      category,
      openingStock,
      packSize,
      purchaseRate,
      saleRate,
      reorderLevel,
    });
  });

  for (const item of productRows) {
    const product = await prisma.product.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        category: item.category,
        pack_size_kg: item.packSize ? item.packSize.toFixed(2) : null,
        std_purchase_rate: item.purchaseRate ? item.purchaseRate.toFixed(2) : null,
        std_sale_rate: item.saleRate ? item.saleRate.toFixed(2) : null,
        reorder_level_kg: item.reorderLevel ? item.reorderLevel.toFixed(3) : null,
        source: "MASTER",
        is_active: true,
      },
      create: {
        code: item.code,
        name: item.name,
        category: item.category,
        pack_size_kg: item.packSize ? item.packSize.toFixed(2) : null,
        std_purchase_rate: item.purchaseRate ? item.purchaseRate.toFixed(2) : null,
        std_sale_rate: item.saleRate ? item.saleRate.toFixed(2) : null,
        reorder_level_kg: item.reorderLevel ? item.reorderLevel.toFixed(3) : null,
        source: "MASTER",
        is_active: true,
      },
    });

    productMap.set(item.code, product.id);
    productCount++;
    totalOpeningStock = totalOpeningStock.plus(item.openingStock);

    // Opening stock movement
    const existingOpening = await prisma.stockMovement.findFirst({
      where: {
        product_id: product.id,
        type: "OPENING",
        source: "SEED_OPENING",
      },
    });

    if (existingOpening) {
      await prisma.stockMovement.update({
        where: { id: existingOpening.id },
        data: {
          qty_kg: item.openingStock.toFixed(3),
          movement_date: new Date("2026-04-01"),
        },
      });
    } else {
      await prisma.stockMovement.create({
        data: {
          product_id: product.id,
          type: "OPENING",
          source: "SEED_OPENING",
          qty_kg: item.openingStock.toFixed(3),
          movement_date: new Date("2026-04-01"),
          note: "Opening stock as on 01.04.2026",
        },
      });
    }
  }

  console.log(`✅ Seeded ${productCount} products.`);
  console.log(`✅ Total Opening Stock: ${totalOpeningStock.toFixed(3)} kg (Workbook expected: 66590.300 kg).`);

  if (options.withLegacyTransactions) {
    const transactionsSheet = workbook.getWorksheet("Transactions");
    if (!transactionsSheet) {
      throw new Error("Worksheet 'Transactions' not found in workbook");
    }

    console.log("Seeding legacy transactions...");
    // Clear previous legacy movements to maintain idempotency
    await prisma.stockMovement.deleteMany({
      where: { source: "LEGACY_XLSX" },
    });

    let txnCount = 0;
    const legacyMovements: any[] = [];

    transactionsSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const txnId = row.getCell(1).value;
      const dateRaw = row.getCell(2).value;
      const typeRaw = String(row.getCell(4).value || "").trim().toUpperCase();
      const invoiceNo = row.getCell(5).value;
      const party = row.getCell(6).value;
      const productCode = String(row.getCell(7).value || "").trim();
      const qtyVal = row.getCell(8).value;

      if (!productCode || qtyVal === null || qtyVal === undefined) return;
      const productId = productMap.get(productCode);
      if (!productId) {
        console.warn(`Row ${rowNumber}: Product code '${productCode}' not found in Product_Master.`);
        return;
      }

      let type: MovementType = MovementType.ADJUSTMENT;
      if (typeRaw === "PURCHASE") type = MovementType.PURCHASE;
      else if (typeRaw === "SALE") type = MovementType.SALE;
      else if (typeRaw === "ADJUSTMENT") type = MovementType.ADJUSTMENT;

      let movementDate = new Date("2026-04-01");
      if (dateRaw instanceof Date && !isNaN(dateRaw.getTime())) {
        movementDate = dateRaw;
      } else if (typeof dateRaw === "string" && dateRaw.trim()) {
        const parts = dateRaw.trim().split(/[-.]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD
            movementDate = new Date(dateRaw);
          } else {
            // DD.MM.YY or DD.MM.YYYY
            let year = parseInt(parts[2], 10);
            if (year < 100) year += 2000;
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[0], 10);
            movementDate = new Date(year, month, day);
          }
        }
      }

      const qty = new Decimal(Number(qtyVal));

      legacyMovements.push({
        product_id: productId,
        movement_date: movementDate,
        type,
        qty_kg: qty.toFixed(3),
        source: "LEGACY_XLSX" as const,
        party_text: party ? String(party).trim() : null,
        note: invoiceNo ? `Inv: ${invoiceNo}` : txnId ? `Txn: ${txnId}` : "Legacy transaction",
      });
    });

    // Batch insert
    for (const chunk of chunkArray(legacyMovements, 100)) {
      await prisma.stockMovement.createMany({
        data: chunk,
      });
      txnCount += chunk.length;
    }

    console.log(`✅ Seeded ${txnCount} legacy transactions.`);
  }

  // Also seed default Settings if not present
  await seedDefaultSettings();
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function seedDefaultSettings() {
  const defaultSettings = [
    {
      key: "company",
      value: {
        name: "INDOBEST",
        gstin: "19AVZPC2361G1ZA",
        address: "19/10/2, GOBINDA KHATICK ROAD, KOLKATA-700046, WEST BENGAL",
      },
    },
    { key: "fiscal_year_start_month", value: 4 }, // April
    { key: "lapsed_days", value: 60 },
    { key: "fuzzy_threshold", value: 0.85 },
    { key: "provider_order", value: ["gemini", "openrouter", "groq", "ollama"] },
  ];

  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: {
        key: s.key,
        value: s.value,
      },
    });
  }
  console.log("✅ Seeded default settings.");
}

if (require.main === module) {
  const withLegacy = process.argv.includes("--with-legacy-transactions");
  seedFromXlsx({ withLegacyTransactions: withLegacy })
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
