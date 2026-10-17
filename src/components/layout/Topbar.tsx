"use client";

import { useRouter } from "next/navigation";
import { LogOut, ChevronRight } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useSidebar } from "./SidebarContext";

interface TopbarProps {
  title?: string;
}

export function Topbar({ title }: TopbarProps) {
  const router = useRouter();
  const {
    isOpen,
    isPinned,
    setIsOpen,
    handleMouseEnter,
    handleMouseLeave,
  } = useSidebar();

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

  return (
    <header className="h-14 bg-surface border-b border-border px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 transition-all">
      <div className="flex items-center gap-3">
        {/* Brand Logo Trigger (visible when sidebar is unpinned/collapsed) */}
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
              src="/logo.jpg"
              alt="Indobest"
              className="w-8 h-8 object-contain rounded-sm border border-border shadow-xs bg-[#fbf9f5] group-hover:scale-105 transition"
            />
            <div className="flex flex-col">
              <span className="font-bold text-xs leading-tight text-ink tracking-tight flex items-center gap-1">
                Indobest
                <ChevronRight className="w-3 h-3 text-ink-3 group-hover:translate-x-0.5 transition" />
              </span>
              <span className="text-[9px] text-ink-3 uppercase tracking-wider font-mono">Menu</span>
            </div>
          </div>
        )}

        {!isPinned && <div className="h-4 w-px bg-border" />}

        <h1 className="text-sm font-semibold text-ink">{title || "Indobest Insights"}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-sm bg-surface-2 text-ink-2 text-xs font-mono">
          <span>INDOBEST</span>
          <span className="text-border-strong">|</span>
          <span className="text-[11px] text-ink-3">19AVZPC2361G1ZA</span>
        </div>

        <ThemeToggle />

        <button
          onClick={handleLogout}
          type="button"
          title="Sign out"
          aria-label="Sign out"
          className="w-8 h-8 flex items-center justify-center rounded-sm text-ink-2 hover:text-danger hover:bg-surface-2 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
