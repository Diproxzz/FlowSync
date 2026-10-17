# Product Requirement Document — Indobest Insights

| | |
|---|---|
| Version | 1.0 (draft for AI build) |
| Date | 2026-10-15 |
| Owner | Dipro Chowdhury |
| Companion docs | `Design System.md`, `Architecture.md`, `AI Build Prompt.md` |

---

## 1. Summary

Indobest Insights is a single-owner web app for a leather-chemicals dealership (issuer name on invoices: **INDOBEST**, Kolkata). The owner

1. loads the **product catalogue with opening stock and standard rates** (replacing the `Product_Master` / `Stock_Summary` sheets of `Leather_Chemicals_Stock_System_2026-27.xlsx`),
2. **uploads scanned GST sales-invoice PDFs**; an LLM extracts the structured data,
3. **reviews a preview**, corrects it, and saves it to a database (with duplicate-invoice protection),
4. reads a **dashboard** for product, customer, GST and stock analysis.

**Cost constraint:** all AI calls use LLM providers the owner already holds free-tier API keys for (Gemini, OpenRouter free models, Groq, optionally local Ollama). No paid OCR/AI service. Hosting is local or free-tier.

## 2. Goals and non-goals

**Goals**
- G1. Replace manual re-typing of invoices into Excel; target < 60 seconds from upload to saved for a typical 1–3 line invoice.
- G2. Never store unreviewed LLM output: every invoice passes a human preview.
- G3. Never store the same invoice number twice without an explicit decision by the user.
- G4. Keep customers and products clean: new ones are created and mapped automatically (with confirmation), variants of existing ones are matched, not duplicated.
- G5. Give actionable analysis: what sells, to whom, at what rate vs standard, what is running low.

**Non-goals (v1)**
- Generating invoices (invoices come from Marg ERP).
- Full accounting, payments/receivables, e-way bills, GST filing.
- Multi-user roles, multi-company, mobile app.
- Purchase-invoice OCR (purchases can be entered manually as stock-in; see FR-STK-3).

## 3. User

One owner-operator (Dipro). Works on desktop mostly, occasionally phone. Comfortable with Excel; not a developer at point of use. Language: English. Currency: INR (₹), Indian digit grouping (₹1,25,000.00). Financial year April–March (current: FY 2026-27).

## 4. Ground truth from the sample invoices

All three samples are **image-only PDFs (no text layer)** in the same Marg ERP template, one page each, one issuer. Extraction therefore needs a **vision-capable model** (or OCR).

| Field | Inv 473 | Inv 474 | Inv 475 |
|---|---|---|---|
| Customer | RAHMAN INDUSTRIES LTD. | SUPER TANNERS SYNDICATE | TIGER INTERNATIONAL |
| Customer GSTIN | 19AAACR6862N1ZP | 19ACSFS7525C1ZP | 19ACUPA0333J1ZL |
| Invoice no. | IB26-27/0473 | IB26-27/0474 | IB26-27/0475 |
| Date | 2026-10-12 | 2026-10-12 | 2026-10-12 |
| Line 1 | BESTRUB 108 · 660 kg · pack 220 · HSN 40025100 · rate 320 · taxable 211,200.00 · 9%/9% · amount 249,216.00 | AA ACTOIL · 120 kg · pack 120 · HSN 34039100 · rate 105 · taxable 12,600.00 · 9%/9% · amount 14,868.00 | ACTIPACT DLP-S · 360 kg · pack 120 · HSN 32021000 · rate 428 · taxable 154,080.00 · 9%/9% · amount 181,814.40 |
| Line 2 | "Silcoat CS30,OSOL TSM3" · 600 kg · pack 60 · HSN 38241000 · rate 178 · taxable 106,800.00 · 9%/9% · amount 126,024.00 | — | — |
| Sub total | 318,000.00 | 12,600.00 | 154,080.00 |
| SGST / CGST | 28,620.00 each | 1,134.00 each | 13,867.20 each |
| Round-off | 0.00 | 0.00 | −0.40 (printed "0.40") |
| Grand total | 375,240.00 | 14,868.00 | 181,814.00 |

(HSN digits were read from the scan; the build must verify against the PDFs in `data/samples/`.) These three are the **golden fixtures** for tests (see §11).

Observations the build must handle:
- **Issuer GSTIN `19AVZPC2361G1ZA` appears in the header.** It is the owner's own and must **never** be stored as the customer GSTIN.
- **`Qnty` is in kg**; `Pack` is drum size (kg), not a count. Taxable = Qnty × Rate (660×320 = 211,200).
- **Line `Amount` includes GST** (taxable × 1.18). It is not the taxable amount.
- **Invoice product names differ from master codes.** The workbook identifies products by short codes (`AA`, `DLPS`, `Silcoat`, …); invoices print commercial names (`AA ACTOIL`, `ACTIPACT DLP-S`). Matching is a core feature (FR-MAP).
- **Customer names differ in spelling/case** between workbook ("Tiger International", "Super Tanners") and invoice ("TIGER INTERNATIONAL", "SUPER TANNERS SYNDICATE"). GSTIN is the reliable key.
- Invoice 473 line 2 has **two product names in one line** (`Silcoat CS30,OSOL TSM3`) with a single qty/rate; the preview must let the user map it to one product or split it.
- Sale rates on invoices differ slightly from master standard rates (AA: invoice 105 vs master sale rate 106) → rate-variance analytics.

## 5. Functional requirements

Priority: **M** = must (v1), **S** = should (v1 if time allows), **C** = could (later).

### 5.1 Product catalogue and opening stock (FR-PRD)
- FR-PRD-1 (M) Products have: code (unique), name, category (optional), default HSN (optional), pack size kg, opening stock kg, standard purchase rate ₹/kg, standard sale rate ₹/kg, reorder level kg, active flag.
- FR-PRD-2 (M) One-time **seed/import from the supplied XLSX** (`Product_Master` → products; opening stock → opening movement dated 2026-04-01). Also a UI importer for CSV/XLSX with a column-mapping step and a preview of rows to be created/updated.
- FR-PRD-3 (M) Add, edit, deactivate products in the UI. Edits to standard rates do not change historical invoices.
- FR-PRD-4 (M) Each product has **aliases** (names printed on invoices). Aliases are editable and are created automatically when the user confirms a mapping (FR-MAP-3).
- FR-PRD-5 (S) Product detail page: sales history, customers, rate trend vs standard.

### 5.2 Invoice upload and extraction (FR-UP)
- FR-UP-1 (M) Upload one or many PDFs (also PNG/JPG) by drag-drop or picker; max 10 MB each; reject non-invoice files gracefully.
- FR-UP-2 (M) Extract: **customer name, invoice number, invoice date, customer GSTIN, and per line: product name, qty (kg), HSN, rate, taxable amount, CGST %, SGST %, line amount; plus invoice totals: taxable subtotal, CGST total, SGST total, round-off, grand total.** (Pack size is also captured; it is useful for drum counts.)
- FR-UP-3 (M) Extraction uses the owner's configured LLM providers in priority order with automatic fallback (see Architecture §6). If every provider fails, show the error and allow **manual entry** into the same preview form.
- FR-UP-4 (M) Multiple files are processed sequentially into a **review queue**; the user reviews and saves them one by one, with progress ("2 of 5").
- FR-UP-5 (M) Nothing is written to the invoice tables until the user presses **Save**.

### 5.3 Preview and verification (FR-PV)
- FR-PV-1 (M) Split view: original document (zoom/pan) on the left; **editable** extracted data on the right (header, line items, totals).
- FR-PV-2 (M) Automatic **arithmetic validation**, shown per row and per total as ✓ / ⚠:
  - taxable = qty × rate (±₹0.01)
  - line amount = taxable × (1 + CGST% + SGST%) (±₹0.05)
  - Σ taxable = sub total; Σ CGST = CGST total; Σ SGST = SGST total
  - grand total = sub total + CGST + SGST + round-off, with |round-off| ≤ ₹1
  - GSTIN format (15 chars, regex + checksum) and ≠ company GSTIN
  - date is valid, not in the future, and falls in the stated FY of the invoice number when parsable
- FR-PV-3 (M) Fields the model flagged as uncertain, and fields failing validation, are highlighted. The Save button is enabled when there are no **errors**; **warnings** require an explicit "I've checked" tick.
- FR-PV-4 (M) User may add/remove/reorder lines and edit any value; totals revalidate live.
- FR-PV-5 (S) "Re-extract with another model" button to retry with the next provider.

### 5.4 Customer and product mapping (FR-MAP)
- FR-MAP-1 (M) **Customer resolution order:** (1) exact GSTIN; (2) normalized-name exact or alias; (3) fuzzy name match ≥ threshold → shown as "Did you mean …?"; (4) otherwise "New customer". The preview shows the outcome as a badge (Matched / Suggested / New) and lets the user pick another existing customer or create new.
- FR-MAP-2 (M) **Product resolution order:** (1) alias exact; (2) master code appears as the leading token(s) of the name (`AA ACTOIL` → `AA`); (3) fuzzy match ≥ threshold; (4) optional LLM suggestion constrained to master codes; (5) "New product". Each line shows a badge and a dropdown to remap or create.
- FR-MAP-3 (M) On save, any user-confirmed mapping stores an alias, so the same name auto-matches next time. New customers/products are inserted with the extracted data (new product: sale rate = invoice rate, opening stock 0, flagged `needs_review`).
- FR-MAP-4 (M) If a customer's GSTIN is new for an existing name (or the reverse), warn and ask whether to update, add as new, or merge.
- FR-MAP-5 (S) Customers page can merge two customers (re-points invoices, keeps aliases).

### 5.5 Duplicate invoice handling (FR-DUP)
- FR-DUP-1 (M) Invoice numbers are normalized (trim, uppercase, collapse spaces) and are **unique** in the database.
- FR-DUP-2 (M) Immediately after extraction (and again live when the user edits the number), check the DB. If found, show a modal: *"Invoice IB26-27/0473 already exists (saved 12 Oct 2026, ₹3,75,240.00, Rahman Industries Ltd). Do you want to modify it?"* with **Modify existing** / **Don't save (discard)** / **View existing**.
- FR-DUP-3 (M) **Modify existing** opens the preview in *edit mode* with a **field-by-field diff** (existing vs newly extracted). Saving replaces the invoice and its lines in one transaction, rebuilds its stock movements, and writes an audit revision (old snapshot kept).
- FR-DUP-4 (M) **Discard** leaves the database untouched.
- FR-DUP-5 (S) Also warn when the same **file hash** was uploaded before under a different number.

### 5.6 Invoices list (FR-INV)
- FR-INV-1 (M) Searchable, filterable (date, customer, product, amount) table; row opens detail with lines, totals, stored original PDF, revision history.
- FR-INV-2 (M) Edit (same preview form) and delete (confirm; removes stock movements).
- FR-INV-3 (S) Export filtered list and line items to CSV/XLSX.

### 5.7 Stock (FR-STK)
- FR-STK-1 (M) Closing stock per product = opening + purchases − sales − adjustments, matching the `Stock_Summary` logic; confirmed invoice lines create SALE movements automatically.
- FR-STK-2 (M) Stock page replicates `Stock_Summary` columns: opening, purchases, sales, adjustments, closing, packing size, drums, stock value (closing × standard purchase rate), sales value, reorder level, status (LOW STOCK / OK).
- FR-STK-3 (M) Manual stock-in (purchase) and adjustment entries (date, product, qty, note).
- FR-STK-4 (M) **Opening-stock date setting.** The workbook's opening stock is "as on 01.04.2026" and its transactions run only to 16 Jul 2026, while sample invoices are dated 12 Oct 2026. The seed script therefore offers `--with-legacy-transactions` to import the workbook's 601 transaction rows as **quantity-only legacy movements** (no ₹ values, excluded from revenue analytics) so closing stock reconciles. Any gap between 16 Jul and the first uploaded invoice is shown as a dismissible banner ("No movements recorded between 16 Jul and 12 Oct").
- FR-STK-5 (S) Warn at save time if a sale would drive a product's stock negative.

### 5.8 Dashboard (FR-DB)
Default period: current financial year; presets: This month, Last 30 days, This quarter, FY, custom. Filters: customer, product. All widgets respect filters. Figures are **taxable value (excl. GST)** unless labelled.

**KPI row:** Sales (taxable), GST collected, Invoices, Quantity sold (kg), Average invoice value, Active customers, Low-stock products.

**Sales trend:** monthly taxable sales and kg (toggle), with previous-period comparison.

**Product analysis**
- Top products by revenue and by kg (top 10, "others" bucket).
- **ABC / Pareto** (A ≤ 80% cumulative revenue, B ≤ 95%, C rest — same rule as the workbook's *Analysis* sheet).
- **Rate realization:** average invoiced rate vs standard sale rate per product (variance % and ₹); estimated margin/kg = invoiced rate − standard purchase rate, labelled *estimate*.
- Product movement: turnover = kg sold ÷ average(opening, closing); days of stock = closing ÷ (kg sold in last 90 days ÷ 90); slow-moving > 180 days; dead stock = stock but zero sales.
- Low-stock list with reorder level.

**Customer analysis**
- Top customers by revenue; share of top 5 (concentration).
- New vs repeat customers per month; **lapsed** customers (no invoice in last 60 days, configurable).
- Customer × product matrix (revenue or kg) for top 10 × top 10.
- Average order value and order frequency per customer.

**Tax:** CGST + SGST collected per month, per HSN (HSN summary table).

**Data-quality panel:** products flagged `needs_review`, customers without GSTIN, invoices saved with unresolved warnings.

- FR-DB-2 (M) Every chart has a "view data" table toggle and CSV export. Every bar/segment is clickable to drill into the underlying invoices.
- FR-DB-3 (S) Customer detail and product detail pages with their own mini-dashboards.

### 5.9 Settings and LLM configuration (FR-SET)
- FR-SET-1 (M) Company name and GSTIN (default `INDOBEST`, `19AVZPC2361G1ZA`), financial-year start month, low-stock default, lapsed-customer days, fuzzy-match threshold.
- FR-SET-2 (M) LLM providers are configured by **environment variables** (never stored in the DB, never sent to the browser). Settings page shows each provider as *configured / not configured*, the model in use, and a **Test connection** button; it also lets the user reorder provider priority.
- FR-SET-3 (S) Extraction log viewer (provider used, latency, validation warnings) for debugging.

### 5.10 Access (FR-AUTH)
- FR-AUTH-1 (M) Single password login (hashed in env), secure session cookie, logout, login rate-limiting. All pages and APIs except `/login` require a session. The data includes customer GSTINs and prices, so the app must not be publicly open.

## 6. Key user flows

**Upload (happy path):** Upload → progress "Reading invoice…" → preview (split view) with badges → fix anything → Save → toast "Invoice IB26-27/0474 saved · 1 new customer · 0 new products" → next in queue or dashboard.

**Duplicate:** Upload → extraction → modal "already exists" → *Modify existing* → diff view → Save replaces; or *Discard*.

**New product on an invoice:** badge "New product: BESTRUB 108" with options *Create new* (pre-filled) / *Map to existing…* → Save → product created, alias stored.

**Extraction failure:** error card with provider-by-provider reasons → *Retry*, *Try another model*, or *Enter manually*.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Accuracy | On the golden fixtures: 100% of fields correct after validation + at most one automatic repair retry; user corrections allowed. |
| Performance | Extraction ≤ 30 s per page on free tiers; dashboard loads ≤ 2 s with 5,000 invoice lines. |
| Reliability | Save is one DB transaction; a failed save leaves no partial data. Provider rate-limit (429) → fall back to next provider, then show a clear message. |
| Data integrity | Money as fixed-point decimals (never floats). DB uniqueness on normalized invoice number. |
| Security | Keys only in server env; session cookie `HttpOnly`, `Secure`, `SameSite=Lax`; uploads type- and size-checked; no document content in logs beyond the extraction log (can be disabled). |
| Privacy | Free-tier LLM providers may retain or train on submitted content under their terms. Invoices contain customer names and GSTINs; the owner should review each provider's free-tier data policy, and may choose local Ollama for full privacy. |
| Accessibility | WCAG 2.2 AA contrast; full keyboard operation of the preview form; status never conveyed by colour alone. |
| Responsive | Usable at 360 px width; the split preview stacks (document on top, collapsible). |
| Portability | Runs locally with Docker (Postgres) and on free hosting (e.g. Vercel + Neon/Supabase); no vendor lock-in beyond env vars. |

## 8. Data requirements

Detailed schema in `Architecture.md` §4. Core entities: `products`, `product_aliases`, `customers`, `customer_aliases`, `invoices`, `invoice_items`, `invoice_revisions`, `stock_movements`, `extraction_logs`, `settings`.

## 9. Success metrics

- ≥ 95% of invoices need **zero or one** field correction in preview after a month of use.
- ≥ 90% of product lines auto-matched after the first 30 invoices (alias learning).
- 0 duplicate invoice numbers in the database.
- Dashboard totals reconcile to the sum of saved invoices (automated test).

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Free-tier rate limits or model removal | Provider fallback chain; model names in env, not code; local Ollama option; manual-entry path |
| LLM misreads digits (HSN, GSTIN) | Arithmetic and GSTIN-checksum validation; user preview; optional deterministic template-parser cross-check (Architecture §6.7) |
| Customer GSTIN confused with issuer GSTIN | Prompt rule + validator rejecting `COMPANY_GSTIN` |
| Stock figures wrong due to history gap | FR-STK-4 legacy import, as-of date banner |
| Product name ambiguity (combined lines) | Split-line control in preview |
| Free-tier privacy terms | Documented in NFR; local model option |

## 11. Acceptance tests (minimum)

1. Upload the three sample PDFs → preview values equal §4 ground truth (after validation/repair).
2. Save 473, upload 473 again → duplicate modal appears; *Discard* → DB unchanged; *Modify* → diff shown; change qty → save → one invoice row, new revision row, stock movement updated.
3. Upload 475 with a customer previously unknown → customer created with GSTIN; upload another invoice for the same GSTIN with a different spelling → matched, not duplicated.
4. `AA ACTOIL` maps to product `AA` automatically; `BESTRUB 108` (no match) offers *Create new / Map to existing*; after confirming, a second invoice with the same name auto-matches.
5. Tamper a preview value (e.g. grand total) → Save is blocked with an error.
6. Disable the first provider key → extraction falls back to the next provider.
7. Dashboard KPI "Sales (taxable)" equals Σ taxable of saved invoices in range.
8. Unauthenticated request to any API returns 401.

## 12. Open questions & evolutions

1. Do you also want purchase invoices (from suppliers) uploaded the same way later?
   - **Resolved & Implemented**: Full Purchase Module implemented in October 2026 under `FEATURE_PURCHASES` feature flag (see Section 13).
2. Should Apr–Jul sales from the workbook be imported as quantity-only legacy movements? *Assumed: yes, via the seed flag.*
3. Are IGST (inter-state) invoices expected? *Assumed: schema supports `igst_pct`/`igst_amount` columns, UI shows them only when present; multi-state procurement supported.*
4. Which free providers will be configured first? *Configured: Gemini primary, Groq / OpenRouter / Ollama fallback.*

## 13. Purchase Module Extension (Delivered Specifications)

### 13.1 Requirements Matrix
| ID | Requirement | Description |
|---|---|---|
| **FR-PUR-1** | Purchase Invoice Upload & Extraction | Mirror sales extraction pipeline for vendor bills in PDF/image format. |
| **FR-PUR-2** | Multi-Tier Supplier Resolution | Resolution via GSTIN (with checksum validation), alias matching, normalized legal names, and Levenshtein similarity. |
| **FR-PUR-3** | Compound Duplicate Detection | Duplicates isolated by `(supplier_id, invoice_number_norm)`. Same invoice # from different suppliers is allowed; identical invoice from the same supplier prompts revision/replace. |
| **FR-PUR-4** | Deterministic Unit Conversion | Auto-converts diverse vendor packaging (MT, Tonnes, Gms, Litres, Drums, Bags, Carboys) into kilograms (`kg`) using product master container capacities. |
| **FR-PUR-5** | Stock-In Ledger Linkage | Saves create `PURCHASE` movements linked to `purchase_invoice_item_id`. Mutual exclusivity with sales items enforced via PostgreSQL constraint `check_stock_movement_item_link`. |
| **FR-PUR-6** | Procurement Analytics | Executive procurement dashboard tracking spend, Purchases vs. Sales monthly trends, top suppliers (with top-3 concentration), product price trends, and multi-sourcing price comparisons. |
| **FR-PUR-7** | Margin Upgrade | Product gross margins reflect weighted average actual purchase costs when bills exist in the period, falling back gracefully to standard purchase rates with an *Estimated* indicator. |
| **FR-PUR-8** | Enhanced Stock Summary | Displays last purchase rate & date, dynamic reorder suggestions ($\max(0, \text{reorder\_level} \times 2 - \text{closing})$ rounded to pack size), split breakdown hover tooltips (invoices vs. legacy), and CSV export. |
| **FR-PUR-9** | Feature Flag Isolation | Entire module controlled via `FEATURE_PURCHASES` (`true`/`false`). When disabled, the UI reverts strictly to pure Sales mode. |

