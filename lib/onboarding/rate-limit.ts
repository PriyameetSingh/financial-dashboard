/**
 * A fixed-window rate limiter for the unauthenticated onboarding endpoints.
 *
 * WHAT IT IS FOR, precisely. Not for stopping token guessing — the tokens carry
 * 256 bits of entropy, so guessing is not a threat model, it is arithmetic. It
 * is for the things volume alone can do: hammering the token endpoint to farm
 * timing or error differences, and hammering provisioning to burn database
 * connections on an endpoint no session is required to reach.
 *
 * WHAT IT IS NOT. In-memory, so it is per-process: behind several instances
 * each gets its own budget, and a restart clears it. That is a real limitation
 * and it is stated rather than papered over — the control that actually gates
 * tenant creation is the token, and this is defence in depth on top of it. When
 * the deployment grows past one instance, this should move to shared storage;
 * until then a per-process bucket is honest and costs nothing.
 *
 * The key is the client IP as the reverse proxy reports it. That is spoofable
 * by anyone who can reach the app directly rather than through nginx, which is
 * another reason this is not the primary control.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Bounds memory: an attacker cycling source addresses cannot grow this forever. */
const MAX_BUCKETS = 10_000;

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the window resets. For the `Retry-After` header. */
  retryAfter: number;
};

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitVerdict {
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) evictExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

function evictExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still full: every bucket is live, so drop the oldest quarter rather than
  // refusing to serve. Under that much pressure the limiter is already the
  // wrong tool, and failing open here is safe because the token is the gate.
  if (buckets.size >= MAX_BUCKETS) {
    const keys = [...buckets.keys()].slice(0, Math.floor(MAX_BUCKETS / 4));
    for (const key of keys) buckets.delete(key);
  }
}

/** Test seam. Never called by the application. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * The client address, as the reverse proxy reports it.
 *
 * The FIRST entry of `x-forwarded-for` is the original client; later entries
 * are proxies. Anything unparseable becomes one shared bucket, which is the
 * conservative direction — unattributable traffic shares one budget rather than
 * getting an unlimited one each.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
