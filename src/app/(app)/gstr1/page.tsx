import { Gstr1Section } from "@/components/gstr1/Gstr1Section";

export default function Gstr1Page() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h2 className="text-xl font-bold text-ink tracking-tight">GSTR-1 Filing &amp; Tax Summary</h2>
        <p className="text-xs text-ink-3 mt-1">
          View CGST, SGST, and IGST outward supply details by month, quarter, financial year, or custom date range.
        </p>
      </div>
      <Gstr1Section />
    </div>
  );
}
