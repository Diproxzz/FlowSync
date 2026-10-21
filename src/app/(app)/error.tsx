"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error securely to console without dumping raw code/stack on user screen
    console.error("Application error captured by boundary:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 sm:p-8 text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Something unexpected occurred
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We ran into a temporary issue loading this section. Your business data is safe. Please try refreshing or returning to the dashboard.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-xs flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>

          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-4 py-2 bg-muted text-foreground border border-border rounded-lg font-medium text-xs flex items-center justify-center gap-2 hover:bg-muted/80 active:scale-[0.99] transition shadow-xs"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
