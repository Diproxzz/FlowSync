import { retrieveContextForQuery, RetrievedContext } from "./retriever";
import { env } from "@/lib/env";
import { getGroqKeys } from "@/lib/llm/providers/groq";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WispResponse {
  reply: string;
  sources: Array<{ title: string; url: string }>;
}

const WISP_SYSTEM_PROMPT = `You are 'Wisp', the intelligent, polite, and expert assistant for Indobest (Indobest Kolkata's single-owner GST invoice, inventory, and party ledger system).

YOUR STRICT SCOPE & RULES:
1. IN-SCOPE QUESTIONS (ALWAYS ANSWER CLEARLY & EFFECTIVELY):
   - Indobest's business database: sales invoices, purchase bills, customers, suppliers, products, chemicals, inventory/stock balances, ledger accounts, and party statements.
   - CALCULATIVE & ANALYTICAL TASKS:
     * "Which customer gives me the most sales in revenue?" / "Top customers by revenue"
     * "Which product has the highest sales / most volume sold?" / "Top selling products"
     * "Who owes the most money?" / "Who are my biggest debtors?" / "Total receivables"
     * "What is our total revenue / sales this month, this year, or lifetime?"
     * "What is our average invoice value?" / "What was the highest invoice value?"
     * "What is our total stock in kg and total inventory valuation?"
     * Calculations comparing customers, products, months, or calculating percentages and balances.
     * These calculative tasks are 100% IN-SCOPE business operations questions. NEVER decline them as off-topic! Always provide the exact figures, the #1 leader, rankings, and clickable links.
   - FILTERED & THRESHOLD QUERIES:
     * When asked about invoices, purchases, or debtors with amounts over/under/greater than a threshold (e.g. "How many invoices amount is over 100000", "debtors owing over 50k", "invoices above 1 lakh"):
     * State the EXACT count and total rupee sum from the retrieved context immediately in the first sentence (e.g. "There are **100 sales invoices** with an amount over **₹1,00,000.00**, totaling **₹2,25,96,267.00**.").
     * Mention the percentage of total records and revenue it represents.
     * Provide the top matching records or sample invoices with clickable links.
   - PARTY + PRODUCT TRANSACTION QUERIES (e.g. "How much has SNA been purchased by Tiger International"):
     * NEVER report only the latest invoice! You MUST ALWAYS state the cumulative total across ALL invoices (in kg, total rupees, and invoice count).
     * State the grand total clearly in the first sentence (e.g. "Across **5 invoices**, **Tiger International** has purchased a total of **2,040 kg** of **SNA** amounting to **₹3,08,121.60**.").
     * Then list all individual invoices with invoice number, date, kg, amount, and clickable link.
   - Guiding the user on how to use Indobest and perform tasks (e.g., how to upload an invoice, how to view the debtor list, how to record receipts/payments, how to import Marg statements, how to adjust stock, how to edit extracted items before saving).
2. OFF-TOPIC QUESTIONS:
   - If and ONLY if the user asks a question completely unrelated to business, accounting, invoicing, products, or this software (such as "how to make a cup of coffee", cooking recipes, general world trivia, weather, sports, personal advice, general coding outside this app):
   - You MUST politely decline:
     "I am Wisp, your dedicated assistant for Indobest's business operations! I can only assist with your business data—such as invoices, party ledgers, stock levels, and guiding you through tasks in this system. Would you like to check a party's balance, look up an invoice, or learn how to do something in Indobest?"
   - Do NOT answer the off-topic question even partially.
3. TONE & FORMAT:
   - Friendly, clear, concise, professional, and helpful.
   - Use Markdown formatting: bold for key figures and party names, bullet points for rankings and step-by-step procedures.
   - ALWAYS include clickable relative markdown links when referencing pages or records (e.g., [Upload Invoice](/upload), [Party Ledgers](/accounts), [Debtor List](/accounts), [Stock Summary](/stock), [Products](/products), or [View Ledger](/accounts/ACCOUNT_ID)).
   - For currency amounts, always format with '₹' and Indian notation (e.g. ₹52,86,495.00).
   - For ledger balances, explain the meaning clearly:
     - Customer Dr = The party owes money to Indobest (Receivable).
     - Customer Cr = Advance held from the party.
     - Supplier Cr = Indobest owes money to the supplier (Payable).
     - Supplier Dr = Advance paid to supplier.
4. GROUNDING:
   - Ground your answers in the PROVIDED RETRIEVED CONTEXT. If specific data is found in the context, cite the exact numbers and names.
   - If a specific record is not found in the database, clearly say so and suggest how the user can search or add it.
`;

export async function askWisp(
  userQuery: string,
  history: ChatMessage[] = []
): Promise<WispResponse> {
  const query = userQuery.trim();

  // 1. Retrieve RAG Context
  const context = await retrieveContextForQuery(query);

  // 2. Format Context for LLM
  const contextPayload = buildContextString(context);

  const fullSystemPrompt = `${WISP_SYSTEM_PROMPT}\n\n=== RETRIEVED APPLICATION CONTEXT (RAG) ===\n${contextPayload}\n===========================================`;

  // 3. Prepare messages
  const apiMessages = [
    { role: "system", content: fullSystemPrompt },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: query },
  ];

  // 4. Try LLM (Groq with key rotation first, then Gemini)
  let reply = "";
  try {
    reply = await callGroqOrGemini(apiMessages);
  } catch (err) {
    console.warn("Wisp LLM call failed, generating deterministic fallback:", err);
    reply = generateFallbackReply(query, context);
  }

  return {
    reply: reply || generateFallbackReply(query, context),
    sources: context.sources,
  };
}

function buildContextString(context: RetrievedContext): string {
  const sections: string[] = [];

  // 0. Specific Ad-Hoc Filtered Query Result (Ground truth for queries like "how many invoices amount is over 100000")
  if (context.filterSummary) {
    const f = context.filterSummary;
    const samplesText = f.samples
      .map((s, idx) => `  ${idx + 1}. **${s.title}** (${s.subtitle}): **${s.value}** — [View Record](${s.url})`)
      .join("\n");

    sections.push(
      `[SPECIFIC FILTERED QUERY RESULT (GROUND TRUTH)]:\n` +
      `Criteria: ${f.description}\n` +
      `- Exact Matched Count: **${f.matchedCount}** (out of ${f.totalCount} total ${f.entityType.toLowerCase()} records, representing **${f.percentageOfCount}** of all records)\n` +
      (f.totalSumFormatted ? `- Combined Total Amount: **${f.totalSumFormatted}**\n` : "") +
      (f.percentageOfRevenue ? `- Percentage of Total Company Sales Revenue: **${f.percentageOfRevenue}**\n` : "") +
      (samplesText ? `### Sample Records Matching Criteria:\n${samplesText}` : "")
    );
  }

  // 0.1 Specific Cross-Entity Party-Product History (Ground truth for e.g. "How much has SNA been purchased by Tiger International")
  if (context.partyProductTransactions && context.partyProductTransactions.length > 0) {
    const txTexts = context.partyProductTransactions.map((tx) => {
      const invLines = tx.invoices
        .map((inv, idx) => `  ${idx + 1}. Invoice **${inv.invoiceNumber}** (${inv.date}): **${inv.qtyKg.toLocaleString("en-IN")} kg** for **${inv.amount}** — [View Invoice](${inv.url})`)
        .join("\n");

      return (
        `### PARTY + PRODUCT TRANSACTION HISTORY: ${tx.partyName} & ${tx.productName} (${tx.productCode})\n` +
        `- Party Type: ${tx.partyType}\n` +
        `- CUMULATIVE LIFETIME TOTAL: **${tx.totalQtyKg.toLocaleString("en-IN")} kg** across **${tx.invoiceCount} invoices**\n` +
        `- CUMULATIVE TOTAL VALUE: **${tx.totalAmountFormatted}**\n` +
        `- COMPLETE LIST OF ALL ${tx.invoiceCount} INVOICES (ALL TRANSACTIONS):\n` +
        invLines
      );
    });

    sections.push(
      `[SPECIFIC PARTY-PRODUCT PURCHASE/SALE HISTORY (GROUND TRUTH - ALL INVOICES)]:\n` +
      `CRITICAL INSTRUCTION: When answering how much of this product this party bought or sold, you MUST state the CUMULATIVE TOTAL across ALL ${context.partyProductTransactions[0].invoiceCount} invoices (**${context.partyProductTransactions[0].totalQtyKg.toLocaleString("en-IN")} kg** totaling **${context.partyProductTransactions[0].totalAmountFormatted}**) in your first sentence. NEVER report only the latest invoice!\n\n` +
      txTexts.join("\n\n")
    );
  }

  // 1. Live Business Analytics & Calculations (Top rankings, sales totals, stock valuation, debtors)
  if (context.analytics) {
    const a = context.analytics;
    const slabsText = a.invoiceValueSlabs
      ? a.invoiceValueSlabs
          .map((s) => `  * **${s.label}:** **${s.count} invoices** totaling **${s.totalRevenue}** (${s.shareOfInvoicesPct} of invoices, ${s.shareOfRevenuePct} of sales)`)
          .join("\n")
      : "";
    const over1LText = a.invoicesOver1Lakh
      ? `- Invoices with Amount Over ₹1,00,000 (≥ 1 Lakh): **${a.invoicesOver1Lakh.count} invoices** totaling **${a.invoicesOver1Lakh.totalRevenue}** (${a.invoicesOver1Lakh.shareOfInvoicesPct} of all invoices, ${a.invoicesOver1Lakh.shareOfRevenuePct} of total sales)\n`
      : "";

    const topCustText = a.topCustomersByRevenue
      .map(
        (c, idx) =>
          `  ${idx + 1}. **${c.name}**: Total Revenue: ${c.totalRevenue} (${c.invoiceCount} invoices, ${c.totalVolumeKg.toLocaleString("en-IN")} kg sold, **${c.shareOfTotalPct}** of all company sales) — [Customer Details](${c.url})`
      )
      .join("\n");

    const topProdRevText = a.topProductsByRevenue
      .map(
        (p, idx) =>
          `  ${idx + 1}. **${p.name}** (\`${p.code}\`): Revenue: ${p.totalRevenue} (${p.totalVolumeKg.toLocaleString("en-IN")} kg sold, ${p.shareOfTotalPct} share)`
      )
      .join("\n");

    const topProdVolText = a.topProductsByVolume
      .map(
        (p, idx) =>
          `  ${idx + 1}. **${p.name}** (\`${p.code}\`): Sold Volume: **${p.totalVolumeKg.toLocaleString("en-IN")} kg** (Revenue: ${p.totalRevenue})`
      )
      .join("\n");

    const topDebtorsText = a.topDebtors
      .map(
        (d, idx) =>
          `  ${idx + 1}. **${d.name}**: **${d.due} Dr** (Receivable / owes Indobest) — [View Ledger](${d.url})`
      )
      .join("\n");

    const topStockText = a.topStockProducts
      .map((s, idx) => `  ${idx + 1}. **${s.name}** (\`${s.code}\`): **${s.stockKg.toLocaleString("en-IN")} kg** in stock (Rate: ${s.rate})`)
      .join("\n");

    sections.push(
      `[BUSINESS ANALYTICS & CALCULATIONS (GROUND TRUTH)]:\n` +
      `### Customer Sales Rankings (Top Revenue Contributors):\n` +
      `${topCustText}\n\n` +
      `### Top Products by Revenue:\n` +
      `${topProdRevText}\n\n` +
      `### Top Products by Volume (kg Sold):\n` +
      `${topProdVolText}\n\n` +
      `### Overall Company Sales Summary:\n` +
      `- Total Sales Invoices Issued: ${a.totalSalesInvoicesCount}\n` +
      `- Lifetime Total Sales: **${a.totalSalesLifetime}**\n` +
      over1LText +
      (slabsText ? `### Invoice Slabs & Value Distribution:\n${slabsText}\n\n` : "") +
      `- Average Invoice Value: **${a.averageInvoiceValue}**\n` +
      `- Highest Single Sale Invoice: ${a.highestInvoice ? `Invoice ${a.highestInvoice.number} on ${a.highestInvoice.date} to ${a.highestInvoice.customer} for **${a.highestInvoice.amount}** ([View Invoice](${a.highestInvoice.url}))` : "None"}\n` +
      `- Current Month Sales: **${a.thisMonthSales.revenue}** (${a.thisMonthSales.count} invoices, ${a.thisMonthSales.volumeKg.toLocaleString("en-IN")} kg)\n` +
      `- FY 2026-27 Sales: **${a.thisYearSales.revenue}** (${a.thisYearSales.count} invoices, ${a.thisYearSales.volumeKg.toLocaleString("en-IN")} kg)\n\n` +
      `### Debtors & Outstanding Receivables:\n` +
      `- Total Money Owed by Customers: **${a.totalReceivables}** (across ${a.activeDebtorsCount} active debtors)\n` +
      `- Top Debtors:\n${topDebtorsText}\n\n` +
      `### Purchases & Payables:\n` +
      `- Total Purchases: **${a.totalPurchasesLifetime}** across ${a.totalPurchasesCount} bills\n` +
      `- Total Money Owed to Suppliers: **${a.totalPayables}**\n\n` +
      `### Inventory & Warehouse Stock:\n` +
      `- Total Live Stock: **${a.totalStockVolumeKg.toLocaleString("en-IN")} kg**\n` +
      `- Estimated Inventory Valuation: **${a.totalStockEstimatedValue}**\n` +
      `- Highest Stock Chemicals:\n${topStockText}`
    );
  }

  // 1. Party Summaries (Customer / Supplier balances, due money, transactions)
  if (context.partySummaries && context.partySummaries.length > 0) {
    const partyTexts = context.partySummaries.map((p) => {
      const invs = p.recentInvoices.map((i) => `    * Invoice ${i.number} (${i.date}): ${i.amount} [Link](${i.url})`).join("\n");
      const receipts = p.recentReceipts.map((r) => `    * Receipt (${r.date}): ${r.amount} via ${r.mode || "Bank"}`).join("\n");
      const prods = p.productsBreakdown && p.productsBreakdown.length > 0
        ? `\n- Products Breakdown (All-Time Purchases):\n` +
          p.productsBreakdown.slice(0, 8).map((pr) => `    * ${pr.name} (\`${pr.code}\`): **${pr.qtyKg.toLocaleString("en-IN")} kg** across ${pr.count} invoices (${pr.amount})`).join("\n")
        : "";

      return `### PARTY: ${p.name} (${p.type})\n` +
        (p.totalInvoicesCount ? `- Total Invoices on File: ${p.totalInvoicesCount}\n` : "") +
        `- Current Balance: ${p.balanceFormatted} ${p.balanceSide}\n` +
        `- Due Status: ${p.dueExplanation}\n` +
        `- Total Lifetime Billed: ${p.totalBilled}\n` +
        `- Total Lifetime Paid/Received: ${p.totalPaidReceived}\n` +
        prods + "\n" +
        (invs ? `- Recent Invoices:\n${invs}\n` : "") +
        (receipts ? `- Recent Receipts/Payments:\n${receipts}\n` : "") +
        `- Statement Link: [Open ${p.name} Ledger](${p.url})`;
    });
    sections.push(`[PARTY DUE & LEDGER DETAILS]:\n${partyTexts.join("\n\n")}`);
  }

  // 2. Product Summaries (Stock, sold this month, total sales)
  if (context.productSummaries && context.productSummaries.length > 0) {
    const prodTexts = context.productSummaries.map((p) => {
      const sales = p.recentSales.map((s) => `    * Inv ${s.invoiceNumber} (${s.date}) to ${s.buyer}: ${s.qtyKg} kg (${s.amount})`).join("\n");
      const buyers = p.topBuyers && p.topBuyers.length > 0
        ? `\n- Top Buyers for this Product:\n` +
          p.topBuyers.slice(0, 8).map((b) => `    * **${b.customerName}**: **${b.qtyKg.toLocaleString("en-IN")} kg** across ${b.count} invoices (${b.amount})`).join("\n")
        : "";

      return `### PRODUCT: ${p.name} (Code: ${p.code})\n` +
        `- Current Live Stock: ${p.currentStockKg.toLocaleString("en-IN")} kg\n` +
        `- Sold This Month: ${p.soldThisMonthKg.toLocaleString("en-IN")} kg (Revenue: ${p.soldThisMonthAmount})\n` +
        `- Sold This FY (2026-27): ${p.soldThisYearKg.toLocaleString("en-IN")} kg (Revenue: ${p.soldThisYearAmount})\n` +
        `- Sold All-Time: ${p.soldTotalKg.toLocaleString("en-IN")} kg (Total: ${p.soldTotalAmount})\n` +
        `- Standard Sale Rate: ${p.saleRate} | Pack: ${p.packSize}\n` +
        buyers + "\n" +
        (sales ? `- Recent Sales:\n${sales}\n` : "") +
        `- Inventory Link: [Stock Summary](/stock)`;
    });
    sections.push(`[PRODUCT SALES & STOCK INVENTORY]:\n${prodTexts.join("\n\n")}`);
  }

  // 3. Overall Sales (month/year)
  if (context.overallSales) {
    sections.push(
      `[OVERALL SALES TOTALS]:\n` +
      `- This Month: ${context.overallSales.thisMonthCount} invoices, ${context.overallSales.thisMonthVolumeKg.toLocaleString("en-IN")} kg, Revenue: ${context.overallSales.thisMonthRevenue}\n` +
      `- This Financial Year: ${context.overallSales.thisYearCount} invoices, ${context.overallSales.thisYearVolumeKg.toLocaleString("en-IN")} kg, Revenue: ${context.overallSales.thisYearRevenue}`
    );
  }

  // 4. Top Debtors
  if (context.topDebtors && context.topDebtors.length > 0) {
    const dList = context.topDebtors.map((d) => `  * ${d.name}: ${d.due} [View Ledger](${d.url})`).join("\n");
    sections.push(`[TOP DEBTORS / OUTSTANDING DUE]:\n${dList}`);
  }

  // 5. Invoices directly found
  if (context.invoices.length > 0) {
    const invTexts = context.invoices.map(
      (inv) =>
        `- Invoice ${inv.invoiceNumber} | Date: ${inv.date} | Customer: ${inv.party} | Grand Total: ${inv.grandTotal} | Link: [View Invoice](${inv.url})\n  Items: ${inv.itemsSummary}`
    );
    sections.push(`[INVOICES FOUND]:\n${invTexts.join("\n")}`);
  }

  // 6. Guides
  if (context.guides.length > 0) {
    const guideTexts = context.guides.map(
      (g) =>
        `### Guide: ${g.title}\nPage: ${g.route}\nSummary: ${g.summary}\nSteps:\n${g.steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}`
    );
    sections.push(`[TASK GUIDES]:\n${guideTexts.join("\n\n")}`);
  }

  return sections.length > 0 ? sections.join("\n\n") : "No specific records matched the query search terms.";
}

async function callGroqOrGemini(messages: Array<{ role: string; content: any }>): Promise<string> {
  const groqKeys = getGroqKeys();

  // 1. Try Groq keys
  if (groqKeys.length > 0) {
    const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3.8-27b", env.GROQ_MODEL].filter(
      Boolean
    );

    for (const key of groqKeys) {
      for (const model of models) {
        try {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.2,
              max_tokens: 800,
            }),
          });

          if (!res.ok) continue;

          const data = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text && text.trim()) {
            return text.trim();
          }
        } catch {
          // Try next model or key
        }
      }
    }
  }

  // 2. Try Gemini
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) {
    const geminiModels = ["gemini-2.5-flash", "gemini-3.7-flash", "gemini-1.5-flash", "gemini-flash-latest"];
    for (const model of geminiModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
        const parts: any[] = [];

        // Combine system prompt and user query
        const sysMsg = messages.find((m) => m.role === "system")?.content || "";
        const userMsg = messages.filter((m) => m.role !== "system").map((m) => `${m.role}: ${m.content}`).join("\n\n");

        parts.push({ text: `${sysMsg}\n\n${userMsg}` });

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 800,
            },
          }),
        });

        if (!res.ok) continue;

        const data = await res.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim()) {
          return candidateText.trim();
        }
      } catch {
        // Try next
      }
    }
  }

  throw new Error("All configured LLM providers failed");
}

function generateFallbackReply(query: string, context: RetrievedContext): string {
  const qLower = query.toLowerCase();

  // Off-topic check
  const offTopicKeywords = [
    "coffee",
    "tea",
    "weather",
    "recipe",
    "cook",
    "movie",
    "song",
    "game",
    "joke",
    "who won",
    "capital of",
    "president",
  ];
  if (offTopicKeywords.some((w) => qLower.includes(w))) {
    return (
      "I am **Wisp**, your dedicated assistant for Indobest's business data! " +
      "I can only help with business operations—such as invoices, party ledgers, debtor lists, stock levels, " +
      "and guiding you through tasks in this system.\n\n" +
      "Would you like to check a party's balance, find an invoice, or learn how to perform an action?"
    );
  }

  // Ad-hoc Filter Summary Fallback (e.g. "how many invoices amount is over 100000")
  if (context.filterSummary) {
    const f = context.filterSummary;
    const samplesText = f.samples.length > 0
      ? `\n\n**Top Matching Records:**\n` +
        f.samples.map((s, idx) => `${idx + 1}. **${s.title}** (${s.subtitle}): **${s.value}** — [View Record](${s.url})`).join("\n")
      : "";

    if (f.entityType === "INVOICE") {
      const opWord = f.operator === "LTE" ? "under" : "over";
      return (
        `### Invoices Amount ${f.operator === "LTE" ? "Under" : "Over"} ${f.thresholdFormatted}\n\n` +
        `There are **${f.matchedCount} sales invoices** with an amount ${opWord} **${f.thresholdFormatted}** (out of **${f.totalCount} total invoices**, representing **${f.percentageOfCount}** of all invoices).\n\n` +
        (f.totalSumFormatted ? `- **Total Combined Revenue:** **${f.totalSumFormatted}**\n` : "") +
        (f.percentageOfRevenue ? `- **Share of Total Sales:** **${f.percentageOfRevenue}**\n` : "") +
        samplesText +
        `\n\n👉 [View All Invoices](/invoices)`
      );
    }

    if (f.entityType === "PURCHASE") {
      const opWord = f.operator === "LTE" ? "under" : "over";
      return (
        `### Purchase Bills Amount ${f.operator === "LTE" ? "Under" : "Over"} ${f.thresholdFormatted}\n\n` +
        `There are **${f.matchedCount} purchase bills** with an amount ${opWord} **${f.thresholdFormatted}** (out of **${f.totalCount} total bills**, representing **${f.percentageOfCount}** of all purchases).\n\n` +
        (f.totalSumFormatted ? `- **Total Combined Purchases:** **${f.totalSumFormatted}**\n` : "") +
        samplesText +
        `\n\n👉 [View All Purchases](/purchases)`
      );
    }

    if (f.entityType === "DEBTOR") {
      return (
        `### Debtors with Balance Over ${f.thresholdFormatted}\n\n` +
        `There are **${f.matchedCount} debtors** with an outstanding balance over **${f.thresholdFormatted}**.\n\n` +
        (f.totalSumFormatted ? `- **Total Combined Outstanding:** **${f.totalSumFormatted}**\n` : "") +
        samplesText +
        `\n\n👉 [Open Debtor List](/accounts)`
      );
    }
  }

  // Party + Product Cross-Entity Fallback (e.g. "How much has SNA been purchased by Tiger International")
  if (context.partyProductTransactions && context.partyProductTransactions.length > 0) {
    const tx = context.partyProductTransactions[0];
    const invList = tx.invoices
      .map((inv, idx) => `${idx + 1}. **Invoice ${inv.invoiceNumber}** (${inv.date}): **${inv.qtyKg.toLocaleString("en-IN")} kg** — **${inv.amount}** ([View Invoice](${inv.url}))`)
      .join("\n");

    const verb = tx.partyType === "CUSTOMER" ? "purchased" : "supplied";
    return (
      `### Total ${tx.productName} (${tx.productCode}) ${verb} by ${tx.partyName}\n\n` +
      `Across **${tx.invoiceCount} invoices**, **${tx.partyName}** has ${verb} a cumulative total of **${tx.totalQtyKg.toLocaleString("en-IN")} kg** of **${tx.productName}**, totaling **${tx.totalAmountFormatted}**.\n\n` +
      `**Complete Breakdown of All ${tx.invoiceCount} Invoices:**\n` +
      invList +
      `\n\n👉 [Open ${tx.partyName} Ledger](/accounts/${tx.partyId}) | [View Invoices](/invoices)`
    );
  }

  // Party / Customer / Supplier Due Fallback (e.g. "how much money of Abdin is due")
  if (context.partySummaries && context.partySummaries.length > 0) {
    const p = context.partySummaries[0];
    return (
      `### Balance Summary: **${p.name}**\n\n` +
      `- **Current Balance:** **${p.balanceFormatted} ${p.balanceSide}**\n` +
      `- **Status:** ${p.dueExplanation}\n` +
      `- **Total Lifetime Invoiced:** ${p.totalBilled}\n` +
      `- **Total Paid / Received:** ${p.totalPaidReceived}\n\n` +
      (p.recentInvoices.length > 0
        ? `**Recent Invoices:**\n` + p.recentInvoices.map((i) => `- Invoice ${i.number} (${i.date}): ${i.amount}`).join("\n") + "\n\n"
        : "") +
      `👉 [Click here to open ${p.name}'s Ledger Statement](${p.url})`
    );
  }

  // Product Sales & Stock Fallback (e.g. "how much sna has been sold this month")
  if (context.productSummaries && context.productSummaries.length > 0) {
    const prod = context.productSummaries[0];
    return (
      `### Product: **${prod.name}** (Code: \`${prod.code}\`)\n\n` +
      `- **Sold This Month:** **${prod.soldThisMonthKg.toLocaleString("en-IN")} kg** (Revenue: **${prod.soldThisMonthAmount}**)\n` +
      `- **Sold This Financial Year:** **${prod.soldThisYearKg.toLocaleString("en-IN")} kg** (Revenue: **${prod.soldThisYearAmount}**)\n` +
      `- **Current Live Stock:** **${prod.currentStockKg.toLocaleString("en-IN")} kg**\n` +
      `- **Standard Sale Rate:** ${prod.saleRate} per kg | **Pack Size:** ${prod.packSize}\n\n` +
      (prod.recentSales.length > 0
        ? `**Recent Sales:**\n` + prod.recentSales.slice(0, 4).map((s) => `- Inv ${s.invoiceNumber} (${s.date}) to ${s.buyer}: ${s.qtyKg} kg (${s.amount})`).join("\n") + "\n\n"
        : "") +
      `👉 [View full Stock Summary](/stock) or [Product Master](/products)`
    );
  }

  // Analytics / Calculative Fallbacks (e.g. "which customer gives me the most sales in revenue")
  if (context.analytics) {
    const a = context.analytics;

    // Top Customer by Revenue / Sales / Who gives most sales
    if (
      (qLower.includes("customer") || qLower.includes("buyer") || qLower.includes("party") || qLower.includes("client")) &&
      (qLower.includes("most") || qLower.includes("highest") || qLower.includes("top") || qLower.includes("best") || qLower.includes("revenue") || qLower.includes("sales") || qLower.includes("turnover"))
    ) {
      const top = a.topCustomersByRevenue;
      if (top.length > 0) {
        const leader = top[0];
        return (
          `### Top Customer by Sales Revenue: **${leader.name}**\n\n` +
          `**${leader.name}** gives you the most sales in revenue, contributing **${leader.totalRevenue}** across **${leader.invoiceCount} invoices** (${leader.totalVolumeKg.toLocaleString("en-IN")} kg sold), representing **${leader.shareOfTotalPct}** of all company sales!\n\n` +
          `**Top Customers by Revenue:**\n` +
          top.slice(0, 5).map((c, idx) => `${idx + 1}. **${c.name}**: **${c.totalRevenue}** (${c.invoiceCount} invoices, ${c.totalVolumeKg.toLocaleString("en-IN")} kg sold, ${c.shareOfTotalPct} share) — [View Customer](${c.url})`).join("\n") +
          `\n\n👉 [Open Customer Directory](/customers) or [Sales Invoices](/invoices)`
        );
      }
    }

    // Top Products by Revenue or Volume
    if (
      (qLower.includes("product") || qLower.includes("chemical") || qLower.includes("item")) &&
      (qLower.includes("most") || qLower.includes("highest") || qLower.includes("top") || qLower.includes("best") || qLower.includes("revenue") || qLower.includes("sold") || qLower.includes("volume"))
    ) {
      const isVolume = qLower.includes("volume") || qLower.includes("kg") || qLower.includes("quantity");
      const list = isVolume ? a.topProductsByVolume : a.topProductsByRevenue;
      if (list.length > 0) {
        const leader = list[0];
        return (
          `### Top Selling Chemical: **${leader.name}** (\`${leader.code}\`)\n\n` +
          `**${leader.name}** is your #1 chemical by ${isVolume ? "volume" : "revenue"}, generating **${leader.totalRevenue}** with **${leader.totalVolumeKg.toLocaleString("en-IN")} kg** sold!\n\n` +
          `**Top 5 Chemicals by ${isVolume ? "Volume" : "Revenue"}:**\n` +
          list.slice(0, 5).map((p, idx) => `${idx + 1}. **${p.name}** (\`${p.code}\`): **${p.totalRevenue}** (${p.totalVolumeKg.toLocaleString("en-IN")} kg sold)`).join("\n") +
          `\n\n👉 [Open Stock Summary](/stock) or [Product Master](/products)`
        );
      }
    }

    // Overall Sales / Revenue / Invoices
    if (
      qLower.includes("total sales") ||
      qLower.includes("total revenue") ||
      qLower.includes("turnover") ||
      qLower.includes("how much sales") ||
      qLower.includes("average invoice") ||
      qLower.includes("highest invoice")
    ) {
      return (
        `### Overall Sales & Revenue Summary\n\n` +
        `- **Lifetime Total Sales:** **${a.totalSalesLifetime}** across **${a.totalSalesInvoicesCount} invoices**\n` +
        `- **Average Invoice Value:** **${a.averageInvoiceValue}**\n` +
        (a.highestInvoice ? `- **Highest Single Invoice:** Invoice ${a.highestInvoice.number} on ${a.highestInvoice.date} to ${a.highestInvoice.customer} for **${a.highestInvoice.amount}** ([View Invoice](${a.highestInvoice.url}))\n` : "") +
        `- **Current Month Sales:** **${a.thisMonthSales.revenue}** (${a.thisMonthSales.count} invoices, ${a.thisMonthSales.volumeKg.toLocaleString("en-IN")} kg)\n` +
        `- **FY 2026-27 Sales:** **${a.thisYearSales.revenue}** (${a.thisYearSales.count} invoices, ${a.thisYearSales.volumeKg.toLocaleString("en-IN")} kg)\n\n` +
        `👉 [Open Dashboard](/dashboard) or [Sales Invoices](/invoices)`
      );
    }

    // Debtors / Receivables
    if (
      qLower.includes("debtor") ||
      qLower.includes("who owes") ||
      qLower.includes("receivable") ||
      qLower.includes("most due") ||
      qLower.includes("highest balance")
    ) {
      return (
        `### Outstanding Debtors & Receivables\n\n` +
        `- **Total Outstanding Receivables:** **${a.totalReceivables}** across **${a.activeDebtorsCount} active debtors**\n\n` +
        `**Top Debtors with Highest Balances:**\n` +
        a.topDebtors.slice(0, 5).map((d, idx) => `${idx + 1}. **${d.name}**: **${d.due} Dr** — [View Ledger](${d.url})`).join("\n") +
        `\n\n👉 [Open Debtor List](/accounts)`
      );
    }

    // Stock Valuation / Total Stock
    if (
      qLower.includes("stock value") ||
      qLower.includes("inventory value") ||
      qLower.includes("valuation") ||
      qLower.includes("total stock") ||
      qLower.includes("how much stock")
    ) {
      return (
        `### Warehouse Stock & Inventory Valuation\n\n` +
        `- **Total Stock in Warehouse:** **${a.totalStockVolumeKg.toLocaleString("en-IN")} kg**\n` +
        `- **Estimated Inventory Valuation:** **${a.totalStockEstimatedValue}**\n\n` +
        `**Highest Stock Chemicals:**\n` +
        a.topStockProducts.slice(0, 5).map((s, idx) => `${idx + 1}. **${s.name}** (\`${s.code}\`): **${s.stockKg.toLocaleString("en-IN")} kg** (Rate: ${s.rate})`).join("\n") +
        `\n\n👉 [Open Stock Summary](/stock)`
      );
    }
  }

  // Overall Sales Fallback
  if (context.overallSales) {
    const os = context.overallSales;
    return (
      `### Overall Sales Summary\n\n` +
      `- **This Month:** **${os.thisMonthVolumeKg.toLocaleString("en-IN")} kg** across **${os.thisMonthCount} invoices** (Revenue: **${os.thisMonthRevenue}**)\n` +
      `- **This Financial Year:** **${os.thisYearVolumeKg.toLocaleString("en-IN")} kg** across **${os.thisYearCount} invoices** (Revenue: **${os.thisYearRevenue}**)\n\n` +
      `👉 [View Dashboard](/dashboard) or [Sales Invoices](/invoices)`
    );
  }

  // Top Debtors Fallback
  if (context.topDebtors && context.topDebtors.length > 0) {
    return (
      `### Top Debtors with Outstanding Balances\n\n` +
      context.topDebtors.map((d, idx) => `${idx + 1}. **${d.name}**: **${d.due} Dr** — [View Ledger](${d.url})`).join("\n") +
      `\n\n👉 [Open Debtor List](/accounts)`
    );
  }

  // Guide fallback
  if (context.guides.length > 0) {
    const g = context.guides[0];
    return (
      `### ${g.title}\n\n` +
      `${g.summary}\n\n` +
      `**Steps to follow:**\n` +
      g.steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n") +
      `\n\nDirect Link: [Open ${g.title}](${g.route})`
    );
  }

  // Invoice fallback
  if (context.invoices.length > 0) {
    const inv = context.invoices[0];
    return (
      `Found **Invoice ${inv.invoiceNumber}**:\n\n` +
      `- **Date:** ${inv.date}\n` +
      `- **Customer:** ${inv.party}\n` +
      `- **Grand Total:** **${inv.grandTotal}**\n` +
      `- **Items:** ${inv.itemsSummary}\n\n` +
      `👉 [Open Invoice Details](${inv.url})`
    );
  }

  return (
    "I couldn't find a matching record in the database for that query. " +
    "Please check the party name, invoice number, product code, or specify what task you need assistance with."
  );
}
