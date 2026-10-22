"use client";

import React, { useEffect, useState } from "react";
import { useSidebar } from "./SidebarContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WispChat } from "@/components/wisp/WispChat";
import { cn } from "@/lib/utils";
import { Eye, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface SessionInfo {
  role: "ADMIN" | "CLIENT";
  isAdmin: boolean;
  isReadOnly: boolean;
  activeClientName: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isPinned, isOpen, closeSidebar } = useSidebar();
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setSession(data.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen bg-bg print:bg-white flex-col">
      {/* Administrator Read-Only Mode Banner */}
      {session?.isAdmin && session?.isReadOnly && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 z-50 print:hidden sticky top-0 backdrop-blur-xs">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Eye className="w-3.5 h-3.5" />
            </span>
            <span>
              Administrator Mode: Currently viewing <strong>{session.activeClientName}</strong> workspace in <strong>Read-Only Mode</strong>. Write operations are reserved for the client.
            </span>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition shadow-xs w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Admin Portal</span>
          </Link>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
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
    </div>
  );
}
