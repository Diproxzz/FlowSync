"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [accountUsername, setAccountUsername] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!token.trim()) {
        if (active) {
          setTokenValid(false);
          setTokenError("Missing password reset token.");
          setChecking(false);
        }
        return;
      }

      try {
        const res = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token.trim())}`
        );
        const data = await res.json();
        if (!active) return;

        if (!res.ok || !data.valid) {
          setTokenValid(false);
          setTokenError(
            data.error?.message ||
              "This password reset link is invalid or has expired."
          );
        } else {
          setTokenValid(true);
          setAccountUsername(data.displayName || data.username || "");
          setMaskedEmail(data.maskedEmail || null);
        }
      } catch {
        if (active) {
          setTokenValid(false);
          setTokenError("Failed to validate password reset token.");
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    verify();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (newPassword.length < 8) {
      setSubmitError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error?.message || "Failed to update password.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setSubmitting(false);
    } catch {
      setSubmitError("Failed to connect to server. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-pop p-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="FlowPilot"
            className="h-14 w-auto object-contain drop-shadow-sm"
          />
        </div>
        <h1 className="text-xl font-bold text-ink tracking-tight">
          Reset Password
        </h1>
        <p className="text-xs text-ink-3 mt-1">FlowPilot Credential Recovery</p>
      </div>

      {checking ? (
        <div className="py-8 text-center text-xs text-ink-3 space-y-2">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Validating reset link...</p>
        </div>
      ) : success ? (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-xs text-emerald-700 dark:text-emerald-400 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Password Updated</span>
            </div>
            <p className="leading-snug">
              Your password for <strong>{accountUsername}</strong> has been
              reset. You can now sign in with your new credentials.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="w-full h-10 bg-primary text-primary-fg rounded-sm font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to Sign In</span>
          </button>
        </div>
      ) : !tokenValid ? (
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-md text-xs text-danger space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Link Invalid or Expired</span>
            </div>
            <p className="leading-snug">{tokenError}</p>
          </div>
          <Link
            href="/login"
            className="w-full h-10 border border-border bg-surface hover:bg-surface-2 text-ink rounded-sm font-medium text-sm flex items-center justify-center gap-2 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Sign In</span>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-surface-2 border border-border rounded-md text-xs space-y-0.5">
            <div className="text-ink-2">
              Profile: <strong className="text-ink">{accountUsername}</strong>
            </div>
            {maskedEmail && (
              <div className="text-[11px] text-ink-3 font-mono">
                Recovery: {maskedEmail}
              </div>
            )}
          </div>

          {submitError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-xs text-danger font-medium">
              {submitError}
            </div>
          )}

          <div>
            <label
              className="block text-xs font-medium text-ink-2 mb-1.5"
              htmlFor="new-password"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
                autoFocus
                minLength={8}
                required
                placeholder="At least 8 characters"
                autoComplete="new-password"
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

          <div>
            <label
              className="block text-xs font-medium text-ink-2 mb-1.5"
              htmlFor="confirm-password"
            >
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              minLength={8}
              required
              placeholder="Re-enter new password"
              autoComplete="new-password"
              className="w-full px-3 py-2 text-sm bg-surface border border-border-strong rounded-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 bg-primary text-primary-fg rounded-sm font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-primary-fg border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Update Password</span>
              </>
            )}
          </button>

          <Link
            href="/login"
            className="w-full h-9 border border-border bg-surface hover:bg-surface-2 text-ink-2 hover:text-ink rounded-sm font-medium text-xs flex items-center justify-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 text-center text-xs text-ink-3">
            Loading password recovery...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
