"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  ArrowRight,
  KeyRound,
  Mail,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"login" | "reset">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetMaskedEmail, setResetMaskedEmail] = useState<string | null>(null);

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

      const targetUrl =
        searchParams.get("next") || data.redirectUrl || "/dashboard";
      router.push(targetUrl);
      router.refresh();
    } catch {
      setError("Failed to connect to server. Please try again.");
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter your profile username first");
      return;
    }

    setLoading(true);
    setError(null);
    setResetMessage(null);
    setResetMaskedEmail(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error?.message || "Failed to send password reset email."
        );
        setLoading(false);
        return;
      }

      setResetMessage(
        data.message ||
          "If this profile has a recovery email configured, a password reset link has been sent."
      );
      if (data.maskedEmail) {
        setResetMaskedEmail(data.maskedEmail);
      }
      setLoading(false);
    } catch {
      setError("Failed to connect to server. Please try again.");
      setLoading(false);
    }
  };

  const switchToReset = () => {
    setError(null);
    setResetMessage(null);
    setResetMaskedEmail(null);
    setMode("reset");
  };

  const switchToLogin = () => {
    setError(null);
    setResetMessage(null);
    setResetMaskedEmail(null);
    setMode("login");
  };

  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-pop p-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="FlowPilot"
            className="h-16 w-auto object-contain drop-shadow-sm"
          />
        </div>
        <h1 className="text-xl font-bold text-ink tracking-tight">FlowPilot</h1>
        <p className="text-xs text-ink-3 mt-1">
          {mode === "login"
            ? "GST Invoice & Stock Intelligence"
            : "Reset your profile password via recovery email"}
        </p>
      </div>

      {mode === "login" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-xs text-danger font-medium flex items-start gap-2">
              <span className="font-bold text-sm leading-none mt-0.5">✕</span>
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          <div>
            <label
              className="block text-xs font-medium text-ink-2 mb-1.5"
              htmlFor="username"
            >
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
            <label
              className="block text-xs font-medium text-ink-2 mb-1.5"
              htmlFor="password"
            >
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
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
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

          <button
            type="button"
            onClick={switchToReset}
            disabled={loading}
            className="w-full h-9 border border-border bg-surface hover:bg-surface-2 text-ink-2 hover:text-ink rounded-sm font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Reset Password</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleForgotPassword} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-xs text-danger font-medium flex items-start gap-2">
              <span className="font-bold text-sm leading-none mt-0.5">✕</span>
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {resetMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-xs text-emerald-700 dark:text-emerald-400 font-medium space-y-1">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1 leading-snug">{resetMessage}</span>
              </div>
              {resetMaskedEmail && (
                <div className="pl-6 text-[11px] font-mono opacity-90">
                  Recovery Email: {resetMaskedEmail}
                </div>
              )}
            </div>
          )}

          <div>
            <label
              className="block text-xs font-medium text-ink-2 mb-1.5"
              htmlFor="reset-username"
            >
              Profile Username
            </label>
            <input
              id="reset-username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              autoFocus
              placeholder="Enter profile username"
              autoComplete="username"
              className="w-full px-3 py-2 text-sm bg-surface border border-border-strong rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
            <p className="text-[11px] text-ink-3 mt-1.5 leading-snug">
              A secure one-time reset link will be dispatched to the masked recovery email registered for this profile.
            </p>
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
                <Mail className="w-4 h-4" />
                <span>Send Reset Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={switchToLogin}
            disabled={loading}
            className="w-full h-9 border border-border bg-surface hover:bg-surface-2 text-ink-2 hover:text-ink rounded-sm font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </button>
        </form>
      )}
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
