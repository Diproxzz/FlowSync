export interface MonthColumnDef {
  key: string; // "YYYY-MM"
  label: string; // e.g. "Nov 2025*" or "Nov 2025"
  isRollupStart: boolean;
  year: number;
  month: number;
}

export interface DebtorPeriodInfo {
  mode: "rolling" | "fy";
  asOfMonth: string; // "YYYY-MM"
  financialYear: string; // "YYYY-YY" e.g. "2026-27"
  periodTitle: string;
  startKey: string;
  endKey: string;
  monthColumns: MonthColumnDef[];
  availableRollingMonths: Array<{ value: string; label: string }>;
  availableFinancialYears: Array<{ value: string; label: string }>;
}

/**
 * Builds the exact 12 month columns for a Debtor List schedule.
 * - Rolling 12-Month format: 12 consecutive months ending in asOfMonth (e.g. Nov 2025 - Oct 2026).
 * - Financial Year format: April of FY start year to March of FY end year (e.g. Apr 2026 - Mar 2027).
 */
export function build12MonthSchedule(
  mode: "rolling" | "fy" = "rolling",
  asOfMonthParam?: string | null,
  fyParam?: string | null
): DebtorPeriodInfo {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const defaultAsOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  // Current financial year: if month >= 4, currentYear-(currentYear+1), else (currentYear-1)-currentYear
  const defaultFYStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  const defaultFY = `${defaultFYStart}-${String(defaultFYStart + 1).slice(-2)}`;

  const effectiveMode = mode === "fy" ? "fy" : "rolling";
  let effectiveAsOfMonth = (asOfMonthParam && /^\d{4}-\d{2}$/.test(asOfMonthParam.trim()))
    ? asOfMonthParam.trim()
    : defaultAsOfMonth;

  let effectiveFY = (fyParam && /^\d{4}-\d{2}$/.test(fyParam.trim()))
    ? fyParam.trim()
    : defaultFY;

  // Available Financial Years (last 3 FYs + current + next)
  const availableFinancialYears = [
    { value: "2024-25", label: "FY 2024-25 (Apr 2024 – Mar 2025)" },
    { value: "2025-26", label: "FY 2025-26 (Apr 2025 – Mar 2026)" },
    { value: "2026-27", label: "FY 2026-27 (Apr 2026 – Mar 2027) [Active]" },
    { value: "2027-28", label: "FY 2027-28 (Apr 2027 – Mar 2028)" },
  ];

  // Available Rolling Months (past 12 months up to current + next month for preview)
  const availableRollingMonths: Array<{ value: string; label: string }> = [];
  const baseEndYear = currentYear;
  const baseEndMonth = currentMonth;

  // From baseEndMonth + 1 down to baseEndMonth - 10
  for (let offset = 2; offset >= -10; offset--) {
    let m = baseEndMonth + offset;
    let y = baseEndYear;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const val = `${y}-${String(m).padStart(2, "0")}`;
    const dEnd = new Date(y, m - 1, 1);
    const endName = dEnd.toLocaleString("en-IN", { month: "short", year: "numeric" });

    // Compute start month for display
    let sm = m - 11;
    let sy = y;
    while (sm <= 0) {
      sm += 12;
      sy -= 1;
    }
    const dStart = new Date(sy, sm - 1, 1);
    const startName = dStart.toLocaleString("en-IN", { month: "short", year: "numeric" });

    const isCurrent = val === defaultAsOfMonth;
    availableRollingMonths.push({
      value: val,
      label: `${endName} (${startName} – ${endName})${isCurrent ? " [Current]" : ""}`,
    });
  }

  // Reverse so newest is first or keep chronological
  // Let's sort so current month is easily accessible
  availableRollingMonths.sort((a, b) => b.value.localeCompare(a.value));

  let monthColumns: MonthColumnDef[] = [];
  let periodTitle = "";

  if (effectiveMode === "fy") {
    const startYear = parseInt(effectiveFY.split("-")[0], 10) || defaultFYStart;
    const endYear = startYear + 1;

    // 12 months: April of startYear to March of endYear
    for (let m = 4; m <= 12; m++) {
      const key = `${startYear}-${String(m).padStart(2, "0")}`;
      const d = new Date(startYear, m - 1, 1);
      const mName = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      monthColumns.push({
        key,
        label: m === 4 ? `${mName}*` : mName,
        isRollupStart: m === 4,
        year: startYear,
        month: m,
      });
    }

    for (let m = 1; m <= 3; m++) {
      const key = `${endYear}-${String(m).padStart(2, "0")}`;
      const d = new Date(endYear, m - 1, 1);
      const mName = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      monthColumns.push({
        key,
        label: mName,
        isRollupStart: false,
        year: endYear,
        month: m,
      });
    }

    periodTitle = `Current FY ${startYear}-${String(endYear).slice(-2)} (Apr ${startYear} – Mar ${endYear})`;
  } else {
    // Rolling 12-month mode ending in effectiveAsOfMonth
    const [yStr, mStr] = effectiveAsOfMonth.split("-");
    const endYear = parseInt(yStr, 10);
    const endMonth = parseInt(mStr, 10);

    for (let offset = 11; offset >= 0; offset--) {
      let m = endMonth - offset;
      let y = endYear;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const d = new Date(y, m - 1, 1);
      const mName = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      monthColumns.push({
        key,
        label: offset === 11 ? `${mName}*` : mName,
        isRollupStart: offset === 11,
        year: y,
        month: m,
      });
    }

    const startCol = monthColumns[0];
    const endCol = monthColumns[11];
    const startName = new Date(startCol.year, startCol.month - 1, 1).toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
    });
    const endName = new Date(endCol.year, endCol.month - 1, 1).toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
    });

    periodTitle = `Last 12 Months: ${startName} – ${endName}`;
  }

  return {
    mode: effectiveMode,
    asOfMonth: effectiveAsOfMonth,
    financialYear: effectiveFY,
    periodTitle,
    startKey: monthColumns[0].key,
    endKey: monthColumns[11].key,
    monthColumns,
    availableRollingMonths,
    availableFinancialYears,
  };
}

/**
 * Rolls raw monthly dues into the exact 12 columns of the schedule.
 * Any due date strictly <= startKey (or prior ledger balance) rolls into startKey (column 1).
 * Any due date strictly >= endKey rolls into endKey (column 12).
 * Any date between startKey and endKey goes to its corresponding month column.
 * Total sum of the 12 columns matches raw monthly total with 100% precision.
 */
export function rollInto12Months(
  rawMonthly: Record<string, number>,
  monthColumns: MonthColumnDef[]
): Record<string, number> {
  if (!monthColumns || monthColumns.length === 0) return {};

  const startKey = monthColumns[0].key;
  const endKey = monthColumns[monthColumns.length - 1].key;

  const result: Record<string, number> = {};
  for (const col of monthColumns) {
    result[col.key] = 0;
  }

  for (const [k, val] of Object.entries(rawMonthly)) {
    const amount = Number(val) || 0;
    if (Math.abs(amount) < 0.005) continue;

    if (k === "prior" || k <= startKey) {
      // Prior dues or dues falling in/before the first month roll into the first month
      result[startKey] = Math.round(((result[startKey] || 0) + amount) * 100) / 100;
    } else if (k >= endKey) {
      // Future or post-period dues roll into the last month
      result[endKey] = Math.round(((result[endKey] || 0) + amount) * 100) / 100;
    } else {
      // Matches one of the middle columns
      result[k] = Math.round(((result[k] || 0) + amount) * 100) / 100;
    }
  }

  return result;
}
