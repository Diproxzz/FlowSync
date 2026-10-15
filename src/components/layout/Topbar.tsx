"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

interface TopbarProps {
  title?: string;
}

export function Topbar({ title }: TopbarProps) {
  const router = useRouter();

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
    <header className="h-14 bg-surface border-b border-border px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
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
