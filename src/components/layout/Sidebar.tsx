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
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Upload Invoice", href: "/upload", icon: FileUp },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Products", href: "/products", icon: Package },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Stock Summary", href: "/stock", icon: Boxes },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 bg-surface border-r border-border flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-14 px-5 border-b border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-sm bg-primary text-primary-fg flex items-center justify-center font-bold text-xs tracking-wider">
          IB
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm leading-tight text-ink">Indobest</span>
          <span className="text-[10px] text-ink-3 uppercase tracking-wider font-mono">Insights</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-border bg-surface-2/40">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-ink-3">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span>FY 2026-27 Active</span>
        </div>
      </div>
    </aside>
  );
}
