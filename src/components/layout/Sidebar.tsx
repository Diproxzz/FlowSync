"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileUp,
  Receipt,
  Package,
  Users,
  Boxes,
  Settings,
  Calendar,
  Pin,
  PinOff,
  X,
  ShoppingCart,
  Truck,
  BookOpen,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";

interface NavItem {
  label: string;
  href: string;
  icon: any;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const isPurchasesEnabled = process.env.NEXT_PUBLIC_FEATURE_PURCHASES !== "false";
const isLedgerEnabled = process.env.NEXT_PUBLIC_FEATURE_LEDGER !== "false";

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Upload Invoice", href: "/upload", icon: FileUp },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Sales Invoices", href: "/invoices", icon: Receipt },
      { label: "Customers", href: "/customers", icon: Users },
    ],
  },
  ...(isPurchasesEnabled
    ? [
        {
          title: "Purchases",
          items: [
            { label: "Purchase Invoices", href: "/purchases", icon: ShoppingCart },
            { label: "Suppliers", href: "/suppliers", icon: Truck },
          ],
        },
      ]
    : []),
  ...(isLedgerEnabled
    ? [
        {
          title: "Accounts & Ledger",
          items: [
            { label: "Party Ledgers", href: "/accounts", icon: BookOpen },
            { label: "Import Statement", href: "/accounts/import", icon: FileSpreadsheet },
          ],
        },
      ]
    : []),
  {
    title: "Inventory & Setup",
    items: [
      { label: "Products", href: "/products", icon: Package },
      { label: "Stock Summary", href: "/stock", icon: Boxes },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const {
    isOpen,
    isPinned,
    togglePinned,
    handleMouseEnter,
    handleMouseLeave,
    closeSidebar,
  } = useSidebar();

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "w-60 bg-surface border-r border-border flex flex-col h-screen fixed inset-y-0 left-0 transition-transform duration-200 ease-out",
        isPinned
          ? "z-40 translate-x-0"
          : cn(
              "z-50 shadow-2xl",
              isOpen
                ? "translate-x-0 pointer-events-auto"
                : "-translate-x-full pointer-events-none"
            )
      )}
    >
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="Indobest"
            className="w-8 h-8 object-contain rounded-sm border border-border shadow-xs bg-[#fbf9f5]"
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight text-ink tracking-tight">Indobest</span>
            <span className="text-[10px] text-ink-3 uppercase tracking-wider font-mono">Leather Chemicals</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={togglePinned}
            type="button"
            title={isPinned ? "Unpin (collapse when working on other side)" : "Pin sidebar open"}
            className={cn(
              "p-1.5 rounded-sm text-ink-3 hover:text-ink hover:bg-surface-2 transition",
              isPinned ? "text-primary bg-primary/10" : "hover:text-primary"
            )}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5 rotate-45 text-primary" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
          {!isPinned && (
            <button
              onClick={closeSidebar}
              type="button"
              title="Close sidebar"
              className="p-1.5 rounded-sm text-ink-3 hover:text-danger hover:bg-surface-2 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {section.title && (
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeSidebar}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-sm text-xs font-medium transition",
                    isActive
                      ? "bg-primary-soft text-primary font-semibold"
                      : "text-ink-2 hover:text-ink hover:bg-surface-2"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-border bg-surface-2/40">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-ink-2">
          <Calendar className="w-3.5 h-3.5 text-accent" />
          <span className="font-medium">FY 2026-27 Active</span>
        </div>
      </div>
    </aside>
  );
}
