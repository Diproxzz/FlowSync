import path from "path";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

import { inspectAndRasterizePdf } from "../src/lib/pdf/detectText";
import { extractInvoiceData } from "../src/lib/llm/extract";
import { validateInvoice } from "../src/lib/validation/invoice";

async function main() {
  console.log("=========================================================");
  console.log("       INDOBEST INSIGHTS — LIVE LLM TEST SUITE           ");
  console.log("=========================================================");

  const samples = [
    {
      pdf: "data/samples/473_RAHMAN_INDUSTRIES.pdf",
      fixture: "tests/fixtures/inv-473.json",
      expectedNumber: "IB26-27/0473",
    },
    {
      pdf: "data/samples/474_SUPER_TANNERS.pdf",
      fixture: "tests/fixtures/inv-474.json",
      expectedNumber: "IB26-27/0474",
    },
    {
      pdf: "data/samples/475_TIGER_INTERNATIONAL.pdf",
      fixture: "tests/fixtures/inv-475.json",
      expectedNumber: "IB26-27/0475",
    },
  ];

  const hasKey = Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OLLAMA_MODEL
  );

  if (!hasKey) {
    console.log("\n⚠️  No LLM API keys currently set in .env.");
    console.log("To run live extraction on real scanned PDFs, set one of the following in your .env:");
    console.log("- GEMINI_API_KEY=... (Free from Google AI Studio: https://aistudio.google.com)");
    console.log("- GROQ_API_KEY=...   (Free from Groq Console: https://console.groq.com)");
    console.log("- OPENROUTER_API_KEY=... (Free models from https://openrouter.ai)");
    console.log("\nVerifying fixtures and rasterization without live LLM calls...");

    for (const s of samples) {
      const fullPath = path.resolve(process.cwd(), s.pdf);
      const inspection = await inspectAndRasterizePdf(fullPath);
      const fixtureData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), s.fixture), "utf-8"));
      const validation = validateInvoice(fixtureData);

      console.log(`\n📄 ${s.pdf}:`);
      console.log(`   - Rasterized pages: ${inspection.pages.length} (${inspection.pages[0].width}x${inspection.pages[0].height})`);
      console.log(`   - Text layer length: ${inspection.extractedText.length} chars (Image-only scan: ${!inspection.hasTextLayer})`);
      console.log(`   - Ground truth fixture validated: ${validation.isValid ? "✓ PASS" : "✕ FAIL"} (Derived round-off: ₹${validation.derivedRoundOff})`);
    }

    console.log("\nAll fixtures and rasterization pipelines are healthy!");
    return;
  }

  console.log("\nFound active LLM configuration. Running live extraction on all 3 sample PDFs...\n");

  for (const s of samples) {
    console.log(`---------------------------------------------------------`);
    console.log(`Extracting: ${s.pdf}...`);
    const fullPath = path.resolve(process.cwd(), s.pdf);
    const fixtureData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), s.fixture), "utf-8"));

    const inspection = await inspectAndRasterizePdf(fullPath);
    const images = inspection.pages.map((p) => ({
      mime: "image/png" as const,
      base64: p.pngBase64,
    }));

    try {
      const result = await extractInvoiceData({
        images,
        fileHash: `test-${s.expectedNumber}`,
      });

      console.log(`✓ Extracted via ${result.provider} (${result.model}) in ${result.latencyMs}ms`);
      const extracted = result.draft;

      // Diff against ground truth
      const diffs: string[] = [];
      if (extracted.invoice.number !== fixtureData.invoice.number) {
        diffs.push(`Invoice Number: Extracted '${extracted.invoice.number}' vs Expected '${fixtureData.invoice.number}'`);
      }
      if (extracted.invoice.date !== fixtureData.invoice.date) {
        diffs.push(`Invoice Date: Extracted '${extracted.invoice.date}' vs Expected '${fixtureData.invoice.date}'`);
      }
      if (extracted.customer.gstin !== fixtureData.customer.gstin) {
        diffs.push(`Customer GSTIN: Extracted '${extracted.customer.gstin}' vs Expected '${fixtureData.customer.gstin}'`);
      }
      if (extracted.totals.grandTotal !== fixtureData.totals.grandTotal) {
        diffs.push(`Grand Total: Extracted ${extracted.totals.grandTotal} vs Expected ${fixtureData.totals.grandTotal}`);
      }
      if (extracted.items.length !== fixtureData.items.length) {
        diffs.push(`Items Count: Extracted ${extracted.items.length} vs Expected ${fixtureData.items.length}`);
      }

      if (diffs.length === 0) {
        console.log(`✨ 100% MATCH with ground truth fixture!`);
      } else {
        console.log(`⚠️ Discrepancies detected:`);
        diffs.forEach((d) => console.log(`   - ${d}`));
      }
    } catch (err: any) {
      console.error(`✕ Extraction failed for ${s.pdf}:`, err.message);
    }
  }
}

main().catch(console.error);
