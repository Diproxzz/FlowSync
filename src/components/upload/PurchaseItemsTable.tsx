"use client";

import { useState } from "react";
import { Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { ExtractedPurchaseInvoiceItem } from "@/lib/llm/schema.purchase";
import { convertUnitToKg, normalizeUnit } from "@/lib/units/convert";
import { cn } from "@/lib/utils";

export interface ProductOption {
  id: string;
  code: string;
  name: string;
  default_hsn?: string | null;
  pack_size_kg?: number | null;
  std_purchase_rate?: number | null;
}

export interface PurchaseItemResolution {
  lineNo: number;
  productId?: string;
  productCode?: string;
  productName?: string;
  packSizeKg?: number | null;
  manualQtyKg?: number | null;
  status: "MATCHED" | "NEW";
}

interface PurchaseItemsTableProps {
  items: ExtractedPurchaseInvoiceItem[];
  productResolutions: PurchaseItemResolution[];
  productsList: ProductOption[];
  isIgstActive: boolean;
  updateStdRates: Record<string, boolean>;
  onUpdateItem: (index: number, field: keyof ExtractedPurchaseInvoiceItem, value: any) => void;
  onUpdateResolution: (index: number, updates: Partial<PurchaseItemResolution>) => void;
  onToggleUpdateStdRate: (productId: string) => void;
  onAddItem: () => void;
  onDeleteItem: (index: number) => void;
}

export function PurchaseItemsTable({
  items,
  productResolutions,
  productsList,
  isIgstActive,
  updateStdRates,
  onUpdateItem,
  onUpdateResolution,
  onToggleUpdateStdRate,
  onAddItem,
  onDeleteItem,
}: PurchaseItemsTableProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink uppercase tracking-wide text-[11px]">
          Purchase Line Items ({items.length})
        </span>
        <button
          type="button"
          onClick={onAddItem}
          className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline font-semibold"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Line</span>
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-x-auto bg-surface shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-surface-2 text-ink-2 font-medium border-b border-border">
              <th className="py-2 px-2.5 w-8 text-center">#</th>
              <th className="py-2 px-2.5 min-w-[180px]">Product Description</th>
              <th className="py-2 px-2.5 min-w-[160px]">Map to Product</th>
              <th className="py-2 px-2.5 min-w-[95px]">HSN</th>
              <th className="py-2 px-2.5 min-w-[130px]">Printed Qty & Unit</th>
              <th className="py-2 px-2.5 text-right min-w-[95px]">Rate (₹)</th>
              <th className="py-2 px-2.5 text-right min-w-[70px]">Disc (₹)</th>
              <th className="py-2 px-2.5 text-right min-w-[110px]">Taxable (₹)</th>
              <th className="py-2 px-2.5 text-right min-w-[80px]">{isIgstActive ? "IGST %" : "GST %"}</th>
              <th className="py-2 px-2.5 text-right min-w-[110px]">Total (₹)</th>
              <th className="py-2 px-2.5 text-center min-w-[70px]" title="Update standard purchase rate in catalog">
                Update Std Rate
              </th>
              <th className="py-2 px-2 text-center w-10">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, index) => {
              const pRes = productResolutions[index] || {
                lineNo: item.lineNo,
                status: "NEW",
              };

              // Unit conversion check
              const unitNorm = normalizeUnit(item.unitPrinted);
              const conv = convertUnitToKg({
                qtyPrinted: item.qtyPrinted,
                unitPrinted: unitNorm,
                packSizeKg: pRes.packSizeKg,
                manualQtyKg: pRes.manualQtyKg,
                rate: item.rate,
              });

              const isDrumUnit = ["DRUM", "BAG", "CAN", "PACK"].includes(unitNorm);
              const needsManual = unitNorm !== "KG" && conv.needsManualKg;

              return (
                <tr key={index} className="hover:bg-surface-2/40 transition">
                  <td className="py-2 px-2.5 text-ink-3 font-mono text-center">
                    {item.lineNo}
                  </td>

                  {/* 1. Product Description */}
                  <td className="py-2 px-2.5">
                    <input
                      type="text"
                      value={item.productNameRaw}
                      onChange={(e) =>
                        onUpdateItem(index, "productNameRaw", e.target.value)
                      }
                      className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </td>

                  {/* 2. Map to Product */}
                  <td className="py-2 px-2.5">
                    <select
                      value={pRes.productId || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const found = productsList.find((p) => p.id === val);
                        if (found) {
                          onUpdateResolution(index, {
                            productId: found.id,
                            productCode: found.code,
                            productName: found.name,
                            packSizeKg: found.pack_size_kg || pRes.packSizeKg,
                            status: "MATCHED",
                          });
                        } else {
                          onUpdateResolution(index, {
                            productId: undefined,
                            productCode: item.productNameRaw,
                            productName: item.productNameRaw,
                            status: "NEW",
                          });
                        }
                      }}
                      className="w-full px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="">
                        ＋ Create New ({item.productNameRaw || "Product"})
                      </option>
                      {productsList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-0.5">
                      {pRes.status === "MATCHED" ? (
                        <span className="text-[10px] text-success font-medium">
                          ✓ Matched: {pRes.productCode}
                        </span>
                      ) : (
                        <span className="text-[10px] text-accent font-medium">
                          ＋ New Product
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 3. HSN */}
                  <td className="py-2 px-2.5">
                    <input
                      type="text"
                      value={item.hsn || ""}
                      onChange={(e) =>
                        onUpdateItem(index, "hsn", e.target.value || null)
                      }
                      placeholder="e.g. 38241000"
                      className="w-full min-w-[85px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs font-mono text-center tracking-wider text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </td>

                  {/* 4. Printed Qty & Unit with Converter */}
                  <td className="py-2 px-2.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        value={item.qtyPrinted}
                        onChange={(e) =>
                          onUpdateItem(
                            index,
                            "qtyPrinted",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-16 px-1.5 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num text-ink focus:outline-none focus:ring-1 focus:ring-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <select
                        value={unitNorm}
                        onChange={(e) =>
                          onUpdateItem(index, "unitPrinted", normalizeUnit(e.target.value))
                        }
                        className="px-1.5 py-1.5 bg-bg border border-border rounded-sm text-xs text-ink font-mono uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="KG">KG</option>
                        <option value="DRUM">DRUM</option>
                        <option value="MT">MT</option>
                        <option value="BAG">BAG</option>
                        <option value="CAN">CAN</option>
                        <option value="PACK">PACK</option>
                        <option value="LTR">LTR</option>
                        <option value="NOS">NOS</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                    </div>

                    {/* Drum pack size input */}
                    {isDrumUnit && (
                      <div className="mt-1 flex items-center gap-1 text-[10px]">
                        <span className="text-ink-3">Pack:</span>
                        <input
                          type="number"
                          step="any"
                          placeholder="kg/drum"
                          value={pRes.packSizeKg ?? ""}
                          onChange={(e) =>
                            onUpdateResolution(index, {
                              packSizeKg: e.target.value
                                ? parseFloat(e.target.value)
                                : null,
                            })
                          }
                          className="w-14 px-1 py-0.5 bg-bg border border-border rounded-xs text-[10px] text-right num font-mono"
                        />
                        <span className="text-ink-3">kg</span>
                      </div>
                    )}

                    {/* Unconvertible unit manual kg entry */}
                    {needsManual && (
                      <div className="mt-1 flex items-center gap-1 text-[10px]">
                        <span className="text-danger font-medium">Qty (kg):</span>
                        <input
                          type="number"
                          step="any"
                          placeholder="Manual kg"
                          value={pRes.manualQtyKg ?? ""}
                          onChange={(e) =>
                            onUpdateResolution(index, {
                              manualQtyKg: e.target.value
                                ? parseFloat(e.target.value)
                                : null,
                            })
                          }
                          className="w-16 px-1 py-0.5 bg-bg border border-danger rounded-xs text-[10px] text-right num font-mono text-danger"
                        />
                      </div>
                    )}

                    {unitNorm !== "KG" && conv.isConvertible && (
                      <div className="mt-0.5 text-[10px] text-accent font-mono truncate max-w-[150px]">
                        = {Number(conv.qtyKg).toFixed(2)} kg
                      </div>
                    )}
                  </td>

                  {/* 5. Rate (₹) */}
                  <td className="py-2 px-2.5 text-right">
                    <input
                      type="number"
                      step="any"
                      value={item.rate}
                      onChange={(e) =>
                        onUpdateItem(index, "rate", parseFloat(e.target.value) || 0)
                      }
                      className="w-full min-w-[85px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num text-ink focus:outline-none focus:ring-1 focus:ring-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {unitNorm !== "KG" && Number(conv.ratePerKg) > 0 && (
                      <div className="mt-0.5 text-[10px] text-ink-3 font-mono">
                        (₹{Number(conv.ratePerKg).toFixed(2)}/kg)
                      </div>
                    )}
                  </td>

                  {/* 8. Discount (₹) */}
                  <td className="py-2 px-2.5 text-right">
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={item.discount ?? ""}
                      onChange={(e) =>
                        onUpdateItem(
                          index,
                          "discount",
                          e.target.value === "" ? 0 : parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full min-w-[60px] px-1.5 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num placeholder:text-ink-3 text-ink focus:outline-none focus:ring-1 focus:ring-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>

                  {/* 9. Taxable Amount (₹) */}
                  <td className="py-2 px-2.5 text-right">
                    <input
                      type="number"
                      step="any"
                      value={item.taxableAmount}
                      onChange={(e) =>
                        onUpdateItem(
                          index,
                          "taxableAmount",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full min-w-[95px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num font-medium text-ink focus:outline-none focus:ring-1 focus:ring-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>

                  {/* 10. Tax Rate Select */}
                  <td className="py-2 px-2.5 text-right">
                    <select
                      value={
                        isIgstActive
                          ? Number(item.igstPct || 0)
                          : Math.round(
                              (Number(item.cgstPct || 0) + Number(item.sgstPct || 0)) === 5
                                ? 5
                                : Number(item.cgstPct || 0) + Number(item.sgstPct || 0)
                            )
                      }
                      onChange={(e) => {
                        const totalGst = parseFloat(e.target.value) || 0;
                        if (isIgstActive) {
                          onUpdateItem(index, "igstPct", totalGst);
                          onUpdateItem(index, "cgstPct", 0);
                          onUpdateItem(index, "sgstPct", 0);
                        } else {
                          const halfGst =
                            totalGst === 5
                              ? 2.5
                              : totalGst === 18
                              ? 9
                              : totalGst / 2;
                          onUpdateItem(index, "cgstPct", halfGst);
                          onUpdateItem(index, "sgstPct", halfGst);
                          onUpdateItem(index, "igstPct", 0);
                        }
                      }}
                      className="w-full min-w-[65px] px-1.5 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num text-ink-2 focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="18">18%</option>
                      <option value="12">12%</option>
                      <option value="5">5%</option>
                      <option value="28">28%</option>
                      <option value="0">0%</option>
                    </select>
                  </td>

                  {/* 11. Line Total (₹) */}
                  <td className="py-2 px-2.5 text-right">
                    <input
                      type="number"
                      step="any"
                      value={item.lineTotal ?? 0}
                      onChange={(e) =>
                        onUpdateItem(
                          index,
                          "lineTotal",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full min-w-[100px] px-2 py-1.5 bg-bg border border-border rounded-sm text-xs text-right num font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>

                  {/* 12. Update Std Purchase Rate in Catalog */}
                  <td className="py-2 px-2 text-center">
                    {pRes.productId ? (
                      <input
                        type="checkbox"
                        checked={Boolean(updateStdRates[pRes.productId])}
                        onChange={() => onToggleUpdateStdRate(pRes.productId!)}
                        title={`Update catalog purchase rate to ₹${Number(conv.ratePerKg).toFixed(2)}/kg`}
                        className="w-3.5 h-3.5 rounded-xs accent-accent cursor-pointer"
                      />
                    ) : (
                      <span className="text-[10px] text-ink-3">—</span>
                    )}
                  </td>

                  {/* 13. Actions */}
                  <td className="py-2 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => onDeleteItem(index)}
                      disabled={items.length <= 1}
                      className="p-1 text-ink-3 hover:text-danger disabled:opacity-20 transition"
                      title="Delete line"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
