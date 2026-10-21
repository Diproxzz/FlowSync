"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter your username");
      return;
    }
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
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "Invalid credentials");
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
    <div className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-pop p-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="FlowSync"
            className="w-20 h-20 object-contain drop-shadow-sm"
          />
        </div>
        <h1 className="text-xl font-bold text-ink tracking-tight">FlowSync</h1>
        <p className="text-xs text-ink-3 mt-1">Single-owner GST Invoice & Stock Intelligence</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-xs text-danger font-medium flex items-start gap-2">
            <span className="font-bold text-sm leading-none mt-0.5">✕</span>
            <span className="flex-1 leading-snug">{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-ink-2 mb-1.5" htmlFor="username">
            Username
          </label>
          <div className="relative">
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              autoFocus
              placeholder="who.is.this?"
              autoComplete="username"
              className="w-full px-3 py-2 text-sm bg-surface border border-border-strong rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
          </div>
        </div>

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
              placeholder="Enter password"
              autoComplete="current-password"
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
        <p className="text-[11px] text-ink-3">Mandatory login to view and operate FlowSync</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 text-center text-xs text-ink-3">
            Loading authentication...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
