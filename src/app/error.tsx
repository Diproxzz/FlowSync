"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-lg p-6 sm:p-8 text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-ink tracking-tight">
            Something unexpected occurred
          </h2>
          <p className="text-xs text-ink-3 leading-relaxed">
            The application encountered a temporary error. Please reload the page or return to sign-in.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-fg rounded-lg font-medium text-xs flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>

          <Link
            href="/login"
            className="w-full sm:w-auto px-4 py-2 bg-surface-2 text-ink border border-border rounded-lg font-medium text-xs flex items-center justify-center gap-2 hover:bg-surface-3 transition shadow-xs"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
