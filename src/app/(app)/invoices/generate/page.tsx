import React from "react";
import { InvoiceGeneratorView } from "@/components/invoices/InvoiceGeneratorView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice Generation | Indobest Insights",
  description: "Create and print pixel-faithful INDOBEST GST invoices",
};

export default function InvoiceGeneratePage() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto print:p-0 print:m-0 print:max-w-none">
      <InvoiceGeneratorView />
    </div>
  );
}
