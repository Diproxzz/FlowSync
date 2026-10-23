import { InvoiceCalculationResult } from "./calculations";
import { CustomerInvoiceMeta, InvoiceHeaderMeta } from "@/components/invoices/PrintableInvoice";

export interface RenderInvoiceOptions {
  customer: CustomerInvoiceMeta;
  meta: InvoiceHeaderMeta;
  calculation: InvoiceCalculationResult;
}

export function renderInvoiceToHtml({ customer, meta, calculation }: RenderInvoiceOptions): string {
  // Ensure "19-WEST BENGAL" or "19 - WEST BENGAL" is placed on its own next line
  const rawAddress = (customer.address || "").replace(
    /\s*(19\s*-\s*WEST\s+BENGAL)/gi,
    "\n$1"
  );
  const addressLines = rawAddress
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const hasDiscount = calculation.hasDiscount;

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

  const addressLinesHtml = addressLines
    .map((line) => `<div class="text-black text-[12px]">${escapeHtml(line)}</div>`)
    .join("");

  const rowsHtml = calculation.items
    .map(
      (item) => `
      <div class="w-full flex text-[13px] leading-[1.35] text-black font-medium pt-0.5" style="height: 24px;">
        <div style="width: ${colWidths[0]}" class="text-center px-0.5">${item.sl}.</div>
        <div style="width: ${colWidths[1]}" class="text-right pr-1.5 font-bold">${escapeHtml(item.qty)}</div>
        <div style="width: ${colWidths[2]}" class="text-right pr-1">${escapeHtml(item.pack)}</div>
        <div style="width: ${colWidths[3]}" class="text-left pl-1.5 truncate uppercase font-bold text-[13px]">${escapeHtml(item.product)}</div>
        <div style="width: ${colWidths[4]}" class="text-center px-0.5">${escapeHtml(item.batch || "")}</div>
        <div style="width: ${colWidths[5]}" class="text-center font-mono text-[11.5px] px-0.5 tracking-tight font-semibold">${escapeHtml(item.hsn)}</div>
        <div style="width: ${colWidths[6]}" class="text-right pr-1 font-mono text-[12px] font-semibold">${escapeHtml(item.rate)}</div>
        ${
          hasDiscount
            ? `<div style="width: ${colWidths[7]}" class="text-right pr-1 font-mono text-[12px] font-semibold">${
                item.discountPct && Number(item.discountPct) > 0 ? `${escapeHtml(item.discountPct)}%` : "0%"
              }</div>`
            : ""
        }
        <div style="width: ${hasDiscount ? colWidths[8] : colWidths[7]}" class="text-right pr-1 font-bold font-mono text-[12px]">${escapeHtml(item.taxable)}</div>
        <div style="width: ${hasDiscount ? colWidths[9] : colWidths[8]}" class="text-right pr-0.5 font-mono text-[11.5px]">${escapeHtml(item.sgstPct)}</div>
        <div style="width: ${hasDiscount ? colWidths[10] : colWidths[9]}" class="text-right pr-0.5 font-mono text-[11.5px]">${escapeHtml(item.cgstPct)}</div>
        <div style="width: ${hasDiscount ? colWidths[11] : colWidths[10]}" class="text-right pr-1.5 font-bold font-mono text-[12.5px]">${escapeHtml(item.amount)}</div>
      </div>`
    )
    .join("");

  const verticalBordersHtml = colWidths
    .map(
      (w, idx) =>
        `<div style="width: ${w};" class="${idx < colWidths.length - 1 ? "border-r border-black h-full" : "h-full"}"></div>`
    )
    .join("");

  return `
    <div
      class="invoice-a4-page mx-auto bg-white text-black font-sans leading-tight select-none relative"
      style="width: 210mm; height: 296mm; max-height: 296mm; padding: 7mm 11mm 5mm 11mm; box-sizing: border-box; color: #000000; background-color: #ffffff; overflow: hidden;"
    >
      <!-- Top Copy Label -->
      <div class="w-full text-right pr-1 pb-1">
        <span class="text-[12px] italic underline tracking-wide font-normal">
          ${escapeHtml(meta.copyType || "ORIGINAL")} / DUPLICATE / TRIPLICATE COPY
        </span>
      </div>

      <!-- Main Outer Box -->
      <div class="w-full border-[2.5px] border-black flex flex-col relative" style="height: calc(100% - 22px); box-sizing: border-box;">
        <!-- Header -->
        <div class="w-full pt-1.5 pb-1 text-center border-b border-black">
          <h1 class="text-[32px] font-black tracking-wider leading-none m-0 p-0" style="font-family: Arial, sans-serif;">
            INDOBEST
          </h1>
          <div class="text-[11.5px] font-normal leading-[1.3] mt-1">19/10/2,GOBINDA KHATICK ROAD</div>
          <div class="text-[11.5px] font-normal leading-[1.3]">KOLKATA-700046 19-WEST BENGAL</div>
          <div class="text-[11.5px] font-normal leading-[1.3] mt-0.5">Phone : 8240892993</div>
          <div class="text-[11.5px] font-normal leading-[1.3]">E-Mail : indobest@gmail.com</div>
          <div class="text-[15.5px] font-black tracking-wide leading-tight mt-1" style="font-family: Arial, sans-serif;">
            GST INVOICE
          </div>
        </div>

        <!-- GSTIN Banner -->
        <div class="w-full py-0.5 text-center text-[11.5px] font-semibold border-b border-black">
          GSTIN : 19AVZPC2361G1ZA
        </div>

        <!-- Customer & Meta Row -->
        <div class="w-full flex text-[12px] leading-[1.35] border-b border-black min-h-[90px]">
          <div class="w-[53%] p-2 flex flex-col justify-between border-r border-black">
            <div>
              <div class="font-bold text-[14.5px] text-black">${escapeHtml(customer.name)}</div>
              ${addressLinesHtml}
              ${customer.phone ? `<div class="text-black text-[12px] mt-0.5">PH.NO.: ${escapeHtml(customer.phone)}</div>` : ""}
            </div>
            <div class="mt-1 font-semibold text-[12px] text-black">
              GSTIN : ${escapeHtml(customer.gstin || "URP")}
            </div>
          </div>

          <div class="w-[47%] p-2 flex flex-col justify-between text-[12px]">
            <div class="space-y-0.5">
              <div class="flex items-center justify-between whitespace-nowrap text-[12px]">
                <div class="flex items-center whitespace-nowrap">
                  <span class="text-black whitespace-nowrap">Invoice No. :&nbsp;</span>
                  <span class="font-bold text-black text-[12.5px] whitespace-nowrap">${escapeHtml(meta.invoiceNumber)}</span>
                </div>
                <div class="flex items-center whitespace-nowrap pl-2">
                  <span class="text-black whitespace-nowrap">Date :&nbsp;</span>
                  <span class="font-bold text-black text-[12.5px] whitespace-nowrap">${escapeHtml(meta.invoiceDate)}</span>
                </div>
              </div>

              <div class="flex items-center whitespace-nowrap text-[12px]">
                <span class="w-28 text-black shrink-0 whitespace-nowrap">Order No. :</span>
                <span class="text-black font-medium truncate">${escapeHtml(meta.orderNo || "")}</span>
              </div>
              <div class="flex items-center whitespace-nowrap text-[12px]">
                <span class="w-28 text-black shrink-0 whitespace-nowrap">DELIVERY NOTE :</span>
                <span class="text-black font-semibold uppercase truncate">${escapeHtml(meta.deliveryNote || "")}</span>
              </div>
              <div class="flex items-center whitespace-nowrap text-[12px]">
                <span class="w-28 text-black shrink-0 whitespace-nowrap">DESTINATION :</span>
                <span class="text-black font-semibold uppercase truncate">${escapeHtml(meta.destination || "")}</span>
              </div>
            </div>
            <div class="flex items-center mt-1 whitespace-nowrap text-[12px]">
              <span class="w-28 text-black shrink-0 whitespace-nowrap">E-WAY BILL NO. :</span>
              <span class="text-black font-medium truncate">${escapeHtml(meta.ewayBillNo || "")}</span>
            </div>
          </div>
        </div>

        <!-- Item Table -->
        <div class="w-full relative flex flex-col flex-1" style="min-height: 360px; max-height: 430px;">
          <!-- Grid Lines -->
          <div class="absolute inset-0 flex pointer-events-none z-10">
            ${verticalBordersHtml}
          </div>

          <!-- Watermark -->
          ${
            meta.hasWatermark ?? true
              ? `
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0" style="overflow: hidden;">
              <div class="font-black tracking-[0.18em] text-[62px] uppercase select-none" style="color: rgba(220, 220, 220, 0.55); transform: rotate(-38deg); font-family: Arial, sans-serif;">
                INDOBEST
              </div>
            </div>`
              : ""
          }

          <!-- Table Header with Vertical Borders -->
          <div class="w-full flex border-b border-black text-[11.5px] font-bold text-black leading-tight text-center relative z-20 bg-white" style="height: 24px;">
            <div style="width: ${colWidths[0]}" class="p-0.5 text-center border-r border-black flex items-center justify-center">Sl.</div>
            <div style="width: ${colWidths[1]}" class="p-0.5 text-right pr-1.5 border-r border-black flex items-center justify-end">Qnty</div>
            <div style="width: ${colWidths[2]}" class="p-0.5 text-right pr-1 border-r border-black flex items-center justify-end">Pack</div>
            <div style="width: ${colWidths[3]}" class="p-0.5 text-left pl-1.5 border-r border-black flex items-center justify-start">Product</div>
            <div style="width: ${colWidths[4]}" class="p-0.5 text-center border-r border-black flex items-center justify-center">Batch</div>
            <div style="width: ${colWidths[5]}" class="p-0.5 text-center border-r border-black flex items-center justify-center">HSN</div>
            <div style="width: ${colWidths[6]}" class="p-0.5 text-right pr-1 border-r border-black flex items-center justify-end">Rate</div>
            ${hasDiscount ? `<div style="width: ${colWidths[7]}" class="p-0.5 text-right pr-1 border-r border-black flex items-center justify-end">Disc %</div>` : ""}
            <div style="width: ${hasDiscount ? colWidths[8] : colWidths[7]}" class="p-0.5 text-right pr-1 border-r border-black flex items-center justify-end">TAXABLE</div>
            <div style="width: ${hasDiscount ? colWidths[9] : colWidths[8]}" class="p-0.5 text-right pr-0.5 text-[10px] border-r border-black flex items-center justify-end">SGST</div>
            <div style="width: ${hasDiscount ? colWidths[10] : colWidths[9]}" class="p-0.5 text-right pr-0.5 text-[10px] border-r border-black flex items-center justify-end">CGST</div>
            <div style="width: ${hasDiscount ? colWidths[11] : colWidths[10]}" class="p-0.5 text-right pr-1.5 flex items-center justify-end">Amount</div>
          </div>

          <!-- Data Rows -->
          <div class="w-full flex-1 relative z-20">
            ${rowsHtml}
          </div>
        </div>

        <!-- Lower Table Border -->
        <div class="w-full border-t border-black"></div>

        <!-- Totals & GST Summary Section -->
        <div class="w-full flex min-h-[82px] border-b border-black text-[12px]">
          <div class="w-[53%] p-2 flex flex-col justify-between">
            <div class="font-bold text-[13px] whitespace-nowrap">
              TOTAL &nbsp;&nbsp;&nbsp;&nbsp; ${escapeHtml(calculation.totalQty)}
            </div>
            <div class="text-[11px] font-normal leading-tight text-black mt-1 font-mono break-all">
              ${escapeHtml(calculation.gstSummaryLine)}
            </div>
          </div>

          <div class="w-[47%] border-l border-black p-2 space-y-0.5 text-[12px]">
            <div class="flex justify-between items-center text-black whitespace-nowrap">
              <span class="font-bold">SUB TOTAL</span>
              <span class="font-bold text-right">${escapeHtml(calculation.subTotal)}</span>
            </div>
            ${
              hasDiscount
                ? `
            <div class="flex justify-between items-center text-black whitespace-nowrap">
              <span>Discount ${calculation.discountPct > 0 ? `${calculation.discountPct} %` : ""}</span>
              <span class="text-right">${escapeHtml(calculation.discountAmount)}</span>
            </div>`
                : ""
            }
            <div class="flex justify-between items-center text-black whitespace-nowrap">
              <span>SGST ${escapeHtml(calculation.sgstRatePct)}</span>
              <span class="text-right font-semibold">${escapeHtml(calculation.sgstTotal)}</span>
            </div>
            <div class="flex justify-between items-center text-black whitespace-nowrap">
              <span>CGST ${escapeHtml(calculation.cgstRatePct)}</span>
              <span class="text-right font-semibold">${escapeHtml(calculation.cgstTotal)}</span>
            </div>
            <div class="flex justify-between items-center text-black whitespace-nowrap">
              <span>Roundoff</span>
              <span class="text-right font-semibold">${escapeHtml(calculation.roundOff)}</span>
            </div>
            <div class="flex justify-between items-center text-black whitespace-nowrap">
              <span>CR/DR NOTE</span>
              <span class="text-right">0.00</span>
            </div>
          </div>
        </div>

        <!-- Grand Total Row -->
        <div class="w-full flex items-center border-b-[1.5px] border-black text-[12px] py-1.5 px-2">
          <div class="w-[53%] font-bold text-[12.5px] text-black tracking-tight pr-2">
            ${escapeHtml(calculation.amountInWords)}
          </div>
          <div class="w-[47%] flex justify-between items-center pl-2 font-black text-[15px] text-black whitespace-nowrap">
            <span>GRAND TOTAL</span>
            <span class="text-right">${escapeHtml(calculation.grandTotal)}</span>
          </div>
        </div>

        <!-- Terms & Signatures -->
        <div class="w-full flex text-[10.5px] leading-[1.3] p-2 min-h-[120px]">
          <div class="w-[62%] flex flex-col justify-between">
            <div>
              <div>
                <span class="font-bold underline">Terms & Conditions</span>
                <span class="ml-1">Certified that the particulars given above are true and correct.</span>
              </div>
              <div class="mt-0.5">1.Payment should be made for all credit transaction within due date</div>
              <div>from the date of invoice after which interest will be charged 12% p.a.</div>
              <div>All disputes subject to &nbsp;Jurisdication only.</div>
              <div class="text-[8px] tracking-widest text-black">----------------------------------------------------</div>
              <div class="font-bold text-[11px] mt-0.5 text-black">BANK DETAIL: UNION BANK OF INDIA, BRANCH : SUNDARI MOHAN AVENUE</div>
              <div class="font-bold text-[11px] text-black">ACCOUNT NO.: 301401010500559, IFSC: UBIN0530140</div>
            </div>
            <div class="mt-3">
              <div class="font-semibold text-black text-[11px]">Customers Seal and Signature</div>
              <div class="h-7 w-full"></div>
            </div>
          </div>

          <div class="w-[38%] flex flex-col justify-between pl-6 text-right">
            <div class="font-bold text-[13px] text-black pr-1">For INDOBEST</div>
            <div class="font-normal text-[11px] text-black pr-1 mb-2">Authorised signatory</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
