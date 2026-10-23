import React from "react";
import { InvoiceCalculationResult } from "@/lib/invoices/calculations";

export interface CustomerInvoiceMeta {
  name: string;
  address: string;
  phone?: string;
  gstin?: string;
  stateCode?: string;
}

export interface InvoiceHeaderMeta {
  invoiceNumber: string;
  invoiceDate: string; // DD-MM-YYYY
  orderNo?: string;
  deliveryNote?: string;
  destination?: string;
  ewayBillNo?: string;
  copyType?: "ORIGINAL" | "DUPLICATE" | "TRIPLICATE" | string;
  hasWatermark?: boolean;
}

interface PrintableInvoiceProps {
  customer: CustomerInvoiceMeta;
  meta: InvoiceHeaderMeta;
  calculation: InvoiceCalculationResult;
  id?: string;
}

export const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({
  customer,
  meta,
  calculation,
  id = "printable-invoice",
}) => {
  const addressLines = (customer.address || "").split("\n").filter(Boolean);

  // If discount of all products is set to 0, then the Discount column does not appear
  const hasDiscount = calculation.hasDiscount;

  // 12 columns if hasDiscount, 11 columns if no discount
  const colWidths = hasDiscount
    ? [
        "4.0%",  // Sl
        "8.5%",  // Qnty
        "5.5%",  // Pack
        "25.5%", // Product
        "6.5%",  // Batch
        "8.5%",  // HSN
        "7.0%",  // Rate
        "6.0%",  // Disc %
        "9.5%",  // TAXABLE
        "4.5%",  // SGST
        "4.5%",  // CGST
        "10.0%", // Amount
      ]
    : [
        "4.5%",  // Sl
        "9.5%",  // Qnty
        "6.0%",  // Pack
        "28.5%", // Product
        "7.5%",  // Batch
        "8.5%",  // HSN
        "7.5%",  // Rate
        "9.5%",  // TAXABLE
        "4.5%",  // SGST
        "4.5%",  // CGST
        "9.5%",  // Amount
      ];

  return (
    <div
      id={id}
      className="invoice-a4-page mx-auto bg-white text-black font-sans leading-tight select-none relative"
      style={{
        width: "210mm",
        height: "296mm",
        maxHeight: "296mm",
        padding: "7mm 11mm 5mm 11mm",
        boxSizing: "border-box",
        color: "#000000",
        backgroundColor: "#ffffff",
        overflow: "hidden",
        pageBreakAfter: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      {/* Top Copy Label */}
      <div className="w-full text-right pr-1 pb-1">
        <span className="text-[11px] italic underline tracking-wide font-normal">
          {meta.copyType || "ORIGINAL"} / DUPLICATE / TRIPLICATE COPY
        </span>
      </div>

      {/* Main Outer Box with thicker border (2.5px solid black) */}
      <div
        className="w-full border-[2.5px] border-black flex flex-col relative"
        style={{ height: "calc(100% - 22px)", boxSizing: "border-box" }}
      >
        {/* Header Section */}
        <div className="w-full pt-1.5 pb-1 text-center border-b border-black">
          <h1
            className="text-[30px] font-black tracking-wider leading-none m-0 p-0"
            style={{ fontFamily: "Arial, sans-serif" }}
          >
            INDOBEST
          </h1>
          <div className="text-[10.5px] font-normal leading-[1.3] mt-1">
            19/10/2,GOBINDA KHATICK ROAD
          </div>
          <div className="text-[10.5px] font-normal leading-[1.3]">
            KOLKATA-700046 19-WEST BENGAL
          </div>
          <div className="text-[10.5px] font-normal leading-[1.3] mt-0.5">
            Phone : 8240892993
          </div>
          <div className="text-[10.5px] font-normal leading-[1.3]">
            E-Mail : indobest@gmail.com
          </div>
          <div
            className="text-[14.5px] font-black tracking-wide leading-tight mt-1"
            style={{ fontFamily: "Arial, sans-serif" }}
          >
            GST INVOICE
          </div>
        </div>

        {/* GSTIN Banner */}
        <div className="w-full py-0.5 text-center text-[10.5px] font-normal border-b border-black">
          GSTIN : 19AVZPC2361G1ZA
        </div>

        {/* Customer & Invoice Meta Row */}
        <div className="w-full flex text-[11px] leading-[1.35] border-b border-black min-h-[84px]">
          {/* Left Block: Customer Details */}
          <div className="w-[58%] p-2 flex flex-col justify-between">
            <div>
              <div className="font-bold text-[13px] text-black">
                {customer.name}
              </div>
              {addressLines.map((line, idx) => (
                <div key={idx} className="text-black">
                  {line}
                </div>
              ))}
              {customer.phone && (
                <div className="text-black">PH.NO.: {customer.phone}</div>
              )}
            </div>
            <div className="mt-1 font-normal text-black">
              GSTIN : {customer.gstin || "URP"}
            </div>
          </div>

          {/* Right Block: Invoice Meta */}
          <div className="w-[42%] p-2 flex flex-col justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center">
                <span className="w-24 text-black">Invoice No. :</span>
                <span className="font-bold text-black">{meta.invoiceNumber}</span>
                <span className="ml-4 mr-1 text-black">Date :</span>
                <span className="font-bold text-black">{meta.invoiceDate}</span>
              </div>
              <div className="flex items-center">
                <span className="w-24 text-black">Order No. :</span>
                <span className="text-black">{meta.orderNo || ""}</span>
              </div>
              <div className="flex items-center">
                <span className="w-24 text-black">DELIVERY NOTE :</span>
                <span className="text-black uppercase">
                  {meta.deliveryNote || ""}
                </span>
              </div>
              <div className="flex items-center">
                <span className="w-24 text-black">DESTINATION :</span>
                <span className="text-black uppercase">
                  {meta.destination || ""}
                </span>
              </div>
            </div>
            <div className="flex items-center mt-1">
              <span className="w-24 text-black">E-WAY BILL NO. :</span>
              <span className="text-black">{meta.ewayBillNo || ""}</span>
            </div>
          </div>
        </div>

        {/* Item Table: Full height continuous straight vertical lines touching lower horizontal line */}
        <div
          className="w-full relative flex flex-col flex-1"
          style={{ minHeight: "360px", maxHeight: "430px" }}
        >
          {/* Continuous vertical grid running full height from top to bottom */}
          <div className="absolute inset-0 flex pointer-events-none z-10">
            {colWidths.map((w, idx) => (
              <div
                key={idx}
                style={{ width: w }}
                className={idx < colWidths.length - 1 ? "border-r border-black h-full" : "h-full"}
              />
            ))}
          </div>

          {/* Watermark in background */}
          {(meta.hasWatermark ?? true) && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0"
              style={{ overflow: "hidden" }}
            >
              <div
                className="font-black tracking-[0.18em] text-[62px] uppercase select-none"
                style={{
                  color: "rgba(220, 220, 220, 0.55)",
                  transform: "rotate(-38deg)",
                  fontFamily: "Arial, sans-serif",
                }}
              >
                INDOBEST
              </div>
            </div>
          )}

          {/* Table Header Row */}
          <div
            className="w-full flex border-b border-black text-[10.5px] font-bold text-black leading-tight text-center relative z-20 bg-white"
            style={{ height: "22px" }}
          >
            <div style={{ width: colWidths[0] }} className="p-0.5 text-center">Sl.</div>
            <div style={{ width: colWidths[1] }} className="p-0.5 text-right pr-1.5">Qnty</div>
            <div style={{ width: colWidths[2] }} className="p-0.5 text-right pr-1">Pack</div>
            <div style={{ width: colWidths[3] }} className="p-0.5 text-left pl-1.5">Product</div>
            <div style={{ width: colWidths[4] }} className="p-0.5 text-center">Batch</div>
            <div style={{ width: colWidths[5] }} className="p-0.5 text-center">HSN</div>
            <div style={{ width: colWidths[6] }} className="p-0.5 text-right pr-1">Rate</div>
            {hasDiscount && (
              <div style={{ width: colWidths[7] }} className="p-0.5 text-right pr-1">Disc %</div>
            )}
            <div style={{ width: hasDiscount ? colWidths[8] : colWidths[7] }} className="p-0.5 text-right pr-1">TAXABLE</div>
            <div style={{ width: hasDiscount ? colWidths[9] : colWidths[8] }} className="p-0.5 text-right pr-0.5 text-[8.5px]">SGST</div>
            <div style={{ width: hasDiscount ? colWidths[10] : colWidths[9] }} className="p-0.5 text-right pr-0.5 text-[8.5px]">CGST</div>
            <div style={{ width: hasDiscount ? colWidths[11] : colWidths[10] }} className="p-0.5 text-right pr-1.5">Amount</div>
          </div>

          {/* Data Rows with comfortably increased font sizes (12px) */}
          <div className="w-full flex-1 relative z-20">
            {calculation.items.map((item, idx) => (
              <div
                key={idx}
                className="w-full flex text-[12px] leading-[1.35] text-black font-normal pt-0.5"
                style={{ height: "22px" }}
              >
                <div style={{ width: colWidths[0] }} className="text-center px-0.5">
                  {item.sl}.
                </div>
                <div style={{ width: colWidths[1] }} className="text-right pr-1.5 font-medium">
                  {item.qty}
                </div>
                <div style={{ width: colWidths[2] }} className="text-right pr-1">
                  {item.pack}
                </div>
                <div style={{ width: colWidths[3] }} className="text-left pl-1.5 truncate uppercase font-medium">
                  {item.product}
                </div>
                <div style={{ width: colWidths[4] }} className="text-center px-0.5">
                  {item.batch || ""}
                </div>
                <div style={{ width: colWidths[5] }} className="text-center font-mono text-[10.5px] px-0.5 tracking-tight">
                  {item.hsn}
                </div>
                <div style={{ width: colWidths[6] }} className="text-right pr-1 font-mono text-[11px]">
                  {item.rate}
                </div>
                {hasDiscount && (
                  <div style={{ width: colWidths[7] }} className="text-right pr-1 font-mono text-[11px]">
                    {item.discountPct && Number(item.discountPct) > 0 ? `${item.discountPct}%` : "0%"}
                  </div>
                )}
                <div style={{ width: hasDiscount ? colWidths[8] : colWidths[7] }} className="text-right pr-1 font-medium font-mono text-[11px]">
                  {item.taxable}
                </div>
                <div style={{ width: hasDiscount ? colWidths[9] : colWidths[8] }} className="text-right pr-0.5 font-mono text-[11px]">
                  {item.sgstPct}
                </div>
                <div style={{ width: hasDiscount ? colWidths[10] : colWidths[9] }} className="text-right pr-0.5 font-mono text-[11px]">
                  {item.cgstPct}
                </div>
                <div style={{ width: hasDiscount ? colWidths[11] : colWidths[10] }} className="text-right pr-1.5 font-medium font-mono text-[11px]">
                  {item.amount}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lower Horizontal Table Border - Continuous vertical lines touch this directly */}
        <div className="w-full border-t border-black" />

        {/* Subtotal & GST Summary Section */}
        <div className="w-full flex min-h-[78px] border-b border-black text-[11px]">
          {/* Left: TOTAL Qty and GST breakdown */}
          <div className="w-[58%] p-2 flex flex-col justify-between">
            <div className="font-bold text-[11.5px]">
              TOTAL &nbsp;&nbsp;&nbsp;&nbsp; {calculation.totalQty}
            </div>
            <div className="text-[10px] font-normal leading-tight text-black mt-1">
              {calculation.gstSummaryLine}
            </div>
          </div>

          {/* Right: Calculations breakdown */}
          <div className="w-[42%] border-l border-black p-2 space-y-0.5">
            {/* SUB TOTAL */}
            <div className="flex justify-between items-center text-black">
              <span className="font-bold">SUB TOTAL</span>
              <span className="font-bold text-right">
                {calculation.subTotal}
              </span>
            </div>

            {/* Discount row (only if discount > 0) */}
            {hasDiscount && (
              <div className="flex justify-between items-center text-black">
                <span>Discount {calculation.discountPct > 0 ? `${calculation.discountPct} %` : ""}</span>
                <span className="text-right">
                  {calculation.discountAmount}
                </span>
              </div>
            )}

            {/* SGST % */}
            <div className="flex justify-between items-center text-black">
              <span>SGST {calculation.sgstRatePct}</span>
              <span className="text-right">{calculation.sgstTotal}</span>
            </div>

            {/* CGST % */}
            <div className="flex justify-between items-center text-black">
              <span>CGST {calculation.cgstRatePct}</span>
              <span className="text-right">{calculation.cgstTotal}</span>
            </div>

            {/* Roundoff: Positioned directly below CGST %, matching Image 3 */}
            <div className="flex justify-between items-center text-black">
              <span>Roundoff</span>
              <span className="text-right">{calculation.roundOff}</span>
            </div>

            {/* CR/DR NOTE 0.00 */}
            <div className="flex justify-between items-center text-black">
              <span>CR/DR NOTE</span>
              <span className="text-right">0.00</span>
            </div>
          </div>
        </div>

        {/* Grand Total Row */}
        <div className="w-full flex items-center border-b-[1.5px] border-black text-[11px] py-1.5 px-2">
          {/* Left: Amount in words - in BOLD as requested */}
          <div className="w-[58%] font-bold text-[11.5px] text-black tracking-tight">
            {calculation.amountInWords}
          </div>

          {/* Right: GRAND TOTAL */}
          <div className="w-[42%] flex justify-between items-center pl-1 font-black text-[13.5px] text-black">
            <span>GRAND TOTAL</span>
            <span className="text-right">{calculation.grandTotal}</span>
          </div>
        </div>

        {/* Terms, Conditions, Bank Details, and Signatures */}
        <div className="w-full flex text-[9.5px] leading-[1.3] p-2 min-h-[110px]">
          {/* Left Block */}
          <div className="w-[62%] flex flex-col justify-between">
            <div>
              <div>
                <span className="font-bold underline">Terms & Conditions</span>
                <span className="ml-1">
                  Certified that the particulars given above are true and correct.
                </span>
              </div>
              <div className="mt-0.5">
                1.Payment should be made for all credit transaction within due date
              </div>
              <div>
                from the date of invoice after which interest will be charged 12% p.a.
              </div>
              <div>All disputes subject to &nbsp;Jurisdication only.</div>
              <div className="text-[8px] tracking-widest text-black">
                ----------------------------------------------------
              </div>
              <div className="font-bold text-[10px] mt-0.5 text-black">
                BANK DETAIL: UNION BANK OF INDIA, BRANCH : SUNDARI MOHAN AVENUE
              </div>
              <div className="font-bold text-[10px] text-black">
                ACCOUNT NO.: 301401010500559, IFSC: UBIN0530140
              </div>
            </div>
            <div className="font-normal text-black mt-2">
              Customers Seal and Signature
            </div>
          </div>

          {/* Right Block */}
          <div className="w-[38%] flex flex-col justify-between pl-6 text-right">
            <div className="font-bold text-[11.5px] text-black pr-1">
              For INDOBEST
            </div>
            <div className="font-normal text-[10px] text-black pr-1 mb-1">
              Authorised signatory
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Print CSS strictly enforcing 1 single A4 portrait page */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: 296mm !important;
            max-height: 296mm !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: hidden !important;
          }
          nav, header, aside, .no-print, [role="navigation"] {
            display: none !important;
          }
          /* Reset parent containers that could push content down */
          main, div:has(> .invoice-a4-page) {
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
          }
          .invoice-a4-page {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            height: 296mm !important;
            max-height: 296mm !important;
            margin: 0 !important;
            padding: 7mm 11mm 5mm 11mm !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            page-break-before: avoid !important;
            break-inside: avoid !important;
            break-after: avoid !important;
            overflow: hidden !important;
            background: #ffffff !important;
            z-index: 99999 !important;
          }
        }
      `}</style>
    </div>
  );
};
