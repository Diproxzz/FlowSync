# Indobest Insights 📊

> **Single-Owner GST Invoice Transcription, Inventory Intelligence & Analytics Platform**  
> Custom-built for Indobest Kolkata · Marg ERP Sales Invoice Processing & Chemical Stock Ledger

---

## 🚀 Key Highlights & Capabilities

1. **Vision LLM Invoice Extraction:** Scans & transcribes Marg ERP sales tax invoices using **Vision LLMs** (Gemini 2.5 Flash / 1.5 Flash primary; OpenRouter & Groq fallback; local Ollama optional).
2. **Zero Unreviewed Writes:** Human-in-the-loop verification with side-by-side zoomable document preview, live arithmetic validation, and auto-computed line breakdowns.
3. **Compound Intelligence & Alias Learning:** Learns product and buyer aliases from user confirmations. Product codes automatically resolve via exact alias, leading-code prefix (`AA ACTOIL` $\rightarrow$ `AA`), or fuzzy Levenshtein matching.
4. **Duplicate Prevention & Versioning:** Real-time normalized invoice number matching (`IB26-27/0473` $\equiv$ `ib26-27/0473`). Support for side-by-side diffing and safe replacement with version snapshotting (`invoice_revisions`).
5. **Exact Double-Entry Stock Ledger:** Inventory is tracked as an append-only transaction ledger (`stock_movements`). Live stock is calculated via PostgreSQL view `v_stock_summary`, reconciling 100% with the Marg ERP workbook closing stock (72,743 kg).
6. **Executive Analytics Dashboard:**
   - Real-time KPIs with prior-period deltas: Taxable Revenue, Volume (kg), Average Realization (₹/kg), Active Buyers.
   - Monthly trend graphs with dual-axis volume bars and revenue lines (Recharts).
   - ABC Pareto product classification (80/15/5 rule).
   - GSTR-1 territorial breakdown (Intrastate WB 19 vs Interstate).
   - Fast moving vs Idle / Dead stock alerts.

---

## 🛠️ Technology Stack

- **Framework:** Next.js 14.2.24 (App Router, React 18, TypeScript strict)
- **Styling & UI:** Tailwind CSS, Radix UI primitives, Lucide Icons, Okabe-Ito accessible color palette
- **Charts:** Recharts
- **Database & ORM:** PostgreSQL 16 + Prisma ORM 5.22
- **Precision Math:** `decimal.js` (strict Decimal(14,2) for ₹, Decimal(12,3) for kg)
- **Document Processing:** Python 3 + `PyMuPDF` (Fitz) for high-speed sub-100ms 150 DPI page rasterization
- **Testing:** Vitest (unit & integration tests against live DB), Playwright (E2E)

---

## 📋 Prerequisites

- **Node.js:** v20.x or higher
- **PostgreSQL:** v16.x running locally on port `5432` (or remote PostgreSQL URI)
- **Python:** v3.10+ with `pymupdf` installed (`pip install pymupdf`)
- **API Keys (Free Tier):**
  - Google Gemini API key ([Google AI Studio](https://aistudio.google.com/))
  - Optional OpenRouter or Groq keys for fallback

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the project root based on `.env.example`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/indobest?schema=public"

# Authentication
APP_PASSWORD_HASH="$2a$10$w1o6E/2.X4Y5Z6..." # bcrypt hash of your master password
SESSION_SECRET="your-at-least-32-characters-random-session-secret-key"

# Business & GST Configuration
COMPANY_NAME="INDOBEST"
COMPANY_GSTIN="19AVZPC2361G1ZA"

# Vision LLM Providers (Free Tier)
GEMINI_API_KEY="AIzaSy..."
OPENROUTER_API_KEY=""
GROQ_API_KEY=""
OLLAMA_BASE_URL="http://localhost:11434"

# Storage
STORAGE_DIR="./data/uploads"
```

> **Tip:** You can generate a bcrypt password hash using the included helper:
> ```powershell
> npx tsx scripts/hash-password.ts "your-secure-password"
> ```

---

## 🏁 Local Installation & Development

### 1. Install Node Dependencies
```bash
npm install
```

### 2. Setup PostgreSQL Database & Run Migrations
Ensure PostgreSQL service is running, then apply migrations:
```bash
npx prisma migrate deploy
```

### 3. Seed Master Products & Legacy Workbook Transactions
Populate all 55 chemical products and 602 historical transactions from the Marg ERP Excel master:
```bash
npm run seed:legacy
```

### 4. Run Test Suite
Verify that all 41 unit and integration tests pass cleanly:
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000) and log in with your master password.

---

## 📦 Production Build

```bash
npm run build
npm start
```

---

## 💾 Backup & Restore Procedures

### Automated Backup
- **Windows (PowerShell):**
  ```powershell
  .\scripts\backup.ps1
  ```
- **Linux / macOS / Docker:**
  ```bash
  chmod +x ./scripts/backup.sh
  ./scripts/backup.sh
  ```
Backups are saved to `./backups/indobest_backup_YYYYMMDD_HHMMSS.dump`.

### Restore
To restore a backup into a fresh database:
```bash
pg_restore -h localhost -p 5432 -U postgres -d indobest -c -v "./backups/<backup-file>.dump"
```

---

## 🌐 Free Deployment Guide

1. **Database:** Deploy on [Neon](https://neon.tech/) or [Supabase](https://supabase.com/) free tier (0.5 GB storage, PostgreSQL 16).
2. **Web Application:** Deploy on [Vercel](https://vercel.com/) (Hobby plan, free).
   - Set environment variables (`DATABASE_URL`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, `GEMINI_API_KEY`, etc.).
   - Enable PDF fallback parser in Node.js runtime if serverless environment does not have Python installed.
3. **Storage:** In serverless deployments, set up Supabase Storage or Cloudflare R2 bucket for original invoice PDF archiving.

---

## 🔒 Security & Privacy

- Single-user authentication guarded by bcrypt password hashing and HMAC-SHA256 encrypted cookies.
- Brute-force protection: IP-based sliding window rate limiter locks out after 5 consecutive failed attempts.
- API keys and database credentials strictly reside on the server; zero exposure to the client browser.
- Strict decimal arithmetic eliminates floating-point financial vulnerabilities.

---

## 📄 License
Proprietary · Created for Indobest Kolkata. All rights reserved.
