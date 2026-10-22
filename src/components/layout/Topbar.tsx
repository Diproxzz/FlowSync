"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, ChevronRight, ShieldCheck, Eye, ArrowLeft, ShieldAlert } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useSidebar } from "./SidebarContext";

interface TopbarProps {
  title?: string;
}

interface SessionData {
  username: string;
  role: "ADMIN" | "CLIENT";
  clientId: string;
  clientName: string;
  activeClientId: string;
  activeClientName: string;
  isReadOnly: boolean;
  isAdmin: boolean;
}

export function Topbar({ title }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionData | null>(null);
  const {
    isOpen,
    isPinned,
    setIsOpen,
    handleMouseEnter,
    handleMouseLeave,
  } = useSidebar();

  const isAdminPortal = pathname === "/admin" || pathname.startsWith("/admin");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setSession(data.data);
      })
      .catch(() => {});
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
      router.push("/login");
    }
  };

  const handleReturnToAdmin = async () => {
    try {
      await fetch("/api/admin/switch-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnToAdmin: true }),
      });
    } catch {}
    router.push("/admin");
    router.refresh();
  };

  return (
    <header className="h-14 bg-surface border-b border-border px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 transition-all">
      <div className="flex items-center gap-3">
        {/* On Administrator Portal: show clean title without sidebar toggle */}
        {isAdminPortal ? (
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="FlowSync"
              className="h-7 w-auto object-contain"
            />
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-ink tracking-tight">FlowSync</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                Administrator
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Brand Logo Trigger (visible when sidebar is unpinned/collapsed in client portal) */}
            {!isPinned && (
              <div
                className="flex items-center gap-2.5 cursor-pointer py-1 px-1.5 -ml-1 sm:-ml-2 rounded-md hover:bg-surface-2 transition group select-none"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={() => setIsOpen(!isOpen)}
                title="Hover over logo to open navigation"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="FlowSync"
                  className="h-7 w-auto object-contain group-hover:scale-105 transition"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-xs leading-tight text-ink tracking-tight flex items-center gap-1">
                    FlowSync
                    <ChevronRight className="w-3 h-3 text-ink-3 group-hover:translate-x-0.5 transition" />
                  </span>
                  <span className="text-[9px] text-ink-3 uppercase tracking-wider font-mono">Menu</span>
                </div>
              </div>
            )}

            {!isPinned && <div className="h-4 w-px bg-border" />}

            <h1 className="text-sm font-semibold text-ink">{title || "FlowSync"}</h1>
          </>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* If Admin is in client portal, provide prominent Back to Admin Page button */}
        {session?.isAdmin && !isAdminPortal && (
          <button
            type="button"
            onClick={handleReturnToAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Redirect back to Administrator page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Admin Page</span>
          </button>
        )}

        {/* Active Profile indicator */}
        {session?.isAdmin ? (
          session.isReadOnly ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs border border-amber-500/20 font-medium">
              <Eye className="w-3.5 h-3.5 text-amber-600" />
              <span>{session.activeClientName || "Indobest"}</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 font-mono font-semibold">
                Read-Only
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs border border-purple-500/20 font-semibold">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Administrator</span>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-sm bg-surface-2 text-ink-2 text-xs border border-border/60">
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active Profile" />
            <span className="font-semibold text-ink">{session?.clientName || "Indobest"}</span>
            <span className="hidden sm:inline text-border-strong">|</span>
            <span className="hidden sm:inline text-[11px] text-ink-3 font-mono">19AVZPC2361G1ZA</span>
          </div>
        )}

        <ThemeToggle />

        <button
          onClick={handleLogout}
          type="button"
          title="Sign out of profile"
          aria-label="Sign out of profile"
          className="h-8 px-2.5 flex items-center gap-1.5 rounded-sm text-xs text-ink-2 hover:text-danger hover:bg-surface-2 transition border border-transparent hover:border-danger/20 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-medium">Sign out</span>
        </button>
      </div>
    </header>
  );
}
