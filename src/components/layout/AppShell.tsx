"use client";

import React from "react";
import { useSidebar } from "./SidebarContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WispChat } from "@/components/wisp/WispChat";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isPinned, isOpen, closeSidebar } = useSidebar();

  return (
    <div className="flex min-h-screen bg-bg print:bg-white">
      {/* Sidebar Component (Fixed overlay when unpinned, static rail when pinned) */}
      <div className="print:hidden">
        <Sidebar />
      </div>

      {/* Subtle backdrop overlay when hovering unpinned sidebar */}
      {isOpen && !isPinned && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-ink/15 backdrop-blur-[0.5px] transition-opacity duration-200 print:hidden"
          aria-hidden="true"
        />
      )}

      {/* Main Workspace Area (expands to 100% when unpinned/collapsed) */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out print:pl-0 print:m-0",
          isPinned && "md:pl-60"
        )}
      >
        <div className="print:hidden">
          <Topbar />
        </div>
        <main className="flex-1 p-6 overflow-y-auto print:p-0 print:overflow-visible print:bg-white">
          {children}
        </main>
        {/* Wisp Assistant Floating Drawer */}
        <WispChat />
      </div>
    </div>
  );
}
