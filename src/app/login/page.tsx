"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Invalid password");
        setLoading(false);
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError("Failed to connect to server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-pop p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-primary-soft text-primary mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-ink tracking-tight">Indobest Insights</h1>
          <p className="text-xs text-ink-3 mt-1">Single-owner GST Invoice & Stock Intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                autoFocus
                placeholder="Enter password"
                className="w-full px-3 py-2 pr-10 text-sm bg-surface border border-border-strong rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <p className="text-xs text-danger mt-1.5 flex items-center gap-1 font-medium">
                <span>✕</span> {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-primary text-primary-fg rounded-sm font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary-fg border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-border text-center">
          <p className="text-[11px] text-ink-3">Protected Single-User Environment · Indobest Kolkata</p>
        </div>
      </div>
    </div>
  );
}
