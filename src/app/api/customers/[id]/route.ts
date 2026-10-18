import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCustomerName } from "@/lib/matching/normalize";
import { Prisma } from "@prisma/client";
import { getOrCreateCustomerLedgerAccount, calculateAccountTotalDue } from "@/lib/ledger/account-utils";
import { allocateBillwiseOutstanding } from "@/lib/ledger/billAllocation";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      aliases: true,
      ledger_account: {
        select: { id: true, display_name: true },
      },
      invoices: {
        orderBy: { invoice_date: "desc" },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  pack_size_kg: true,
                  default_hsn: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Customer not found" } },
      { status: 404 }
    );
  }

  // Ensure / resolve linked ledger account
  const ledgerAccount = await getOrCreateCustomerLedgerAccount(customer.id);

  // Compute total billed invoices
  let totalInvoiced = 0;
  for (const inv of customer.invoices) {
    totalInvoiced += Number(inv.grand_total);
  }

  // Total due comes from ledger account closing balance if available, otherwise total invoiced
  let totalDue = totalInvoiced;
  if (ledgerAccount && ledgerAccount.entries && ledgerAccount.entries.length > 0) {
    totalDue = calculateAccountTotalDue(ledgerAccount, true);
  }

  // Prepare flat invoice array for billwise allocation
  const rawInvoices = customer.invoices.map((inv) => {
    const taxable = Number(inv.taxable_total);
    const grand = Number(inv.grand_total);
    const gst = Number(inv.cgst_total) + Number(inv.sgst_total) + Number(inv.igst_total || 0);
    const itemsSummary = inv.items
      .map((it) => `${it.product?.name || it.product_name_raw} (${Number(it.qty_kg)} kg)`)
      .join(", ");

    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date.toISOString().split("T")[0],
      taxableTotal: taxable,
      grandTotal: grand,
      gstTotal: gst,
      itemsSummary,
      itemsCount: inv.items.length,
      items: inv.items,
    };
  });

  // Reverse-chronological billwise outstanding allocation (newest bills first)
  const allocatedInvoices = allocateBillwiseOutstanding(rawInvoices, totalDue);

  // 1. Group allocated invoices by month
  const monthlyMap = new Map<string, {
    monthKey: string;
    monthLabel: string;
    year: number;
    month: number;
    taxableTotal: number;
    gstTotal: number;
    grandTotal: number;
    outstandingTotal: number;
    invoicesCount: number;
    invoices: any[];
  }>();

  // 2. Calculate Products Bought Portfolio
  const productsMap = new Map<string, {
    productId: string;
    code: string;
    name: string;
    packSizeKg: number | null;
    totalQtyKg: number;
    totalTaxable: number;
    totalAmount: number;
    lastRate: number;
    rates: number[];
    lastDate: string;
    invoicesCount: number;
  }>();

  let totalVolumeKg = 0;

  for (const inv of allocatedInvoices) {
    const d = new Date(inv.invoiceDate);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleString("en-IN", { month: "long", year: "numeric" });

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        monthKey,
        monthLabel,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        taxableTotal: 0,
        gstTotal: 0,
        grandTotal: 0,
        outstandingTotal: 0,
        invoicesCount: 0,
        invoices: [],
      });
    }

    const m = monthlyMap.get(monthKey)!;
    m.taxableTotal += inv.taxableTotal;
    m.gstTotal += inv.gstTotal;
    m.grandTotal += inv.grandTotal;
    m.outstandingTotal += inv.outstandingAmount;
    m.invoicesCount += 1;

    m.invoices.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      taxableTotal: inv.taxableTotal,
      grandTotal: inv.grandTotal,
      outstandingAmount: inv.outstandingAmount,
      settledAmount: inv.settledAmount,
      status: inv.status,
      itemsSummary: inv.itemsSummary,
      itemsCount: inv.itemsCount,
    });

    for (const it of inv.items) {
      const pId = it.product_id;
      const q = Number(it.qty_kg);
      const rate = Number(it.rate);
      const taxAmt = Number(it.taxable_amount);
      const lineTot = Number(it.line_total);

      totalVolumeKg += q;

      if (!productsMap.has(pId)) {
        productsMap.set(pId, {
          productId: pId,
          code: it.product?.code || "—",
          name: it.product?.name || it.product_name_raw,
          packSizeKg: it.pack_size_kg ? Number(it.pack_size_kg) : null,
          totalQtyKg: 0,
          totalTaxable: 0,
          totalAmount: 0,
          lastRate: rate,
          rates: [],
          lastDate: inv.invoiceDate,
          invoicesCount: 0,
        });
      }

      const p = productsMap.get(pId)!;
      p.totalQtyKg += q;
      p.totalTaxable += taxAmt;
      p.totalAmount += lineTot;
      p.rates.push(rate);
      p.invoicesCount += 1;
    }
  }

  // Sort months in descending order (newest first)
  const monthlyBreakdown = Array.from(monthlyMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  // Sort products by total quantity bought (highest first)
  const productsBought = Array.from(productsMap.values()).map((p) => {
    const avgRate = p.rates.length > 0 && p.totalQtyKg > 0 ? p.totalTaxable / p.totalQtyKg : 0;
    return {
      ...p,
      avgRate: Math.round(avgRate * 100) / 100,
      totalQtyKg: Math.round(p.totalQtyKg * 1000) / 1000,
      totalAmount: Math.round(p.totalAmount * 100) / 100,
    };
  }).sort((a, b) => b.totalQtyKg - a.totalQtyKg);

  return NextResponse.json({
    customer: {
      ...customer,
      totalOutstanding: Math.round(totalDue * 100) / 100,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalVolumeKg: Math.round(totalVolumeKg * 1000) / 1000,
      invoicesCount: customer.invoices.length,
      ledgerAccountId: ledgerAccount?.id || null,
      ledger_account: ledgerAccount ? { id: ledgerAccount.id, display_name: ledgerAccount.display_name } : null,
    },
    monthlyBreakdown,
    productsBought,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const updateData: Prisma.CustomerUpdateInput = {};

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
      updateData.name_norm = normalizeCustomerName(body.name);
    }
    if (body.gstin !== undefined) {
      const g = body.gstin ? body.gstin.trim().toUpperCase() : null;
      updateData.gstin = g;
      updateData.state_code = g && g.length >= 2 ? g.substring(0, 2) : null;
    }
    if (body.address !== undefined) {
      updateData.address = body.address ? body.address.trim() : null;
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Error updating customer:", error);
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Failed to update customer" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { invoices: true } } },
    });

    if (!customer) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Customer not found" } },
        { status: 404 }
      );
    }

    if (customer._count.invoices > 0) {
      return NextResponse.json(
        {
          error: {
            code: "HAS_INVOICES",
            message: `Cannot delete customer '${customer.name}' because they have ${customer._count.invoices} associated invoice(s). Merge the customer or delete associated invoices first.`,
          },
        },
        { status: 400 }
      );
    }

    // Clean up aliases before customer deletion
    await prisma.customerAlias.deleteMany({
      where: { customer_id: id },
    });

    await prisma.customer.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: "Failed to delete customer" } },
      { status: 500 }
    );
  }
}
