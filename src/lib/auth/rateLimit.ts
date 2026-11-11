import { prisma } from "@/lib/db";

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const MAX_MAP_SIZE = 2000;

// Limit: 5 failed attempts per 5 minutes
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

function pruneExpiredMemoryEntries(now: number) {
  if (rateLimitStore.size < MAX_MAP_SIZE / 2) {
    // Occasional lightweight cleanup even below cap
    if (rateLimitStore.size === 0) return;
  }
  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  });
  if (rateLimitStore.size >= MAX_MAP_SIZE) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (oldestKey) rateLimitStore.delete(oldestKey);
  }
}

export function getClientIp(request: {
  ip?: string;
  headers: { get(name: string): string | null };
}): string {
  if (request.ip && request.ip.trim()) {
    return request.ip.trim().toLowerCase();
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp.toLowerCase();
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1].toLowerCase();
    }
  }
  return "127.0.0.1";
}

export function checkLoginRateLimit(
  key: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const now = Date.now();
  pruneExpiredMemoryEntries(now);
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { attempts: 0, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts };
  }

  if (entry.attempts >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return { allowed: true, remaining: maxAttempts - entry.attempts };
}

export function recordFailedLogin(
  key: string,
  windowMs: number = DEFAULT_WINDOW_MS
) {
  const now = Date.now();
  pruneExpiredMemoryEntries(now);
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { attempts: 1, resetAt: now + windowMs });
  } else {
    entry.attempts++;
  }
}

export function resetLoginRateLimit(key: string) {
  rateLimitStore.delete(key);
}

/**
 * Persistent PostgreSQL-backed rate limit checks (survives serverless restarts & multi-worker instances).
 * Falls back to in-memory limiter cleanly if DB table isn't accessible in isolated unit tests.
 */
export async function checkRateLimitAsync(
  key: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  windowMs: number = DEFAULT_WINDOW_MS
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }> {
  try {
    const now = new Date();
    const record = await prisma.rateLimit.findUnique({ where: { key } });

    if (!record || now > record.reset_at) {
      const nextReset = new Date(now.getTime() + windowMs);
      await prisma.rateLimit.upsert({
        where: { key },
        update: { attempts: 0, reset_at: nextReset },
        create: { key, attempts: 0, reset_at: nextReset },
      });
      return { allowed: true, remaining: maxAttempts };
    }

    if (record.attempts >= maxAttempts) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((record.reset_at.getTime() - now.getTime()) / 1000)
      );
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    return { allowed: true, remaining: maxAttempts - record.attempts };
  } catch {
    return checkLoginRateLimit(key, maxAttempts, windowMs);
  }
}

export async function recordFailedAttemptAsync(
  key: string,
  windowMs: number = DEFAULT_WINDOW_MS
): Promise<void> {
  try {
    const now = new Date();
    const existing = await prisma.rateLimit.findUnique({ where: { key } });
    if (!existing || now > existing.reset_at) {
      await prisma.rateLimit.upsert({
        where: { key },
        update: { attempts: 1, reset_at: new Date(now.getTime() + windowMs) },
        create: { key, attempts: 1, reset_at: new Date(now.getTime() + windowMs) },
      });
    } else {
      await prisma.rateLimit.update({
        where: { key },
        data: { attempts: { increment: 1 } },
      });
    }
  } catch {
    recordFailedLogin(key, windowMs);
  }
}

export async function resetRateLimitAsync(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch {
    // ignore DB errors and reset memory copy
  }
  resetLoginRateLimit(key);
}
