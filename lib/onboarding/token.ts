import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The onboarding token — the authorization to create a tenant.
 *
 * THE DECISION, stated once here because everything else follows from it:
 * tenant creation is NOT open self-serve. It is gated by a single-use,
 * time-limited token that Airawat issues out of band.
 *
 * Why not open self-serve. Provisioning writes a Tenant, its entitlements, its
 * configuration and its permanent address in one transaction. Left open, the
 * obvious costs are resource abuse and slug squatting — but the serious one is
 * impersonation. This platform's customers are named government bodies, and
 * their workspace address is the thing officers are taught to trust. Anyone
 * able to mint `<plausible-official-name>` has a phishing site with a real
 * certificate, a real login form and the product's own branding on it. No rate
 * limit fixes that; only "somebody at Airawat authorized this" does.
 *
 * Why not fully operator-gated. Collecting a request and provisioning by hand
 * makes the wizard theatre: eight steps that produce an email. The design's
 * claim is that the workspace is configured by the customer and live in days,
 * and that claim is worth keeping.
 *
 * So: the token. Government procurement already has an out-of-band contract
 * step; the token rides on that step rather than adding one. The customer then
 * self-serves everything the wizard actually asks about.
 *
 * WHAT MAKES IT A CONTROL RATHER THAN A SPEED BUMP
 *
 *   1. 256 bits from `randomBytes`. Not guessable, and the rate limiter in the
 *      route is there for the traffic, not for the entropy.
 *   2. Only the SHA-256 hash is stored. A database dump, a backup, or a log
 *      line does not yield a usable token. Plain SHA-256 rather than a password
 *      KDF is correct HERE and would not be for a password: the input is full
 *      entropy, so there is no dictionary to slow down.
 *   3. Lookup is by hash, so the comparison the database does is on a value an
 *      attacker cannot steer. `constantTimeEquals` is exported for the paths
 *      that compare in application code.
 *   4. Single use, consumed inside the provisioning transaction — see
 *      `provision.ts`. Two concurrent launches cannot both succeed.
 *   5. The TIER lives on the token, never in the request body. A customer
 *      cannot self-elevate by editing the payload; the wizard's module choices
 *      are intersected with this tier on the server.
 *
 * Issuing tokens belongs to the control plane (S4, out of scope). Until that
 * exists, `scripts/mint-onboarding-token.mjs` mints one from the command line.
 */

/** 32 bytes, base64url — 256 bits of entropy, 43 characters, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The stored form. Deterministic, so a lookup is an indexed equality search
 * rather than a scan-and-compare over every unconsumed row.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Shape check before touching the database — 43 base64url characters.
 *
 * This is not security (the hash lookup is), it is a cheap filter so that
 * obviously-malformed input costs a regex rather than a query, and so the rate
 * limiter's budget is spent on plausible attempts.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

/**
 * Length-safe constant-time comparison.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself leak the
 * length. Both sides are hashed to a fixed width first, so the comparison is
 * always over equal-length buffers and the function never throws.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Why a token cannot be used. Never distinguished to the caller — see below. */
export type TokenRejection = "unknown" | "expired" | "consumed" | "malformed";

export type TokenVerdict =
  | { ok: true; id: string; tier: string }
  | { ok: false; reason: TokenRejection };

/**
 * The single message every rejection produces.
 *
 * Deliberately identical for "no such token", "expired" and "already used". A
 * caller who can tell those apart has an oracle: feed candidate tokens and
 * learn which ones exist. The distinction is kept in `TokenVerdict.reason` for
 * server-side logging, and it stops there.
 */
export const TOKEN_REJECTED_MESSAGE =
  "That onboarding code is not valid. Check it with whoever sent it to you, or ask for a new one.";

/**
 * Decides a fetched row. Pure — the row comes from the caller, so this is
 * testable without a database and reusable inside a transaction.
 */
export function judgeToken(
  row: { id: string; tier: string; expiresAt: Date; consumedAt: Date | null } | null,
  now: Date,
): TokenVerdict {
  if (!row) return { ok: false, reason: "unknown" };
  if (row.consumedAt !== null) return { ok: false, reason: "consumed" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, id: row.id, tier: row.tier };
}
