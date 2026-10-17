"use client";

import React from "react";
import { useSidebar } from "./SidebarContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isPinned, isOpen, closeSidebar } = useSidebar();

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Sidebar Component (Fixed overlay when unpinned, static rail when pinned) */}
      <Sidebar />

      {/* Subtle backdrop overlay when hovering unpinned sidebar */}
      {isOpen && !isPinned && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-ink/15 backdrop-blur-[0.5px] transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Main Workspace Area (expands to 100% when unpinned/collapsed) */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out",
          isPinned && "md:pl-60"
        )}
      >
        <Topbar />
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
