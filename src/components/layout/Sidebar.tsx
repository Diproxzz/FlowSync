"use client";

import React, { useEffect, useState } from "react";
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
  FileSignature,
  ShieldAlert,
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

function WispNavIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M12 1.75v2" />
      <path d="M4.5 8.75C4.5 5.5 7.8 3.75 12 3.75s7.5 1.75 7.5 5" />
      <path d="M4 8.75c2.5 1.5 13.5 1.5 16 0" />
      <path d="M4.5 9.25C2.5 12.25 2.5 16.25 5.5 19.25 8 21.75 16 21.75 18.5 19.25c3-3 3-7 1-10" />
      <circle cx="8" cy="14" r="2" />
      <circle cx="16" cy="14" r="2" />
      <path d="M10 14h4" />
      <path d="M10.5 17.5c.8.7 2.2.7 3 0" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [session, setSession] = useState<{
    role: "ADMIN" | "CLIENT";
    isAdmin: boolean;
    isReadOnly: boolean;
    clientName: string;
    activeClientName: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setSession(data.data);
      })
      .catch(() => {});
  }, []);

  const {
    isOpen,
    isPinned,
    togglePinned,
    handleMouseEnter,
    handleMouseLeave,
    closeSidebar,
  } = useSidebar();

  const navSections: NavSection[] = [
    ...(session?.isAdmin
      ? [
          {
            title: "Administration",
            items: [{ label: "Admin Portal", href: "/admin", icon: ShieldAlert }],
          },
        ]
      : []),
    {
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Upload Invoice", href: "/upload", icon: FileUp },
      ],
    },
    {
      title: "AI Assistant",
      items: [{ label: "Wisp", href: "/wisp", icon: WispNavIcon }],
    },
    {
      title: "Sales",
      items: [
        { label: "Sales Invoices", href: "/invoices", icon: Receipt },
        { label: "Informal Invoices", href: "/informal-invoices", icon: FileSignature },
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
            src="/logo.png"
            alt="FlowSync"
            className="h-7 w-auto object-contain"
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight text-ink tracking-tight">FlowSync</span>
            <span className="text-[10px] text-ink-3 tracking-wider font-mono">
              {session?.isAdmin
                ? session.isReadOnly
                  ? session.activeClientName || "Client View"
                  : "Admin"
                : session?.clientName || "Indobest"}
            </span>
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
        {navSections.map((section, sIdx) => (
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

      {/* Footer Info & Active Profile */}
      <div className="p-3 border-t border-border bg-surface-2/40 space-y-1.5">
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-ink-2 bg-surface rounded-sm border border-border/60">
          <div className="flex items-center gap-1.5 font-medium min-w-0">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                session?.isAdmin ? "bg-purple-500" : "bg-emerald-500 animate-pulse"
              )}
            />
            <span className="truncate">
              {session?.isAdmin ? (
                session.isReadOnly ? (
                  <>
                    View: <strong className="text-ink font-semibold">{session.activeClientName}</strong>
                  </>
                ) : (
                  <strong className="text-purple-600 dark:text-purple-400 font-semibold">Administrator</strong>
                )
              ) : (
                <>
                  Profile: <strong className="text-ink font-semibold">{session?.clientName || "Indobest"}</strong>
                </>
              )}
            </span>
          </div>
          <span
            className={cn(
              "text-[10px] font-mono font-medium shrink-0",
              session?.isAdmin
                ? session.isReadOnly
                  ? "text-amber-600 dark:text-amber-400 font-semibold"
                  : "text-purple-600 dark:text-purple-400"
                : "text-emerald-600"
            )}
          >
            {session?.isAdmin ? (session.isReadOnly ? "Read-Only" : "Super Admin") : "Active"}
          </span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-ink-2">
          <Calendar className="w-3.5 h-3.5 text-accent" />
          <span className="font-medium">FY 2026-27 Active</span>
        </div>
      </div>
    </aside>
  );
}
