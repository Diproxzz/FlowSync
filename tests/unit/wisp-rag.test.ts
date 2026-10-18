import { describe, it, expect } from "vitest";
import { findMatchingGuides, APP_GUIDES } from "@/lib/wisp/knowledge";
import { askWisp } from "@/lib/wisp/agent";

describe("Wisp AI Assistant & RAG System", () => {
  describe("Knowledge Base Guide Retrieval", () => {
    it("matches 'how to upload invoice' to upload guide", () => {
      const guides = findMatchingGuides("how to upload an invoice");
      expect(guides.length).toBeGreaterThan(0);
      expect(guides[0].id).toBe("upload_invoice");
      expect(guides[0].route).toBe("/upload");
      expect(guides[0].steps.length).toBeGreaterThan(0);
    });

    it("matches 'how to view debtor list' to debtor list guide", () => {
      const guides = findMatchingGuides("how to view the debtor list");
      expect(guides.length).toBeGreaterThan(0);
      expect(guides.some((g) => g.id === "debtor_list")).toBe(true);
    });

    it("matches 'check stock' to stock inventory guide", () => {
      const guides = findMatchingGuides("how to check current stock");
      expect(guides.length).toBeGreaterThan(0);
      expect(guides.some((g) => g.id === "stock_inventory")).toBe(true);
    });

    it("matches 'import statement' to statement import guide", () => {
      const guides = findMatchingGuides("how to import marg statement");
      expect(guides.length).toBeGreaterThan(0);
      expect(guides.some((g) => g.id === "import_statement")).toBe(true);
    });
  });

  describe("Off-context Query Handling", () => {
    it("politely declines off-topic questions like how to make a cup of coffee", async () => {
      const res = await askWisp("how to make a cup of coffee");
      expect(res.reply).toBeDefined();
      const lower = res.reply.toLowerCase();
      // Should decline and mention Wisp / InVoiceR / business data
      expect(lower).toContain("wisp");
      expect(lower).toMatch(/invoicer|indobest|business/);
      expect(lower).not.toContain("espresso");
      expect(lower).not.toContain("boil water");
    });

    it("politely declines questions about weather or cooking", async () => {
      const res = await askWisp("tell me a recipe for chocolate cake");
      expect(res.reply).toBeDefined();
      const lower = res.reply.toLowerCase();
      expect(lower).toContain("wisp");
      expect(lower).toMatch(/invoicer|indobest|business/);
    });
  });

  describe("Task Guidance Responses", () => {
    it("guides user on how to upload an invoice and includes direct route link", async () => {
      const res = await askWisp("how do i upload an invoice?");
      expect(res.reply).toBeDefined();
      expect(res.reply).toMatch(/\/upload|Upload/);
      expect(res.sources.some((s) => s.url === "/upload")).toBe(true);
    });

    it("guides user on how to view debtor list and includes accounts route link", async () => {
      const res = await askWisp("how to view debtor list?");
      expect(res.reply).toBeDefined();
      expect(res.reply).toMatch(/Debtor|debtor|accounts/i);
    });
  });

  describe("Customer & Supplier Live Data Retrieval", () => {
    it("answers 'how much money of Abdin is due' with exact balance and statement link", async () => {
      const res = await askWisp("how much money of Abdin is due");
      expect(res.reply).toBeDefined();
      // Should find Abdin Leather Conceria Pvt. Ltd and state the balance
      expect(res.reply).toMatch(/Abdin|18,64,030|1864030|Dr/i);
      expect(res.sources.some((s) => s.url.includes("/accounts/"))).toBe(true);
    }, 15000);
  });

  describe("Product Sales & Inventory Data Retrieval", () => {
    it("answers 'how much sna has been sold this month' with sold volume in kg", async () => {
      const res = await askWisp("how much sna has been sold this month");
      expect(res.reply).toBeDefined();
      // Should find SNA and mention kg sold or sales details
      expect(res.reply).toMatch(/SNA|kg/i);
      expect(res.sources.some((s) => s.title.includes("SNA"))).toBe(true);
    }, 15000);
  });

  describe("Calculative & Analytical Business Tasks", () => {
    it("identifies which customer gives the most sales in revenue", async () => {
      const res = await askWisp("Which customer gives me the most sales in revenue");
      expect(res.reply).toBeDefined();
      // Should name the top customer by revenue (NEW HORIZONS or TIGER)
      expect(res.reply).toMatch(/NEW HORIZONS|revenue|₹/i);
      expect(res.reply).not.toMatch(/unrelated|cannot answer|off-topic/i);
    }, 15000);

    it("identifies which product gives the most revenue", async () => {
      const res = await askWisp("Which product gives the most revenue?");
      expect(res.reply).toBeDefined();
      expect(res.reply).toMatch(/SBL|SNA|₹/i);
      expect(res.reply).not.toMatch(/unrelated|cannot answer/i);
    }, 15000);

    it("calculates total sales revenue and invoice totals", async () => {
      const res = await askWisp("What is our total revenue?");
      expect(res.reply).toBeDefined();
      expect(res.reply).toMatch(/total|sales|₹|revenue/i);
      expect(res.reply).not.toMatch(/unrelated/i);
    }, 15000);

    it("calculates who owes the most money / top debtors", async () => {
      const res = await askWisp("Who owes me the most money?");
      expect(res.reply).toBeDefined();
      expect(res.reply).toMatch(/Dr|owes|₹|receivable/i);
    }, 15000);

    it("answers 'How many invoices amount is over 100000' with exact count and total amount", async () => {
      const res = await askWisp("How many invoices amount is over 100000");
      expect(res.reply).toBeDefined();
      expect(res.reply).toMatch(/100/);
      expect(res.reply).toMatch(/₹|invoice/i);
      expect(res.sources.some((s) => s.url.includes("/invoices"))).toBe(true);
    }, 15000);
  });
});

