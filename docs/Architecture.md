# Architecture — Indobest Insights

Version 1.0 · 2026-10-15 · Read together with `Product Requirement Document.md` (FR-* ids are referenced below).

## 1. Principles

1. **Human-in-the-loop:** LLM output is a *draft*. Only the confirm endpoint writes invoices.
2. **Provider-agnostic AI:** one interface, several free providers, fallback chain, models set by env.
3. **Deterministic checks beat model confidence:** arithmetic and GSTIN validation decide what is flagged.
4. **Single deployable:** one Next.js (TypeScript) app + PostgreSQL. No separate backend service.
5. **Money is decimal.** No floating-point currency anywhere (DB, server, client).

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (latest stable, App Router) + TypeScript (strict) | Server Components for dashboard reads; Route Handlers for upload/extract |
| UI | Tailwind CSS, shadcn/ui (Radix), lucide-react | Tokens in `Design System.md` |
| Charts | Recharts | Wrapped in `components/charts/*` |
| Tables | TanStack Table | Sort/filter/paginate server-side for invoices |
| Forms | react-hook-form + Zod resolvers | Preview form is the most complex form |
| DB | PostgreSQL 16 | Local: Docker Compose. Hosted free: Neon or Supabase |
| ORM | Prisma | `Decimal` fields; migrations committed |
| Validation | Zod | One schema is shared by LLM output, API bodies, and the form |
| Auth | Single password, bcrypt hash in env, session JWT in cookie (`jose`) | Middleware guards all routes |
| PDF | `mupdf` (WASM) or `pdfjs-dist` + `@napi-rs/canvas` to rasterize; `pdfjs-dist` for text-layer detection | Pick whichever installs cleanly on the host; keep behind `lib/pdf/` |
| LLM | Plain `fetch` to OpenAI-compatible endpoints + native Gemini adapter | No paid SDKs required |
| Fuzzy match | `fastest-levenshtein` + token-set ratio; optional `pg_trgm` for customers | |
| XLSX | `exceljs` or `xlsx` | Seed/import |
| Tests | Vitest (unit), Playwright (e2e) | Golden fixtures from the 3 sample invoices |
| Hosting | Local-first; Vercel Hobby + Neon/Supabase free tier for web | Check current free-tier limits (function timeout, storage) when deploying; set `maxDuration` on the extract route as high as the plan allows |

## 3. System overview

```mermaid
flowchart LR
  U[Owner browser] -->|HTTPS + session cookie| N[Next.js app]
  subgraph N[Next.js app]
    UI[React UI\n/upload /dashboard ...]
    API[Route Handlers /api/*]
    SVC[Services\nextraction · matching · validation · invoices · analytics]
  end
  UI --> API --> SVC
  SVC -->|Prisma| DB[(PostgreSQL)]
  SVC -->|StorageAdapter| FS[(Original PDFs\nlocal disk / Supabase Storage)]
  SVC -->|LLM adapters\nserver-side keys| G[Gemini]
  SVC --> O[OpenRouter free]
  SVC --> Q[Groq]
  SVC --> L[Ollama local]
```

## 4. Data model

PostgreSQL via Prisma. Types: `Decimal(14,2)` for ₹, `Decimal(12,3)` for kg, `Decimal(5,2)` for %, `Decimal(10,2)` for rates.

```mermaid
erDiagram
  customers ||--o{ invoices : has
  customers ||--o{ customer_aliases : has
  invoices ||--|{ invoice_items : contains
  invoices ||--o{ invoice_revisions : audited_by
  products ||--o{ invoice_items : sold_as
  products ||--o{ product_aliases : known_as
  products ||--o{ stock_movements : moves
  invoice_items ||--o| stock_movements : generates
```

### 4.1 Tables

**products**
`id` (cuid) · `code` (unique, citext) · `name` · `category?` · `default_hsn?` · `pack_size_kg` Decimal(8,2)? · `std_purchase_rate` Decimal(10,2)? · `std_sale_rate` Decimal(10,2)? · `reorder_level_kg` Decimal(12,3)? · `is_active` bool=true · `needs_review` bool=false · `source` enum(`MASTER`,`INVOICE_AUTO`,`MANUAL`) · `created_at` · `updated_at`
Rule: `name` defaults to `code` when the workbook has only codes.

**product_aliases** — `id` · `product_id` FK · `alias` · `alias_norm` (unique) · `created_at`
`alias_norm` = lowercase, strip punctuation, collapse whitespace.

**customers**
`id` · `name` · `name_norm` · `gstin?` (unique where not null) · `address?` · `state_code?` (first 2 GSTIN digits) · `created_at` · `updated_at`

**customer_aliases** — `id` · `customer_id` FK · `alias_norm` (unique) · `alias`

**invoices**
`id` · `invoice_number` (as printed) · `invoice_number_norm` (**unique**) · `invoice_date` date · `financial_year` text (`2026-27`) · `customer_id` FK · `customer_name_snapshot` · `customer_gstin_snapshot?` · `taxable_total` · `cgst_total` · `sgst_total` · `igst_total` default 0 · `round_off` Decimal(6,2) (signed: `grand_total − (taxable+cgst+sgst+igst)`) · `grand_total` · `source_file_hash` · `source_file_key?` (storage key) · `extraction_provider?` · `extraction_model?` · `warnings` jsonb · `version` int=1 · `created_at` · `updated_at`
Indexes: `(invoice_date)`, `(customer_id, invoice_date)`, `(financial_year)`.

**invoice_items**
`id` · `invoice_id` FK (cascade) · `line_no` · `product_id` FK · `product_name_raw` · `hsn` · `qty_kg` Decimal(12,3) · `pack_size_kg?` · `rate` · `taxable_amount` · `cgst_pct` · `sgst_pct` · `igst_pct` default 0 · `cgst_amount` · `sgst_amount` · `igst_amount` default 0 · `line_total`
Indexes: `(product_id)`, `(invoice_id, line_no)` unique.

**invoice_revisions** — `id` · `invoice_id` FK · `version` · `snapshot` jsonb (full invoice + items before change) · `reason` text · `changed_at`

**stock_movements**
`id` · `product_id` FK · `movement_date` date · `type` enum(`OPENING`,`PURCHASE`,`SALE`,`ADJUSTMENT`) · `qty_kg` Decimal(12,3) **always positive** · `invoice_item_id?` FK (unique, cascade) · `source` enum(`SEED_OPENING`,`INVOICE`,`MANUAL`,`LEGACY_XLSX`) · `party_text?` · `note?` · `created_at`
Closing stock = Σ(OPENING + PURCHASE) − Σ(SALE + ADJUSTMENT). Revenue analytics read **invoice_items only**, never `LEGACY_XLSX` movements.

**extraction_logs** — `id` · `file_hash` · `provider` · `model` · `latency_ms` · `status` · `attempts` · `raw_response` jsonb · `validation` jsonb · `created_at`

**settings** — `key` (pk) · `value` jsonb. Keys: `company`, `fiscal_year_start_month`, `lapsed_days`, `fuzzy_threshold`, `provider_order`.

### 4.2 Views / queries
- `v_stock_summary` (product_id, opening, purchases, sales, adjustments, closing, drums, stock_value, sales_value, status) — mirrors the workbook's `Stock_Summary`.
- Analytics are plain SQL (via `prisma.$queryRaw`) in `lib/analytics/*.ts`, one function per dashboard widget, each taking `{from, to, customerId?, productId?}`.

### 4.3 Workbook → database mapping

| Workbook | Database |
|---|---|
| Product_Master.Product Code | `products.code` (+ `name` = code) |
| Product_Master.Category | `products.category` (currently empty) |
| Product_Master.Opening Stock (kg) | `stock_movements` OPENING, date `2026-04-01` |
| Product_Master.Packing Size | `products.pack_size_kg` |
| Product_Master.Purchase / Sale Rate | `products.std_purchase_rate` / `std_sale_rate` |
| Product_Master.Reorder Level | `products.reorder_level_kg` (blank → settings default) |
| Transactions (601 rows; Sale/Purchase/Adjustment) | optional `stock_movements` with `source=LEGACY_XLSX`; `Party` → `party_text` |
| Stock_Summary / Analysis | computed (views + analytics), not stored |

The master sheet has a trailing total row (`=SUM(C2:C60)`) with no code: the importer must skip rows without a product code.

## 5. Key flows

### 5.1 Extract (nothing saved)

```mermaid
sequenceDiagram
  participant B as Browser
  participant X as POST /api/invoices/extract
  participant P as pdf/
  participant L as llm/extract
  participant V as validation/
  participant M as matching/
  participant D as DB
  B->>X: multipart file
  X->>X: auth, size/type check, sha256
  X->>P: text layer? rasterize pages
  X->>L: extractInvoice(input)
  L->>L: provider chain + Zod parse + 1 repair retry
  L-->>X: ExtractedInvoice (draft)
  X->>V: validate(draft)
  X->>M: resolveCustomer, resolveProducts
  X->>D: find invoice by number_norm, find by file hash
  X-->>B: {draft, validation, matches, duplicate?, fileToken}
```
`fileToken` references the uploaded file stashed in temp storage so that Save can persist it without re-uploading.

### 5.2 Confirm (single transaction)

`POST /api/invoices` body: `{ draft, customerResolution, productResolutions[], mode: 'create'|'replace', fileToken, acknowledgeWarnings }`

In **one `prisma.$transaction`**:
1. Re-run validation server-side (never trust the client). Errors → 422.
2. Re-check duplicate: `create` + exists → 409; `replace` + missing → 404.
3. Resolve/insert customer (+ alias); resolve/insert products (+ aliases).
4. `create`: insert invoice, items, SALE movements. `replace`: snapshot old → `invoice_revisions`, delete old items (cascade removes their movements), update invoice, insert new items and movements, bump `version`.
5. Move file from temp to permanent storage.
6. Return the saved invoice and a summary (new customers/products count).

### 5.3 Duplicate decision
Client modal states: `EXISTS → {modify | discard | view}`. *Modify* sets `mode='replace'` and loads the diff component with `existing` and `draft`. Live re-check via `GET /api/invoices/exists?number=` when the number field changes (debounced).

## 6. LLM extraction subsystem (`src/lib/llm/`)

### 6.1 Provider interface
```ts
interface LLMProvider {
  id: 'gemini' | 'openrouter' | 'groq' | 'ollama';
  isConfigured(): boolean;
  extract(req: {
    systemPrompt: string;
    userPrompt: string;
    images?: { mime: 'image/png'; base64: string }[];
    text?: string;
    jsonSchema: object;          // for providers that support structured output
    signal: AbortSignal;
  }): Promise<{ rawText: string; model: string; usage?: unknown }>;
}
```
- `gemini`: Google AI Studio free-tier key, REST `generateContent` with `responseMimeType: application/json` and `responseSchema`.
- `openrouter`: OpenAI-compatible `/chat/completions`, a free vision model slug from env, `response_format: json_object` if supported.
- `groq`: OpenAI-compatible, a vision-capable model from env.
- `ollama`: local `/api/chat` with a vision model; only works when the app runs on the owner's machine.

Env holds **key and model name per provider**. Do not hard-code model names: free tiers change. `.env.example` documents each variable and says "set to a current vision-capable model; check the provider's documentation".

### 6.2 Orchestrator (`extract.ts`)
```
for provider in providerOrder.filter(configured):
    try up to 2 attempts:
        raw = provider.extract(...)
        parsed = ExtractedInvoiceSchema.safeParse(JSON.parse(stripFences(raw)))
        if ok -> return {draft, provider, model}
        else second attempt appends: "Your previous JSON failed validation: <zod issues>. Return corrected JSON only."
    on 429/5xx/timeout -> next provider (exponential backoff only for same provider's 429 once)
all failed -> throw ExtractionError{ perProviderReasons[] }
```
Timeout 45 s per call (`AbortController`). Always write an `extraction_logs` row.

### 6.3 Input preparation (`lib/pdf/`)
1. Detect a text layer (`pdfjs` `getTextContent`; threshold e.g. > 200 chars). If present: send text + page image (text gives exact digits).
2. Otherwise (the sample invoices): rasterize each page to PNG at ~150 DPI, long edge ≤ 2000 px; send images. Max 3 pages per invoice in v1 (extra pages → warning).
3. Image-type uploads skip step 1.

### 6.4 Output schema (Zod, shared)
```ts
const Money = z.number().finite();               // model returns JSON numbers; convert to Decimal immediately
export const ExtractedInvoice = z.object({
  customer: z.object({ name: z.string().min(1), gstin: z.string().nullable(), address: z.string().nullable() }),
  invoice: z.object({ number: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  items: z.array(z.object({
    lineNo: z.number().int().positive(),
    productNameRaw: z.string().min(1),
    hsn: z.string().regex(/^\d{4,8}$/).nullable(),
    qtyKg: Money.positive(),
    packSizeKg: Money.nullable(),
    rate: Money.nonnegative(),
    taxableAmount: Money,
    cgstPct: Money, sgstPct: Money, igstPct: Money.default(0),
    cgstAmount: Money.nullable(), sgstAmount: Money.nullable(),
    lineTotal: Money
  })).min(1),
  totals: z.object({
    taxableSubtotal: Money, cgstTotal: Money, sgstTotal: Money, igstTotal: Money.default(0),
    roundOff: Money.nullable(), grandTotal: Money
  }),
  uncertainFields: z.array(z.string()).default([])   // e.g. "items[0].hsn"
});
```
Money values are converted to `Decimal` (e.g. `decimal.js`/Prisma Decimal) on entry to the service layer.

### 6.5 Prompt (`lib/llm/prompts/invoice.ts`)

System prompt must state:
- You transcribe Indian GST tax invoices. **Transcribe, do not calculate or correct.** Output JSON only, matching the schema.
- The **issuer** is the company in the page header ("INDOBEST", GSTIN `{{COMPANY_GSTIN}}`). **Never** use the header GSTIN as the customer's. The **customer** is the party block on the left under the header (name, address, "GSTIN :").
- `Invoice No.` is e.g. `IB26-27/0473`; keep exactly as printed. `Date` is `DD-MM-YYYY` → output `YYYY-MM-DD`.
- Item table columns: `Qnty` = quantity in **kg**; `Pack` = drum size (kg) (not a count); `Product`; `HSN`; `Rate` (₹/kg); `TAXABLE`; `SGST`/`CGST` percent; `Amount` = line total **including tax**.
- A line may contain multiple product names in one cell; keep the text as printed in `productNameRaw`.
- Footer: `SUB TOTAL` = taxable total; `SGST`, `CGST` amounts; optional `Roundoff` (printed positive even when it is subtracted — output the printed number, the server derives the sign); `GRAND TOTAL`.
- Remove thousands separators; numbers are plain JSON numbers. Unknown/illegible → `null` and add the field path to `uncertainFields`.
- Ignore watermark text ("INDOBEST" diagonal), terms & conditions, bank details.

User prompt: "Extract this invoice." + images/text.

### 6.6 Validation (`lib/validation/invoice.ts`)
Pure functions returning `Issue[] = {path, severity: 'error'|'warning', code, message}`:
- `LINE_TAXABLE_MISMATCH` (error): `|qty×rate − taxable| > 0.01`
- `LINE_TOTAL_MISMATCH` (warning→error if > ₹1): `|taxable×(1+cgst%+sgst%+igst%) − lineTotal| > 0.05`
- `SUBTOTAL_MISMATCH`, `CGST_TOTAL_MISMATCH`, `SGST_TOTAL_MISMATCH` (error)
- `GRAND_TOTAL_MISMATCH` (error): `|taxable+cgst+sgst+igst+roundOff − grand| > 0.01`, where `roundOff := grand − (taxable+cgst+sgst+igst)` is **derived**; error if `|derived| > 1`
- `GSTIN_FORMAT` (error): `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` + check-digit algorithm; `GSTIN_IS_COMPANY` (error)
- `GSTIN_MISSING` (warning)
- `DATE_INVALID` (error), `DATE_FUTURE` (warning), `FY_MISMATCH` (warning; compares `26-27` in the number with the date's FY)
- `PRODUCT_UNMAPPED` (error until the user maps or creates), `RATE_VARIANCE` (info: |rate − std| / std > 5%), `NEGATIVE_STOCK` (warning)
- `UNCERTAIN_FIELD` (warning) for each `uncertainFields` path
Server and client share this module.

### 6.7 Optional deterministic cross-check (phase 2)
All of the owner's invoices come from one invoice template. A Tesseract.js (free, local) OCR + regex/position parser can independently read invoice number, date and totals; disagreement with the LLM on these fields adds `CROSSCHECK_MISMATCH` warnings. Not required for v1.

## 7. Matching (`src/lib/matching/`)

`normalize(s)`: lowercase → remove punctuation except digits/letters → collapse spaces → strip company suffix tokens for customers (`ltd`, `pvt`, `private`, `limited`, `co`, `enterprise(s)` kept as meaningful, only legal-form tokens removed).

**Customer** `resolveCustomer(draft.customer)`:
1. `gstin` exact → `MATCHED(reason: 'GSTIN')`. If name differs a lot → also return `nameChanged` info.
2. `name_norm` exact or `customer_aliases` → `MATCHED(reason:'NAME')` (if the draft has a GSTIN and the match has none → offer "add GSTIN to existing customer").
3. similarity ≥ `fuzzy_threshold` (default 0.85, token-set Levenshtein) → `SUGGESTED` with top 3.
4. else `NEW`.

**Product** `resolveProduct(nameRaw)`:
1. `product_aliases.alias_norm` exact → `MATCHED`.
2. **Leading-code rule:** tokens of the name; if the first 1–2 tokens equal a `products.code` (normalized), e.g. `AA ACTOIL` → `AA`; `OIT 9` style codes with spaces handled by joining → `MATCHED(reason:'CODE_PREFIX')`.
3. Whole code contained as a token (e.g. `ACT. CONC`) → `SUGGESTED`.
4. fuzzy ≥ threshold → `SUGGESTED`.
5. Optional: ask the LLM "Which of these codes, if any, is `<name>`?" with the code list, accepting only a code from the list → `SUGGESTED(reason:'LLM')`. Never auto-accept (suggestion only).
6. else `NEW`.
Only `MATCHED(ALIAS)` is silent; everything else is visible in the preview as a badge. User-confirmed choices are persisted as aliases at save.

## 8. Analytics (`src/lib/analytics/`)

One module per widget; all accept `Filters {from, to, customerId?, productId?}`; all sums use `invoice_items` joined to `invoices` (so filters apply consistently).

| Function | Definition |
|---|---|
| `kpis` | Σ taxable; Σ cgst+sgst+igst; count(invoices); Σ qty; avg grand total; count distinct customers; low-stock count (from `v_stock_summary`) |
| `salesTrend` | group by month (`date_trunc`), taxable and kg |
| `topProducts` / `topCustomers` | sum taxable, sum kg, order count; top N + "Others" |
| `abc` | rank products by revenue; cumulative % ≤ 0.80 → A, ≤ 0.95 → B, else C |
| `rateRealization` | per product: weighted avg rate = Σtaxable/Σqty; vs `std_sale_rate`; variance ₹ and %; est. margin/kg = avg rate − `std_purchase_rate` |
| `movement` | turnover = sold ÷ avg(opening, closing); days of stock = closing ÷ (kg sold last 90 d ÷ 90); status SLOW (> 180 d) / DEAD (stock > 0 and sold = 0) |
| `customerCohorts` | first invoice date per customer → new vs repeat per month; lapsed = last invoice older than `lapsed_days` |
| `customerProductMatrix` | top 10 × top 10 revenue |
| `gstByMonth`, `hsnSummary` | Σ cgst/sgst by month; group by hsn: taxable and tax |
| `dataQuality` | counts of `needs_review` products, customers without GSTIN, invoices with warnings |

Query caching: Next.js `unstable_cache`/tags revalidated on invoice save/delete, stock entry, product edit.

## 9. API surface (all require session; JSON; Zod-validated)

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout` | Session |
| `POST /api/invoices/extract` | Multipart → draft + validation + matches + duplicate info |
| `GET /api/invoices/exists?number=` | Duplicate check |
| `POST /api/invoices` | Confirm (create/replace) |
| `GET /api/invoices` · `GET/DELETE /api/invoices/:id` | List (filters, pagination), detail, delete |
| `GET /api/invoices/:id/file` | Stream original PDF |
| `GET/POST /api/products` · `PATCH/DELETE /api/products/:id` | CRUD |
| `POST /api/products/import` (`?dryRun=1`) | CSV/XLSX import |
| `POST /api/products/:id/aliases` · `DELETE /api/aliases/:id` | Alias management |
| `GET /api/customers` · `GET/PATCH /api/customers/:id` · `POST /api/customers/merge` | Customers |
| `GET/POST /api/stock/movements` | List, manual entries |
| `GET /api/stock/summary` | `v_stock_summary` |
| `GET /api/analytics/:widget` | Dashboard widgets (`kpis`, `trend`, `top-products`, …) |
| `GET /api/export/:entity` | CSV/XLSX export |
| `GET/PUT /api/settings` · `POST /api/settings/llm/test` | Settings and provider test |

Errors use `{ error: { code, message, details? } }`; 401/403/404/409 (duplicate)/422 (validation)/429/502 (all providers failed).

## 10. Frontend structure

- **Server Components** fetch analytics for the dashboard; client components only for interactive charts, filters, and the preview form.
- **Upload page state machine** (XState or a small reducer): `idle → uploading → extracting → reviewing → (duplicate)? → saving → saved | error`; one machine instance per queue item.
- **Preview form** (`components/upload/PreviewForm.tsx`): react-hook-form with the shared Zod schema; live validation via the shared `validateInvoice()`; `DocumentViewer` (pdf rasterized images from server; zoom/pan) alongside.
- Global filter state for the dashboard lives in the URL query string (shareable, back-button friendly).

## 11. Security

- All routes protected by `middleware.ts` (except `/login`, static assets). API handlers also call `requireSession()` (defence in depth).
- Secrets only in server env; never prefixed `NEXT_PUBLIC_`; the settings page shows only *configured/not configured*.
- Upload checks: MIME sniffing (magic bytes `%PDF`, PNG, JPEG), ≤ 10 MB, filename sanitized, stored under random keys.
- Login: bcrypt compare, constant-time, IP-based rate limit (in-memory or DB), generic error message.
- CSRF: SameSite=Lax cookie + `Origin` check on mutating requests.
- SQL: Prisma parameterization; `$queryRaw` only with tagged templates.
- Logs: never log API keys; `extraction_logs.raw_response` can be turned off via `LOG_EXTRACTION_PAYLOADS=false`.

## 12. Configuration (`.env.example`)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/indobest
SESSION_SECRET=            # 32+ random bytes
APP_PASSWORD_HASH=         # run: npm run hash-password
COMPANY_NAME=INDOBEST
COMPANY_GSTIN=19AVZPC2361G1ZA

# LLM providers: leave a key blank to disable that provider
LLM_PROVIDER_ORDER=gemini,openrouter,groq,ollama
GEMINI_API_KEY=
GEMINI_MODEL=              # set to a current vision-capable free-tier model
OPENROUTER_API_KEY=
OPENROUTER_MODEL=          # a free vision model slug
GROQ_API_KEY=
GROQ_MODEL=                # a vision-capable model
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=              # a local vision model

STORAGE_DRIVER=local       # local | supabase
STORAGE_LOCAL_DIR=./storage
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_BUCKET=invoices

LOG_EXTRACTION_PAYLOADS=true
```
`src/lib/env.ts` parses env with Zod at boot and fails fast with readable messages.

## 13. Testing strategy

| Level | What |
|---|---|
| Unit | validation rules (use the three golden invoices plus tampered variants); GSTIN checksum; normalization; matching (`AA ACTOIL`→`AA`, `TIGER INTERNATIONAL` ↔ `Tiger International`); analytics SQL against a seeded test DB; ABC/turnover formulas |
| Contract | each provider adapter against recorded fixtures (mock HTTP); orchestrator fallback and repair-retry paths |
| Integration | confirm endpoint: create, duplicate 409, replace (revision + movements rebuilt), rollback on failure |
| E2E (Playwright) | upload 3 PDFs with a **mocked LLM** returning the ground-truth JSON → preview → save → dashboard totals; duplicate modal flows; unauthenticated redirect |
| Live smoke (manual, opt-in) | `npm run test:live-llm` hits real providers with the 3 PDFs and diffs against ground truth |

Golden fixtures live in `tests/fixtures/` (`inv-473.json`, `inv-474.json`, `inv-475.json`) and the PDFs in `data/samples/`.

## 14. Deployment

- **Local:** `docker compose up -d db` → `npm i` → `npx prisma migrate dev` → `npm run seed` → `npm run dev`.
- **Free hosted:** Vercel (web) + Neon or Supabase (Postgres); `prisma migrate deploy` in the build step; `STORAGE_DRIVER=supabase` (serverless disks are ephemeral); extract route `maxDuration` raised to the plan's maximum. Ollama is unavailable when hosted.
- Backups: weekly `pg_dump` script (`scripts/backup.sh`) and CSV export from the UI.

## 15. Extension points
- Template-parser cross-check (§6.7).
- Email/WhatsApp ingestion of invoices (see owner's separate WhatsApp-capture idea).
- Bank statement reconciliation.

## 16. Purchase Module Architecture (Phase 1–5 Built)

### 16.1 Domain & Data Models
- **`Supplier` & `SupplierAlias`**: Master vendor entities with unique clean GSTIN, normalized trade names, and alias mapping table for compound learning.
- **`PurchaseInvoice`**: Header containing `(supplier_id, invoice_number_norm)` compound unique key, supplier and buyer GSTIN snapshots, dates, invoice totals, round-off, and warning payloads.
- **`PurchaseInvoiceItem`**: Line items tracking both printed units (`qty_printed`, `unit_printed`, `rate`) and standardized inventory values (`qty_kg`, `rate_per_kg`), tax percentages, and line totals.
- **`StockMovement` Integration**: Linked 1:1 via `purchase_invoice_item_id` with type `PURCHASE` and source `PURCHASE_INVOICE`. Mutually exclusive with `invoice_item_id` via PostgreSQL CHECK constraint `check_stock_movement_item_link`.
- **`PurchaseInvoiceRevision`**: Immutable version snapshots on replace operations preserving full audit history.

### 16.2 Unit Normalization Pipeline
- Implemented in `src/lib/units/convert.ts`.
- Standardizes diverse supplier packaging (Metric Tons, Grams, Liters, Drums, Bags, Carboys) into kilograms (`kg`).
- Uses master product `pack_size_kg` for container units; flags ambiguous packaging with `UNIT_CONVERSION_AMBIGUOUS` for interactive operator review.

### 16.3 Purchase Extraction & Validation
- **Extract Route**: `/api/purchases/extract` uses the multi-provider vision pipeline with specialized purchase system prompts.
- **Validation**: Enforces GST calculation checks, buyer GSTIN company validation, supplier GSTIN checksum verification, line rate arithmetic, and non-empty item constraints.
- **Duplicate Check Route**: `/api/purchases/exists?supplierId=...&invoiceNumber=...` validates isolation per vendor.

### 16.4 Procurement Analytics & Upgraded Margins
- **Analytics Engine**: `src/lib/analytics/purchases.ts` provides procurement KPIs, Purchases vs. Sales trends, Pareto vendor concentration (with top-3 share), product price trend lines, multi-sourcing price comparisons across suppliers, input GST summaries (by month and HSN), and supplier quality/lapsed alerts.
- **Weighted-Average Margin Calculation**: Upgrades `src/lib/analytics/index.ts` so product gross margins reflect actual purchase costs ($\bar{C} = \frac{\sum \text{Purchase Taxable}}{\sum \text{Purchase Volume}}$) when purchase bills exist in the period, falling back gracefully to standard rates with an *Estimated* indicator.
- **Enhanced Stock Summary**: Integrates last purchase rate & date per chemical, reorder suggestion formula $\max(0, \text{reorder\_level} \times 2 - \text{closing})$ rounded to pack size, purchases split breakdown tooltip (invoices vs. legacy), and full CSV export.

