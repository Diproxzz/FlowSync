export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";

interface ParsedProductRow {
  code: string;
  name: string;
  category: string | null;
  defaultHsn: string | null;
  packSizeKg: number | null;
  stdPurchaseRate: number | null;
  stdSaleRate: number | null;
  reorderLevelKg: number | null;
  openingStockKg: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const isDryRun = request.nextUrl.searchParams.get("dryRun") === "1" ||
      request.nextUrl.searchParams.get("dryRun") === "true";

    const contentType = request.headers.get("content-type") || "";
    const parsedRows: ParsedProductRow[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: { code: "NO_FILE", message: "No file provided" } },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = new ExcelJS.Workbook();

      if (file.name.endsWith(".csv")) {
        const stream = require("stream");
        const bufferStream = new stream.PassThrough();
        bufferStream.end(buffer);
        await workbook.csv.read(bufferStream);
      } else {
        await workbook.xlsx.load(buffer as any);
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return NextResponse.json(
          { error: { code: "EMPTY_FILE", message: "File has no worksheets" } },
          { status: 400 }
        );
      }

      // Column mapping heuristic based on header row
      const headers: string[] = [];
      worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
        headers.push(String(cell.value || "").trim().toLowerCase());
      });

      const getColIndex = (keywords: string[]): number => {
        return headers.findIndex((h) => keywords.some((k) => h.includes(k))) + 1;
      };

      const codeCol = getColIndex(["code", "product"]);
      const nameCol = getColIndex(["name", "description"]);
      const catCol = getColIndex(["cat"]);
      const hsnCol = getColIndex(["hsn"]);
      const packCol = getColIndex(["pack"]);
      const purCol = getColIndex(["purchase", "buy", "cost"]);
      const saleCol = getColIndex(["sale", "sell"]);
      const reorderCol = getColIndex(["reorder"]);
      const openingCol = getColIndex(["opening", "start"]);

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;

        const codeVal = codeCol > 0 ? row.getCell(codeCol).value : row.getCell(1).value;
        if (!codeVal) return;

        const code = String(codeVal).trim().toUpperCase();
        if (!code || code === "TOTAL" || code.startsWith("SUM")) return;

        const nameVal = nameCol > 0 ? row.getCell(nameCol).value : null;
        const name = nameVal ? String(nameVal).trim() : code;

        const categoryVal = catCol > 0 ? row.getCell(catCol).value : null;
        const category = categoryVal ? String(categoryVal).trim() : null;

        const hsnVal = hsnCol > 0 ? row.getCell(hsnCol).value : null;
        const defaultHsn = hsnVal ? String(hsnVal).trim() : null;

        const getNum = (col: number) => {
          if (col <= 0) return null;
          const v = row.getCell(col).value;
          return v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null;
        };

        parsedRows.push({
          code,
          name,
          category,
          defaultHsn,
          packSizeKg: getNum(packCol),
          stdPurchaseRate: getNum(purCol),
          stdSaleRate: getNum(saleCol),
          reorderLevelKg: getNum(reorderCol),
          openingStockKg: getNum(openingCol),
        });
      });
    } else {
      // JSON body
      const body = await request.json();
      if (Array.isArray(body.rows)) {
        for (const r of body.rows) {
          if (!r.code) continue;
          parsedRows.push({
            code: String(r.code).trim().toUpperCase(),
            name: r.name ? String(r.name).trim() : String(r.code).trim().toUpperCase(),
            category: r.category ? String(r.category).trim() : null,
            defaultHsn: r.default_hsn || r.defaultHsn || null,
            packSizeKg: r.pack_size_kg !== undefined ? Number(r.pack_size_kg) : null,
            stdPurchaseRate: r.std_purchase_rate !== undefined ? Number(r.std_purchase_rate) : null,
            stdSaleRate: r.std_sale_rate !== undefined ? Number(r.std_sale_rate) : null,
            reorderLevelKg: r.reorder_level_kg !== undefined ? Number(r.reorder_level_kg) : null,
            openingStockKg: r.opening_stock_kg !== undefined ? Number(r.opening_stock_kg) : null,
          });
        }
      }
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: { code: "NO_ROWS", message: "No valid product rows found in input" } },
        { status: 400 }
      );
    }

    // Compare with database
    const existingProducts = await prisma.product.findMany({
      where: { code: { in: parsedRows.map((r) => r.code) } },
    });
    const existingMap = new Map(existingProducts.map((p) => [p.code, p]));

    const previewRows = parsedRows.map((row) => {
      const existing = existingMap.get(row.code);
      const action = existing ? "UPDATE" : "CREATE";

      return {
        code: row.code,
        name: row.name,
        category: row.category,
        packSizeKg: row.packSizeKg,
        stdPurchaseRate: row.stdPurchaseRate,
        stdSaleRate: row.stdSaleRate,
        reorderLevelKg: row.reorderLevelKg,
        openingStockKg: row.openingStockKg,
        action,
        existingId: existing?.id,
      };
    });

    const summary = {
      total: previewRows.length,
      creates: previewRows.filter((r) => r.action === "CREATE").length,
      updates: previewRows.filter((r) => r.action === "UPDATE").length,
    };

    if (isDryRun) {
      return NextResponse.json({
        dryRun: true,
        summary,
        rows: previewRows,
      });
    }

    // Execute actual import in transaction
    let createdCount = 0;
    let updatedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of previewRows) {
        if (row.action === "CREATE") {
          const product = await tx.product.create({
            data: {
              code: row.code,
              name: row.name,
              category: row.category,
              pack_size_kg: row.packSizeKg !== null ? new Prisma.Decimal(row.packSizeKg) : null,
              std_purchase_rate: row.stdPurchaseRate !== null ? new Prisma.Decimal(row.stdPurchaseRate) : null,
              std_sale_rate: row.stdSaleRate !== null ? new Prisma.Decimal(row.stdSaleRate) : null,
              reorder_level_kg: row.reorderLevelKg !== null ? new Prisma.Decimal(row.reorderLevelKg) : null,
              source: "MASTER",
              is_active: true,
            },
          });

          if (row.openingStockKg && row.openingStockKg > 0) {
            await tx.stockMovement.create({
              data: {
                product_id: product.id,
                type: "OPENING",
                source: "SEED_OPENING",
                qty_kg: new Prisma.Decimal(row.openingStockKg),
                movement_date: new Date("2026-04-01"),
                note: "Opening stock from import",
              },
            });
          }
          createdCount++;
        } else if (row.action === "UPDATE" && row.existingId) {
          await tx.product.update({
            where: { id: row.existingId },
            data: {
              name: row.name,
              category: row.category,
              pack_size_kg: row.packSizeKg !== null ? new Prisma.Decimal(row.packSizeKg) : null,
              std_purchase_rate: row.stdPurchaseRate !== null ? new Prisma.Decimal(row.stdPurchaseRate) : null,
              std_sale_rate: row.stdSaleRate !== null ? new Prisma.Decimal(row.stdSaleRate) : null,
              reorder_level_kg: row.reorderLevelKg !== null ? new Prisma.Decimal(row.reorderLevelKg) : null,
            },
          });
          updatedCount++;
        }
      }
    });

    return NextResponse.json({
      dryRun: false,
      summary: { total: previewRows.length, created: createdCount, updated: updatedCount },
      success: true,
    });
  } catch (error) {
    console.error("Error importing products:", error);
    return NextResponse.json(
      { error: { code: "IMPORT_FAILED", message: "Failed to process import" } },
      { status: 500 }
    );
  }
}
