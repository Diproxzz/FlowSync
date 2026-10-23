# Architectural Decision Records (ADRs) - Indobest Insights

This document captures the key architectural and design decisions made while building **Indobest Insights**.

---

## ADR 01: Single-Owner Authentication via Password Hash + HMAC-SHA256 Session Cookie
- **Context:** Indobest Insights is built for a single business owner running a specialized leather chemical distribution enterprise. The owner needs fast, friction-free login on desktop and mobile without managing third-party OAuth providers, redirect URLs, or external identity databases.
- **Decision:** Use an application-level password hash (`APP_PASSWORD_HASH`) verified via `bcryptjs`, setting an `httpOnly`, `sameSite=lax`, encrypted/signed JWT session cookie using `jose` with HMAC-SHA256 (`SESSION_SECRET`). Protect login against brute-force attacks via sliding window IP-based rate limiting (5 attempts per 5 minutes).
- **Consequences:** Eliminates external identity dependencies and monthly costs while providing strict route protection across both `/api/*` and UI pages via Next.js Middleware.

---

## ADR 02: Zero Unreviewed Writes & Single Transaction Confirm
- **Context:** Vision LLMs are probabilistic by nature and can hallucinate product names, rates, or figures. Ledger integrity is mission-critical for GST compliance and physical inventory audits.
- **Decision:** Mandate a strict "Human-in-the-Loop" architecture:
  1. The LLM extraction pipeline returns an in-memory draft with field-level uncertainty flags.
  2. The draft is validated server-side and presented to the user in a split-screen review UI with live arithmetic cross-checks.
  3. Writes to the database occur *only* when the user explicitly clicks "Confirm Invoice".
  4. Confirmation is executed inside a single, atomic Prisma transaction (`prisma.$transaction`) that resolves customers, products, writes invoice records, and logs stock movements simultaneously.
- **Consequences:** Eliminates corrupted or orphaned stock entries. An invoice either completely confirms with inventory deduction or rolls back cleanly.

---

## ADR 03: Decimal Arithmetic over JavaScript Float Math
- **Context:** JavaScript's native IEEE-754 64-bit floating point arithmetic causes precision artifacts (e.g. `0.1 + 0.2 = 0.30000000000000004`). In financial accounting and GST audits, discrepancy of even ₹0.01 can trigger audit scrutiny.
- **Decision:**
  - All currency calculations use `Decimal(14, 2)` (PostgreSQL `NUMERIC(14,2)` and `decimal.js`).
  - All inventory weights use `Decimal(12, 3)` (PostgreSQL `NUMERIC(12,3)`).
  - Derived round-offs are computed explicitly as `grandTotal - (taxableSubtotal + cgst + sgst + igst)`.
- **Consequences:** 100% precision matching GST invoices and bank statements.

---

## ADR 04: Fast Local PDF Rasterization with PyMuPDF
- **Context:** Processing scanned multi-page invoices via client-side Canvas rendering or Node.js image decoders can take 2–5 seconds per page and consume hundreds of megabytes of RAM.
- **Decision:** Implement `scripts/rasterize-pdf.py` using Python's high-performance `PyMuPDF` (Fitz). Invoices are rasterized at 150 DPI (standard `1241x1754` resolution) in under 80 milliseconds per page and passed as JPEG buffers to vision models. Fallback to `pdfjs-dist` is maintained if Python is unavailable in the environment.
- **Consequences:** Rapid OCR throughput, lower token usage, and clear legibility for low-contrast dot-matrix or carbon-copy scans.

---

## ADR 05: Double-Entry Stock Movement Ledger with Aggregate PostgreSQL View
- **Context:** Storing mutable "current stock" directly as a column on `products` risks drift and race conditions during concurrent modifications, deletes, or invoice replacements.
- **Decision:** Implement an append-only transaction ledger (`stock_movements`) supporting `OPENING`, `PURCHASE`, `SALE`, and `ADJUSTMENT` movement types. Compute live stock dynamically using the PostgreSQL aggregate view `v_stock_summary`:
  $$\text{Closing Stock} = \sum \text{Opening} + \sum \text{Purchase} - \sum \text{Sale} \pm \sum \text{Adjustment}$$
- **Consequences:** Provides an audit trail for every kilogram of chemical product. Deleting or modifying an invoice automatically updates closing stock by deleting or snapshotting associated movements. Reconciles 100% with workbook total closing stock (72,743 kg).

---

## ADR 06: Luhn Mod 36 GSTIN Validation & Own GSTIN Rejection
- **Context:** Scanned invoices show both Seller and Buyer GSTINs in close proximity. LLMs frequently confuse the seller's header GSTIN with the customer's GSTIN.
- **Decision:**
  1. Validate all GSTINs against the official 15-character Indian GST format `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`.
  2. Verify Luhn mod 36 checksum.
  3. Reject `COMPANY_GSTIN` (`19AVZPC2361G1ZA` / INDOBEST) if captured as the customer's GSTIN, flagging it with a descriptive correction warning.
- **Consequences:** Zero misattribution of Indobest's own tax registration to buyers.

---

## ADR 07: Product Code Matching Hierarchy (Leading-Code Rule + Aliases + Levenshtein)
- **Context:** Invoices print descriptive product names like `AA ACTOIL`, `KG DEGREASING AGENT`, or `SILCOAT CS30,OSOL TSM3` whereas the product catalog identifies them by primary codes like `AA`, `KG`, or `Silcoat`.
- **Decision:** Resolution order:
  1. **Exact Alias Lookup:** Match against normalized user-approved aliases in `product_aliases`.
  2. **Leading-Code Prefix Rule:** Split by whitespace or punctuation; if the first token matches a product code (`AA ACTOIL` $\rightarrow$ `AA`), match with high confidence.
  3. **Code Contains Rule:** If a multi-character product code is contained in the name.
  4. **Fuzzy Similarity:** Levenshtein distance ratio with threshold $\ge 0.85$.
  5. **Auto-learning:** When confirmed, user-approved raw descriptions are permanently stored in `product_aliases`.
- **Consequences:** System intelligence compounds over time; repeated invoices achieve 100% automatic product resolution.

---

## ADR 08: Compound Unique Key `(supplier_id, invoice_number_norm)` for Purchases
- **Context:** Sales invoices are issued by Indobest and thus share a single global serial sequence (`IB26-27/...`). Purchase bills are issued by hundreds of external vendors, each with their own numbering sequences (e.g., vendor A and vendor B both issuing invoice #101).
- **Decision:** Purchases enforce uniqueness on `(supplier_id, invoice_number_norm)` rather than a global invoice number string. Duplicate detection warns or prompts replacement only when the *same vendor* submits an identical invoice number in the same fiscal window.
- **Consequences:** Completely prevents false duplicate rejections between distinct vendors while strictly blocking duplicate entry of the same vendor's bill.

---

## ADR 09: Mutual Exclusivity Constraint on StockMovement Links
- **Context:** In PostgreSQL, a `stock_movements` row can be generated either from a sales invoice item (type `SALE`) or a purchase invoice item (type `PURCHASE`). If both `invoice_item_id` and `purchase_invoice_item_id` were set, or if neither was set on an invoice-sourced movement, ledger integrity would be compromised.
- **Decision:** Enforce a database-level PostgreSQL CHECK constraint:
  ```sql
  CONSTRAINT check_stock_movement_item_link CHECK (
    (invoice_item_id IS NULL AND purchase_invoice_item_id IS NULL) OR
    (invoice_item_id IS NOT NULL AND purchase_invoice_item_id IS NULL) OR
    (invoice_item_id IS NULL AND purchase_invoice_item_id IS NOT NULL)
  )
  ```
- **Consequences:** Database-enforced impossibility of data corruption; stock ledger entries can never cross-link sales and purchase items simultaneously.

---

## ADR 10: Automatic Unit Normalization & Packaging Fallback Engine
- **Context:** Vendor invoices bill in diverse units: kilograms (KG, KGS), metric tons (MT, TONNES), grams (GMS), drums, carboys, or bags. Inventory must be accounted strictly in standard kilograms (kg) for valuation and dispatch.
- **Decision:** Implement a deterministic conversion engine (`src/lib/units/convert.ts`) with decimal arithmetic:
  - Metric units: `MT` $\times 1000$, `GMS` $/ 1000$, `LTR` $\times \text{density (default 1.05)}$
  - Packaging units: `DRUMS`, `BAGS`, `CARBOYS` multiplied by product master `pack_size_kg`.
  - When pack size is unknown or ambiguous, extraction flags `UNIT_CONVERSION_AMBIGUOUS` with severity `warning`, prompting explicit user selection or drum weight entry in the UI before confirmation.
- **Consequences:** Eliminates inventory unit drift and ensures rates are normalized to ₹/kg across all analytics and stock views.

---

## ADR 11: Real-Time Supplier Resolution with GSTIN Checksum Validation
- **Context:** Supplier names on purchase bills vary widely between abbreviated trade names, vendor logos, and full registered legal entities.
- **Decision:** Use a 4-tiered resolution cascade:
  1. **GSTIN Match:** Exact match on clean 15-character GSTIN (with Luhn mod-36 checksum validation).
  2. **Alias Match:** Normalized exact match against `supplier_aliases`.
  3. **Normalized Name Match:** Normalized string comparison against `suppliers.name_norm`.
  4. **Fuzzy Levenshtein Match:** Confidence scoring $\ge 0.85$.
  5. Auto-learning: User confirmations automatically register approved trade names into `supplier_aliases`.
- **Consequences:** Consistent supplier master records, zero duplicate vendor accounts, and reliable multi-sourcing pricing history.

---

## ADR 12: Weighted-Average Margin Architecture (Actual vs. Estimated)
- **Context:** Margin per product was previously calculated using static master catalog `std_purchase_rate`. Now that actual purchase invoices exist, true realized margin should reflect actual procurement cost when available.
- **Decision:**
  - Compute period-weighted average purchase cost per kg: $\bar{C} = \frac{\sum \text{Purchase Taxable}}{\sum \text{Purchase Volume (kg)}}$.
  - If purchase bills exist for the product in the period: Margin = $\text{Avg Sale Rate} - \bar{C}$ (badged as **ACTUAL**).
  - If no purchase bills exist in the period: Fall back to $\text{Avg Sale Rate} - \text{std\_purchase\_rate}$ (badged as **ESTIMATED**).
- **Consequences:** Provides actionable gross profit analytics per chemical product without breaking historical reports or failing when purchase bills have not yet been uploaded.

---

## ADR 13: Reorder Suggestion and Multi-Sourcing Price Analytics
- **Context:** Chemical distribution requires proactive replenishment before stocks fall below critical batch processing thresholds.
- **Decision:**
  - Dynamic reorder suggestion: $\max(0, \text{reorder\_level\_kg} \times 2 - \text{closing\_kg})$, rounded up to the nearest integer multiple of the product's `pack_size_kg`.
  - Multi-sourcing comparison: For any product sourced from $\ge 2$ vendors, display vendor rate spreads, latest purchase rates, and total volume share to empower procurement negotiations.
- **Consequences:** Prevents stock-outs, optimizes drum packaging order sizes, and provides immediate cost-saving insights across competing suppliers.

