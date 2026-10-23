/**
 * FlowPilot Application Knowledge Base for Wisp Assistant
 * Contains step-by-step guidance, formulas, mathematical definitions,
 * features, workflows, and route mappings.
 */

export interface TaskGuide {
  id: string;
  title: string;
  keywords: string[];
  route: string;
  summary: string;
  steps: string[];
  tips?: string[];
  formula?: string;
}

export const APP_GUIDES: TaskGuide[] = [
  {
    id: "stock_value_calculation",
    title: "How Stock Value and Inventory Valuation is Calculated",
    keywords: [
      "stock value",
      "inventory value",
      "valuation",
      "calculate stock value",
      "how do you calculate stock value",
      "stock formula",
      "inventory valuation",
      "closing stock value",
    ],
    route: "/stock",
    summary:
      "Stock Value is computed at the product level as Closing Stock (in kg) multiplied by the Effective Purchase Rate (Landing Cost if available, otherwise Standard Purchase Rate).",
    formula: "Stock Value (₹) = Closing Stock (kg) × Effective Purchase Rate (₹/kg)\nWhere:\n• Closing Stock = Opening Stock + Total Purchases (Inward) - Total Sales (Outward) - Adjustments\n• Effective Purchase Rate = Landing Cost (if defined) OR Standard Purchase Rate",
    steps: [
      "Navigate to [Stock Summary](/stock).",
      "Each chemical row tracks: Opening Stock, Purchases (+), Sales (-), Adjustments (+/-), and Closing Stock (kg).",
      "For each product, the system checks if a 'Landing Cost' is defined. If so, it uses the Landing Cost; otherwise, it uses the 'Standard Purchase Rate' from the product master.",
      "The product's Stock Value is calculated as: `Closing Stock (kg) × Effective Purchase Rate`.",
      "Total Company Inventory Valuation is the sum of stock values across all active products, displayed in the top KPI card on [Stock Summary](/stock)."
    ],
    tips: [
      "If a product has negative or zero closing stock, its stock value is treated as ₹0.00.",
      "You can view product landing costs and update rates anytime under [Products](/products)."
    ]
  },
  {
    id: "profitability_weighted_average",
    title: "How Weighted Average (WASP, WAPC) and Margins are Calculated",
    keywords: [
      "weighted average",
      "wasp",
      "wapc",
      "margin",
      "profit margin",
      "profitability",
      "gross margin",
      "how do you calculate margin",
      "margin percentage",
      "product margins",
    ],
    route: "/dashboard",
    summary:
      "FlowPilot calculates commercial profitability strictly on Taxable Value (excluding GST) using volume-weighted averages: WASP (Weighted Average Sale Price) and WAPC (Weighted Average Purchase Cost).",
    formula: "• WASP (₹/kg) = Total Taxable Sales Revenue (₹) / Total Sales Quantity (kg)\n• WAPC (₹/kg) = Total Taxable Purchase Cost (₹) / Total Purchase Quantity (kg)\n• Gross Profit Margin (%) = ((WASP - WAPC) / WASP) × 100\n• Gross Profit (₹) = Taxable Sales Revenue - (Sales Qty × WAPC)",
    steps: [
      "Go to [Executive Dashboard](/dashboard) and select the 'Profitability & Margins' tab.",
      "Review the Top Metrics: Total Taxable Turnover, Total Landed Cost of Goods Sold (COGS), Gross Profit (₹), and Blended Markup (%).",
      "Inspect the Two-Chart View:",
      "  1. Monthly Revenue & Profit (₹ in Lakhs) — clean blue and green comparative bars.",
      "  2. Monthly Profit Markup Trend (%) — gradient area chart with percentage labels directly above each data point displaying monthly markup on cost.",
      "Scroll down to the 'Product-Level Profitability & Margins' table to examine per-chemical WASP, WAPC, Gross Margin %, and Margin Health status (Healthy ≥20%, Normal 10-20%, Thin <10%)."
    ],
    tips: [
      "All weighted averages and margin calculations strictly exclude GST because GST is a pass-through tax, not revenue or expense.",
      "Informal invoices (non-GST) are also factored into volume and sales revenue."
    ]
  },
  {
    id: "purchases_vs_sales_chart",
    title: "Understanding the 'Purchases vs Sales by Month' Chart",
    keywords: [
      "purchases vs sales",
      "sales vs purchases",
      "purchases vs sales by month",
      "chart",
      "graph",
      "monthly comparative turnover",
      "blue bar orange bar",
      "what is purchase vs sales",
    ],
    route: "/dashboard",
    summary:
      "The 'Purchases vs Sales by Month' chart on the Executive Dashboard compares monthly Taxable Sales turnover against Taxable Purchases turnover across the financial year.",
    steps: [
      "Navigate to [Executive Dashboard](/dashboard).",
      "Locate the 'Purchases vs Sales by Month' bar chart.",
      "Blue Bars represent Taxable Sales (in ₹ Lakhs) billed in that calendar month.",
      "Orange/Amber Bars represent Taxable Purchases (in ₹ Lakhs) procured from chemical suppliers in that calendar month.",
      "Months displayed span April 2026 to October 2026.",
      "Analysis Guide:",
      "  * If Sales > Purchases (Blue bar taller than Orange): The company is generating net positive trading turnover and liquidating stock.",
      "  * If Purchases > Sales (Orange bar taller than Blue): The company is building up inventory, stocking raw materials, or taking advance bulk shipments."
    ],
    tips: [
      "Uses high-contrast Okabe-Ito accessible color palette (Blue `#0072B2` for Sales, Orange `#E69F00` for Purchases).",
      "Hover over any bar to inspect exact values in ₹ Lakhs."
    ]
  },
  {
    id: "informal_invoices",
    title: "How Informal Invoices and Dual Ledgers Work",
    keywords: [
      "informal invoice",
      "informal",
      "non-gst",
      "informal invoices",
      "cash sales",
      "dual ledger",
      "separate ledger",
      "customer informal",
    ],
    route: "/informal-invoices",
    summary:
      "Informal Invoices provide fast entry for non-GST sales, automatically creating a separate '<Customer Name> (Informal)' ledger while deducting inventory stock and reflecting collectively on the Debtor List.",
    steps: [
      "Go to [Informal Invoices](/informal-invoices) under Sales in the sidebar.",
      "Click '+ New Informal Invoice'.",
      "Enter the Date, Invoice Number (auto-incremented e.g. `INF-0001`), and Customer Name.",
      "Type product names with real-time auto-suggestions. Fill in Quantity (kg) and Rate (₹/kg). Total is auto-calculated (`Qty × Rate`).",
      "Save the invoice. This:",
      "  1. Creates or links the customer by name.",
      "  2. Creates a dedicated Informal Ledger Account `<Customer Name> (Informal)`.",
      "  3. Posts a debit entry for the full invoice value (0% GST).",
      "  4. Records a `StockMovement` (SALE) deducting from [Stock Summary](/stock).",
      "  5. Merges seamlessly into the [Monthwise Debtor List](/accounts) under a collective customer row with a 'Combined' badge."
    ],
    tips: [
      "Customers with both regular tax invoices and informal invoices have two independent ledger statements for clean bookkeeping.",
      "On the Debtor List, their outstanding balance is shown collectively."
    ]
  },
  {
    id: "upload_invoice",
    title: "How to Upload and Process Sales Invoices",
    keywords: ["upload invoice", "upload", "scan", "extract invoice", "add invoice", "process invoice", "new invoice"],
    route: "/upload",
    summary: "Upload sales tax invoices (PDF or images) to automatically transcribe them using AI vision models and update stock & ledger.",
    steps: [
      "Navigate to [Upload Invoice](/upload).",
      "Drag and drop your invoice PDF or image file (PNG/JPG) into the upload dropzone, or click 'Select File'.",
      "The system will scan and transcribe the document using the active vision model (Groq, Gemini, or local models).",
      "Once transcribed, review the extracted header details: Invoice Number, Date, Customer Name, and GSTIN.",
      "Check the line items (Product Code, Quantity in kg, Rate, Taxable Amount, CGST/SGST/IGST). You can edit any line item directly in the review screen before saving.",
      "If the customer or product alias is newly detected, verify or map it to an existing master record.",
      "Click 'Save Invoice'. This records the invoice, automatically deducts the stock from the inventory ledger (`stock_movements`), and posts the debit entry to the customer's ledger account."
    ],
    tips: [
      "You can upload multiple pages or files in a batch.",
      "Duplicate invoice numbers are automatically detected to prevent double-entry."
    ]
  },
  {
    id: "debtor_list",
    title: "How to View and Download the Debtor List",
    keywords: ["debtor list", "debtors", "debtor", "receivables", "overdue list", "aging", "monthwise", "month-wise", "outstanding list"],
    route: "/accounts",
    summary: "View a classified debtor list showing outstanding balances categorized by month-wise aging, with full Excel export.",
    steps: [
      "Go to [Party Ledgers & Accounts](/accounts).",
      "At the top-right toolbar, click the 'View Debtor List' button (with the Users/List icon).",
      "The Debtor List view will open with a clean white professional layout showing all customer accounts with outstanding debit balances.",
      "Review the month-wise amount classification (e.g. April 2026, May 2026, June 2026, etc.) mapping exactly where each outstanding bill originated.",
      "Check the 'Total Outstanding (Dr)' and 'Overdue' columns.",
      "To download the report for your records or accountant, click the 'Download Debtor List' button at the top-right of the modal."
    ],
    tips: [
      "You can click on any party's name inside the Debtor List to jump straight into their individual ledger statement.",
      "Amounts are strictly calculated from the double-entry ledger transactions."
    ]
  },
  {
    id: "party_ledgers",
    title: "How to View and Manage Party Ledgers (Statements)",
    keywords: ["ledger", "party ledger", "statement", "view ledger", "account statement", "customer ledger", "supplier ledger", "print statement", "dr cr"],
    route: "/accounts",
    summary: "View party ledgers with running balances (Dr/Cr), totals row, and print-ready A4 statements.",
    steps: [
      "Go to [Party Ledgers](/accounts).",
      "Select either the 'Customers' tab or 'Suppliers' tab.",
      "Click on any party row or click 'View Statement' to open their detailed ledger page (e.g. `/accounts/[id]`).",
      "Select your date range filter: 'FY 2026-27' (automatically clamped to today's date), 'Last 90 Days', or 'Last 30 Days', or set custom dates.",
      "View the 4 summary cards: Opening Balance, Period Debit, Period Credit, and Total Due (Closing).",
      "Scroll down to inspect chronological ledger rows with date, particulars, debit, credit, and running balance with Dr/Cr indicators.",
      "To print a formal statement, use your browser's Print dialog (`Ctrl+P` or `Cmd+P`). The page automatically formats for A4 portrait with clean margins and suppressible web controls."
    ],
    tips: [
      "Debit (Dr) for customers means they owe you money (Receivable).",
      "Credit (Cr) for suppliers means you owe the supplier money (Payable). InVoiceR displays supplier Cr in clear green."
    ]
  },
  {
    id: "record_receipt_payment",
    title: "How to Record a Payment or Receipt Entry",
    keywords: ["record receipt", "payment", "receipt", "add entry", "journal", "bank receipt", "cheque", "rtgs", "neft", "cash payment"],
    route: "/accounts",
    summary: "Manually record a bank receipt, RTGS, NEFT, Cheque, or cash voucher against a party ledger.",
    steps: [
      "Navigate to [Party Ledgers](/accounts) and select the customer or supplier account.",
      "Click the '+ Record Receipt' button (for customers) or '+ Add Entry' button on the account header.",
      "Select the entry type: 'Receipt', 'Payment', 'Credit Note', 'Debit Note', or 'Adjustment'.",
      "Fill in the Date, Amount (₹), Payment Mode (RTGS, NEFT, Cheque, Cash, UPI), and Instrument / UTR / Cheque Number.",
      "Optionally select open bills to allocate the payment against.",
      "Click 'Save Entry'. The ledger statement and running balance update immediately."
    ]
  },
  {
    id: "import_statement",
    title: "How to Import Account Statements",
    keywords: ["import statement", "import ledger", "upload statement", "reconcile", "reconciliation"],
    route: "/accounts/import",
    summary: "Import existing PDF or XLSX account statements to bulk-populate party ledger transactions.",
    steps: [
      "Go to [Import Statement](/accounts/import).",
      "Select the party account (Customer or Supplier) or let the parser auto-detect the party from the statement header.",
      "Upload the ledger statement PDF or Excel file.",
      "Preview the parsed transactions: Opening Balance, Date, Particulars, Cheque/Doc numbers, Debit, Credit, and Balance.",
      "Verify that the calculated closing balance matches the original file's closing balance.",
      "Click 'Confirm & Commit Import' to save all entries to the database."
    ]
  },
  {
    id: "stock_inventory",
    title: "How to Check Stock & Adjust Inventory",
    keywords: ["stock", "inventory", "stock summary", "closing stock", "adjust stock", "stock ledger", "kg", "quantity"],
    route: "/stock",
    summary: "View live inventory balances for all chemicals and raw materials, track stock movements, or enter stock adjustments.",
    steps: [
      "Visit [Stock Summary](/stock) for a high-level table of all products with Opening Stock, Purchases (+), Sales (-), Adjustments (+/-), and Current Live Stock (in kg).",
      "To see all products and master rates, visit [Products](/products).",
      "To record a manual adjustment (e.g. physical audit variance, spillage, sample transfer), click '+ Adjust Stock'.",
      "Select the product, date, adjustment type (ADD or DEDUCT), quantity in kg, and enter a reason/note.",
      "Click 'Save Adjustment'. The live stock updates immediately via the append-only stock movement ledger."
    ]
  },
  {
    id: "purchases_management",
    title: "How to Manage Purchase Invoices & Suppliers",
    keywords: ["purchase", "purchases", "supplier invoice", "purchase invoice", "suppliers", "vendor", "buy"],
    route: "/purchases",
    summary: "Track inward material bills from chemical suppliers, calculate GST input tax credit, and record stock additions.",
    steps: [
      "Navigate to [Purchase Invoices](/purchases).",
      "To upload or add a purchase bill, click '+ Upload Purchase' or use the [Upload](/upload) screen.",
      "Review the supplier name, invoice number, items, and tax breakdown.",
      "When saved, inward quantities are automatically added to your stock ledger.",
      "To manage supplier information, addresses, and GSTINs, visit [Suppliers](/suppliers)."
    ]
  }
];

export function findMatchingGuides(query: string): TaskGuide[] {
  const q = query.toLowerCase();
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);

  const scored = APP_GUIDES.map((guide) => {
    let score = 0;
    const titleLower = guide.title.toLowerCase();
    const summaryLower = guide.summary.toLowerCase();

    // Direct phrase match in keywords
    for (const kw of guide.keywords) {
      if (q.includes(kw)) {
        score += 10;
      } else {
        const kwWords = kw.split(/\s+/).filter((w) => w.length > 2);
        if (kwWords.length > 1 && kwWords.every((w) => q.includes(w))) {
          score += 8;
        }
      }
    }

    // Word matches in title or keywords
    for (const word of qWords) {
      if (titleLower.includes(word)) score += 3;
      if (guide.keywords.some((kw) => kw.includes(word))) score += 2;
      if (summaryLower.includes(word)) score += 1;
    }

    return { guide, score };
  });

  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.guide);
}
