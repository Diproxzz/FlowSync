interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Limit: 5 failed attempts per 5 minutes per IP
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

export function checkLoginRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { attempts: 0, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - entry.attempts };
}

export function recordFailedLogin(ip: string) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { attempts: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.attempts++;
  }
}

export function resetLoginRateLimit(ip: string) {
  rateLimitStore.delete(ip);
}
