import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { MODULE_CATALOG } from "@/lib/entitlements/catalog";
import { hashToken, judgeToken, looksLikeToken, TOKEN_REJECTED_MESSAGE } from "@/lib/onboarding/token";
import { tiersReachedBy } from "@/lib/onboarding/provision";
import { clientKey, rateLimit } from "@/lib/onboarding/rate-limit";

/**
 * POST /api/onboarding/check — is this onboarding code usable, and what does it
 * authorize?
 *
 * Unauthenticated by design: it is the first thing a visitor with a code does,
 * before any account exists. It is one of two endpoints in this application
 * reachable without a session (the other is provisioning), and
 * `scripts/check-api-guards.mjs` names both explicitly so a third cannot appear
 * without someone deciding it should.
 *
 * It exists so the wizard can tell the visitor at step one that their code is
 * good and which modules it reaches, rather than letting them fill in eight
 * steps and fail at the end. That convenience is also the only thing it leaks,
 * and the leak is bounded on purpose:
 *
 *   - a valid code returns its TIER and the module codes that tier reaches —
 *     all of which are already published on the public pricing page;
 *   - an invalid code returns one message for every reason. "Expired", "already
 *     used" and "no such code" are indistinguishable to the caller, because a
 *     caller who could tell them apart would have an oracle for which codes
 *     exist. The reason is logged server-side and stops there.
 *
 * It never consumes anything. Checking a code is idempotent; only provisioning
 * spends it.
 */
export const runtime = "nodejs";

/** Generous for a person typing a code, useless for a script farming responses. */
const LIMIT = 10;
const WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const verdict = rateLimit(`onboarding-check:${clientKey(request.headers)}`, LIMIT, WINDOW_MS);
  if (!verdict.allowed) {
    return NextResponse.json(
      { valid: false, detail: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, detail: TOKEN_REJECTED_MESSAGE }, { status: 400 });
  }

  const token = (body as { token?: unknown } | null)?.token;
  if (!looksLikeToken(token)) {
    // Same message as a wrong code: the shape of a valid code is not a secret,
    // but there is no reason to help someone narrow their guesses either.
    return NextResponse.json({ valid: false, detail: TOKEN_REJECTED_MESSAGE }, { status: 400 });
  }

  const row = await prismaUnscoped.onboardingToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, tier: true, expiresAt: true, consumedAt: true },
  });

  const judged = judgeToken(row, new Date());
  if (!judged.ok) {
    console.warn(`[onboarding] code rejected: ${judged.reason}`);
    return NextResponse.json({ valid: false, detail: TOKEN_REJECTED_MESSAGE }, { status: 400 });
  }

  const reachable = tiersReachedBy(judged.tier as never);
  const modules = MODULE_CATALOG.filter(
    (m) => m.enforcement === "gated" && m.tier !== null && reachable.includes(m.tier),
  ).map((m) => m.code);

  return NextResponse.json({ valid: true, tier: judged.tier, modules });
}
