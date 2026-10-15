# Design System — Indobest Insights

Version 1.0 · 2026-10-15. Implementation: Tailwind CSS + shadcn/ui (Radix). Tokens are CSS variables in `src/app/globals.css`, mapped in `tailwind.config.ts`. Do not hard-code hex values in components.

## 1. Design intent

A calm, dense, trustworthy **working tool** for a trader who reads numbers all day. Warm paper-like neutrals (a nod to leather/tannery), a deep teal as the one action colour, and tabular monospaced figures so columns of rupees align. No gradients, no decorative illustration, no glass effects. The hardest screen is the **invoice preview**; the system optimises for it: side-by-side verification, obvious error states, big hit targets for Save.

Tone of voice: plain, specific, no exclamation marks. "3 fields need checking" not "Oops!".

## 2. Colour tokens

Light is default; dark follows `prefers-color-scheme` and a manual toggle (`data-theme`).

### 2.1 Neutrals and brand
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAF8F5` | `#14110F` | App background |
| `--surface` | `#FFFFFF` | `#1D1916` | Cards, tables, inputs |
| `--surface-2` | `#F2EEE8` | `#26211D` | Table headers, subtle fills, hover |
| `--border` | `#E2DCD3` | `#3A332D` | Hairlines |
| `--border-strong` | `#C9C0B3` | `#524A42` | Inputs, focus-adjacent |
| `--ink` | `#1C1917` | `#F3EFE9` | Primary text (≥ 12:1 on `--bg`) |
| `--ink-2` | `#57504A` | `#BDB4A9` | Secondary text (≥ 7:1) |
| `--ink-3` | `#7A7168` | `#948A7F` | Hints, placeholders (≥ 4.5:1) |
| `--primary` | `#0F4C4A` | `#4FB3AE` | Primary buttons, links, active nav |
| `--primary-fg` | `#FFFFFF` | `#0B1F1E` | Text on primary |
| `--primary-soft` | `#E1EEEC` | `#17302F` | Selected rows, soft badges |
| `--accent` | `#9A5B24` | `#D9A06B` | Leather-tan accent: highlights, "New" badges, key chart series |

### 2.2 Semantic
| Token | Light fg / bg | Dark fg / bg | Meaning |
|---|---|---|---|
| `--success` | `#2F7D4F` / `#E4F2EA` | `#6CC391` / `#16301F` | Valid, matched, saved |
| `--warning` | `#8A5A00` / `#FBF0D5` | `#E8B84F` / `#33270B` | Needs a look; suggested match |
| `--danger` | `#B3261E` / `#FBE5E3` | `#F28B82` / `#3A1512` | Error; blocks Save; destructive |
| `--info` | `#1F5FA8` / `#E3EEF9` | `#7AB2EC` / `#13263B` | New customer/product, rate variance |

Status is **always** paired with an icon and text (✓ Matched, ⚠ Check, ✕ Error, ＋ New), never colour alone.

### 2.3 Chart palette (colour-blind-safe, Okabe–Ito based)
Categorical order: `#0072B2` blue · `#E69F00` orange · `#009E73` green · `#CC79A7` pink · `#56B4E9` sky · `#D55E00` vermilion · `#F0E442` yellow (use only with dark outline) · `#4D4D4D` grey (for "Others").
Single-series charts use `--primary`; comparison series (previous period) use `--ink-3` at 60% opacity. Sequential (heatmap): `--primary-soft` → `--primary`. ABC classes: A `--primary`, B `--accent`, C `--ink-3`. In dark mode lighten each by ~15% keeping ≥ 3:1 against `--surface`. Gridlines `--border`; axis labels `--ink-2`.

## 3. Typography

- **UI:** IBM Plex Sans (400, 500, 600), via `next/font`. Fallback `system-ui, sans-serif`.
- **Numbers / codes:** IBM Plex Mono with `font-variant-numeric: tabular-nums`. Apply the `.num` utility to every currency, quantity, rate, GSTIN, HSN, and invoice number. Right-align numeric columns.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| Display | 28 / 36 | 600 | KPI value |
| H1 | 24 / 32 | 600 | Page title |
| H2 | 18 / 26 | 600 | Section / card title |
| H3 | 15 / 22 | 600 | Sub-section, table group |
| Body | 14 / 22 | 400 | Default |
| Small | 12 / 18 | 400 | Captions, hints, table meta |
| Mono body | 13 / 20 | 400 | Table numbers |

Max line length for prose 70ch. Never go below 12 px.

## 4. Spacing, shape, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64. Page gutter 16 (mobile) / 24 (≥ 768) / 32 (≥ 1280). Card padding 16–24.
- Radius: 6 (inputs, buttons, badges), 10 (cards, modals). No fully rounded buttons.
- Elevation: borders instead of shadows. One shadow token `--shadow-pop: 0 8px 24px rgb(28 25 23 / 0.14)` only for menus, popovers, modals.
- Focus ring: 2 px `--primary` + 2 px offset in `--bg`; always visible on keyboard focus.
- Motion: 120–180 ms ease-out for hover/expand; none for table updates; respect `prefers-reduced-motion`.
- Breakpoints: 360, 768, 1024, 1280, 1536.

## 5. Layout

- **App shell:** left sidebar (240 px, collapses to icons at < 1024 and to a bottom sheet at < 768) with: Dashboard, Upload, Invoices, Products, Customers, Stock, Settings. Top bar: page title, global date-range, theme toggle, user menu.
- **Content width:** dashboard max 1440; forms/tables fluid; settings max 720.
- **Preview screen:** two panes with a draggable divider, default 45% document / 55% form. Below 1024 px the document is a collapsible panel above the form. The footer action bar is sticky.

## 6. Components

Base on shadcn/ui: Button, Input, Select, Combobox, Checkbox, Switch, Tabs, Dialog, AlertDialog, Sheet, Popover, Tooltip, Toast (sonner), Table, Badge, Skeleton, DropdownMenu, Calendar/DatePicker.

### 6.1 Buttons
Primary (teal fill), Secondary (outline), Ghost, Destructive (danger fill, only inside confirm dialogs). Height 36 (default), 40 (primary page action), 32 (dense tables). Loading state shows spinner and keeps width. Max one primary per view region.

### 6.2 Inputs
Label above, 12 px `--ink-2`; helper text below; error text with ✕ icon in `--danger`. Currency inputs: `₹` prefix adornment, right-aligned mono, Indian grouping on blur (`1,25,000.00`), raw decimal on focus. Quantity inputs show unit suffix `kg`.

### 6.3 Badges (6 px radius, 12 px text, icon + label)
`Matched` success · `Suggested` warning · `New` info · `Needs review` warning · `Duplicate` danger · `LOW STOCK` danger · `OK` success · `A`/`B`/`C` class chips · `Estimated` neutral outline (for margin figures).

### 6.4 Tables
Sticky header on `--surface-2`; row height 40 (dense 32); zebra none, hover `--surface-2`; numeric columns right-aligned mono; totals row bold with top border; sortable headers with an arrow icon and `aria-sort`; column-visibility menu; empty state with one-line explanation and a primary action; footers with pagination and row count. Selection uses `--primary-soft`.

### 6.5 Stat tile (KPI)
Label (small, `--ink-2`), value (Display, mono), delta chip vs previous period (▲/▼ with sign and %, colour is secondary to the arrow and sign), optional 12-point sparkline in `--primary`. Whole tile is a link to the underlying list.

### 6.6 Chart card
Title (H3), optional subtitle (period and unit, e.g. "Taxable value, ₹"), toolbar: *View data* (table toggle), *Download CSV*. Charts have: direct labels where ≤ 8 items, otherwise legend at bottom; tooltips showing exact ₹ with Indian grouping; thousands abbreviated on axes (`₹1.2 L`, `₹3.4 Cr`); y-axis starts at 0 for bars; bars sorted descending except time series. Provide `aria-label` summaries and a data table fallback.

### 6.7 Upload dropzone
Dashed 2 px `--border-strong`, 160 px tall, icon + "Drop invoice PDFs here or browse"; helper "PDF, PNG or JPG · up to 10 MB each". States: drag-over (`--primary-soft` fill, `--primary` border), uploading (progress), error (danger text with file name). Below: queue list with per-file status chip (Queued / Reading / Ready to review / Saved / Failed) and progress "2 of 5".

### 6.8 Invoice preview form (the signature component)
- **Header card:** Customer (combobox + match badge), GSTIN (mono + validity icon), Invoice no. (+ duplicate check indicator), Date.
- **Items table** (editable, dense): `# · Product (combobox + match badge) · HSN · Qty (kg) · Rate · Taxable · CGST % · SGST % · Amount · row status icon · ⋯`. Row status icon opens a popover listing that row's issues. Add-line and "Split line" actions below.
- **Totals card:** Sub total, CGST, SGST, Round-off, **Grand total** (Display size); each with a ✓/⚠ chip: "✓ matches lines" or "⚠ lines sum to ₹3,75,239.60".
- **Field state:** default; *model-uncertain* (dotted warning underline + "Low confidence" tooltip); *invalid* (danger border + message); *edited by user* (small dot in corner, so reviewers see what they changed).
- **Footer bar (sticky):** left — issue summary ("2 errors · 1 warning", clicking jumps to first); right — `Discard`, `Re-extract with another model`, primary `Save invoice` (disabled with tooltip reason when errors exist; when only warnings, a checkbox "I've checked these warnings" precedes it).
- **Keyboard:** Tab through cells row-wise; Enter commits cell and moves down; `Ctrl/Cmd+S` saves when allowed; `Esc` closes popovers.

### 6.9 Duplicate-invoice dialog
AlertDialog, danger-tinted icon. Title: "Invoice IB26-27/0473 already exists". Body: saved date, customer, grand total, number of lines. Actions: **Modify existing** (primary), **Discard this upload** (secondary), **View existing** (ghost link). Focus starts on *Discard* to avoid accidental overwrite.

### 6.10 Diff view (edit mode)
Two columns "Saved" and "New from upload", changed cells highlighted `--warning` background with ▲ icon, added lines `--success`, removed lines `--danger` strikethrough. Header summary: "4 fields differ". A per-field "Keep saved value" toggle.

### 6.11 Feedback
Toasts for success (4 s) and non-blocking info; inline banners for page-level warnings (e.g. stock history gap); skeletons (not spinners) for dashboard cards; dialogs only for decisions.

### 6.12 Empty, loading, error states
- Empty dashboard: "No invoices yet — upload your first invoice" with the dropzone inline.
- Extraction failure card: provider-by-provider reasons, buttons *Retry*, *Try another model*, *Enter manually*.
- 404/500: plain message and a link home.

## 7. Dashboard layout (≥ 1280 px, 12-column grid, 16–24 gap)

1. Filter bar: period presets, custom range, customer, product, "Reset".
2. KPI row: 6 tiles (2 columns each at 1280; wraps 3×2 at tablet; 2×3 on phone).
3. Row: **Sales trend** (8 cols) · **GST by month** (4 cols).
4. Row: **Top products** (6) · **Top customers** (6).
5. Row: **ABC / Pareto** (6) · **Rate realization vs standard** (6, diverging bars).
6. Row: **Customer × product matrix** (8, heatmap) · **New vs repeat / lapsed** (4).
7. Row: **Stock status table** (full width; LOW STOCK first; days of stock, turnover).
8. Row: **HSN summary** (6) · **Data quality** (6).

On phone: single column in the order above, charts 240 px tall, tables become horizontally scrollable with a sticky first column.

## 8. Content and formatting rules

- Currency: `₹` + Indian grouping + 2 decimals in tables/forms (`₹3,75,240.00`); abbreviated (`₹3.75 L`, `₹1.2 Cr`) only in KPIs/axes with full value in tooltip.
- Quantity: kg, up to 3 decimals, trailing zeros trimmed; drums shown as `3 × 220 kg` where pack size is known.
- Dates: `12 Oct 2026` in UI, ISO in data/exports; financial year as `FY 2026-27`.
- Percentages: one decimal (`9.0%`), variance with sign (`−0.9%`).
- Negative numbers use a true minus `−`, not parentheses.
- Customer names are displayed as stored (title-cased on creation if ALL CAPS).

## 9. Accessibility checklist

- Contrast: text ≥ 4.5:1, large text/UI ≥ 3:1 in both themes (tokens above comply; verify when changing).
- Every control reachable and operable by keyboard; visible focus; logical tab order in the preview form.
- Labels programmatically associated; errors announced with `aria-live="polite"`; dialogs trap focus and return it.
- Charts: text summary, data-table alternative, patterns or direct labels not relying on colour only.
- Touch targets ≥ 40 px on mobile.
- Respect reduced motion; support 200% zoom without horizontal scroll (except data tables).

## 10. Iconography
lucide-react, 16 px in dense UI / 20 px elsewhere, 1.5 px stroke. Key icons: `LayoutDashboard`, `FileUp`, `Receipt`, `Package`, `Users`, `Boxes`, `Settings`, `CheckCircle2`, `AlertTriangle`, `XCircle`, `PlusCircle`, `Copy`, `GitCompare`.

## 11. Token file starter (`globals.css`)

```css
:root {
  --bg:#FAF8F5; --surface:#FFFFFF; --surface-2:#F2EEE8;
  --border:#E2DCD3; --border-strong:#C9C0B3;
  --ink:#1C1917; --ink-2:#57504A; --ink-3:#7A7168;
  --primary:#0F4C4A; --primary-fg:#FFFFFF; --primary-soft:#E1EEEC;
  --accent:#9A5B24;
  --success:#2F7D4F; --success-bg:#E4F2EA;
  --warning:#8A5A00; --warning-bg:#FBF0D5;
  --danger:#B3261E;  --danger-bg:#FBE5E3;
  --info:#1F5FA8;    --info-bg:#E3EEF9;
  --radius-sm:6px; --radius-lg:10px;
  --shadow-pop:0 8px 24px rgb(28 25 23 / .14);
}
:root[data-theme="dark"], @media (prefers-color-scheme: dark) { /* dark values from §2 */ }
.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
```
(In the real file, declare dark tokens once in a `:root[data-theme="dark"]` block and repeat them in a `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` block.)
