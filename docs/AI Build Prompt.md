# AI Build Prompt — Indobest Insights

Paste everything under **"PROMPT"** into your coding AI (Claude Code, Cursor, etc.) from the project root. The three spec documents must be in `docs/` first.

## Folder structure to create

```
indobest-insights/
├─ docs/
│  ├─ Product Requirement Document.md
│  ├─ Design System.md
│  ├─ Architecture.md
│  └─ AI Build Prompt.md
├─ data/
│  ├─ seed/Leather_Chemicals_Stock_System_2026-27.xlsx      # Product_Master, Transactions
│  └─ samples/
│     ├─ 473_RAHMAN_INDUSTRIES.pdf
│     ├─ 474_SUPER_TANNERS.pdf
│     └─ 475_TIGER_INTERNATIONAL.pdf
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ scripts/
│  ├─ seed-from-xlsx.ts          # --with-legacy-transactions flag
│  ├─ hash-password.ts
│  ├─ test-live-llm.ts           # real providers vs ground truth
│  └─ backup.sh
├─ src/
│  ├─ middleware.ts              # session guard
│  ├─ app/
│  │  ├─ globals.css             # design tokens
│  │  ├─ layout.tsx
│  │  ├─ login/page.tsx
│  │  ├─ (app)/
│  │  │  ├─ layout.tsx           # sidebar + top bar
│  │  │  ├─ dashboard/page.tsx
│  │  │  ├─ upload/page.tsx
│  │  │  ├─ invoices/page.tsx
│  │  │  ├─ invoices/[id]/page.tsx
│  │  │  ├─ products/page.tsx
│  │  │  ├─ products/[id]/page.tsx
│  │  │  ├─ products/import/page.tsx
│  │  │  ├─ customers/page.tsx
│  │  │  ├─ customers/[id]/page.tsx
│  │  │  ├─ stock/page.tsx
│  │  │  └─ settings/page.tsx
│  │  └─ api/
│  │     ├─ auth/{login,logout}/route.ts
│  │     ├─ invoices/route.ts                 # GET list, POST confirm
│  │     ├─ invoices/extract/route.ts         # POST multipart → draft
│  │     ├─ invoices/exists/route.ts
│  │     ├─ invoices/[id]/route.ts
│  │     ├─ invoices/[id]/file/route.ts
│  │     ├─ products/route.ts
│  │     ├─ products/[id]/route.ts
│  │     ├─ products/import/route.ts
│  │     ├─ customers/route.ts
│  │     ├─ customers/[id]/route.ts
│  │     ├─ customers/merge/route.ts
│  │     ├─ stock/movements/route.ts
│  │     ├─ stock/summary/route.ts
│  │     ├─ analytics/[widget]/route.ts
│  │     ├─ export/[entity]/route.ts
│  │     └─ settings/{route.ts,llm/test/route.ts}
│  ├─ components/
│  │  ├─ ui/                     # shadcn/ui primitives
│  │  ├─ layout/                 # Sidebar, Topbar, ThemeToggle
│  │  ├─ upload/                 # Dropzone, QueueList, PreviewForm, ItemsTable,
│  │  │                          # TotalsCard, DocumentViewer, DuplicateDialog,
│  │  │                          # DiffView, MatchBadge, IssuePopover
│  │  ├─ dashboard/              # FilterBar, StatTile, ChartCard
│  │  ├─ charts/                 # TrendChart, TopBar, Pareto, RateVariance,
│  │  │                          # Heatmap, CohortChart
│  │  └─ tables/                 # DataTable, StockTable, InvoicesTable
│  ├─ lib/
│  │  ├─ env.ts                  # Zod-parsed env, fail fast
│  │  ├─ db.ts                   # Prisma client
│  │  ├─ auth/                   # session.ts, password.ts, rateLimit.ts
│  │  ├─ llm/
│  │  │  ├─ types.ts
│  │  │  ├─ schema.ts            # ExtractedInvoice (Zod) + JSON schema
│  │  │  ├─ extract.ts           # provider chain, repair retry, logging
│  │  │  ├─ prompts/invoice.ts
│  │  │  └─ providers/{gemini,openrouter,groq,ollama}.ts
│  │  ├─ pdf/                    # detectText.ts, rasterize.ts
│  │  ├─ validation/             # invoice.ts, gstin.ts, money.ts (shared client+server)
│  │  ├─ matching/               # normalize.ts, customer.ts, product.ts
│  │  ├─ invoices/               # confirm.ts (transaction), diff.ts, repository.ts
│  │  ├─ stock/                  # movements.ts, summary.ts
│  │  ├─ analytics/              # kpis.ts, trend.ts, top.ts, abc.ts, rate.ts,
│  │  │                          # movement.ts, cohorts.ts, matrix.ts, gst.ts, quality.ts
│  │  ├─ storage/                # adapter.ts, local.ts, supabase.ts
│  │  └─ format.ts               # INR grouping, kg, dates
│  └─ types/
├─ tests/
│  ├─ fixtures/{inv-473.json,inv-474.json,inv-475.json}
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ docker-compose.yml            # postgres 16
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ tailwind.config.ts
├─ vitest.config.ts
├─ playwright.config.ts
└─ README.md
```
