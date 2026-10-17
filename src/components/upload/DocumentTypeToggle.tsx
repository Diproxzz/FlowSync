"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Receipt, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentTypeToggleProps {
  currentType: "SALES" | "PURCHASE";
  onChange?: (type: "SALES" | "PURCHASE") => void;
  className?: string;
}

export function DocumentTypeToggle({
  currentType,
  onChange,
  className,
}: DocumentTypeToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = (type: "SALES" | "PURCHASE") => {
    if (onChange) {
      onChange(type);
    } else {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (type === "PURCHASE") {
        params.set("type", "purchase");
      } else {
        params.delete("type");
      }
      const qs = params.toString();
      router.push(`/upload${qs ? `?${qs}` : ""}`);
    }
  };

  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5 bg-surface-2 border border-border rounded-sm text-xs font-medium",
        className
      )}
      role="tablist"
      aria-label="Document Type"
    >
      <button
        type="button"
        role="tab"
        aria-selected={currentType === "SALES"}
        onClick={() => handleSelect("SALES")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-xs transition text-xs font-medium",
          currentType === "SALES"
            ? "bg-primary text-primary-fg font-semibold shadow-xs"
            : "text-ink-2 hover:text-ink hover:bg-surface/50"
        )}
      >
        <Receipt className="w-3.5 h-3.5" />
        <span>Sales Invoice</span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={currentType === "PURCHASE"}
        onClick={() => handleSelect("PURCHASE")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-xs transition text-xs font-medium",
          currentType === "PURCHASE"
            ? "bg-accent text-accent-fg font-semibold shadow-xs"
            : "text-ink-2 hover:text-ink hover:bg-surface/50"
        )}
      >
        <ShoppingCart className="w-3.5 h-3.5" />
        <span>Purchase Invoice</span>
      </button>
    </div>
  );
}
