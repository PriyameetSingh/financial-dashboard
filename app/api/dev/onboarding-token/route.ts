import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG } from "@/lib/entitlements/catalog";
import { tiersReachedBy } from "@/lib/entitlements/plan";
import { generateToken, hashToken } from "@/lib/onboarding/token";

/**
 * DEV-ONLY — mint a real, usable onboarding token, so the CodeGate can be
 * skipped locally without hand-running `scripts/mint-onboarding-token.mjs`
 * and pasting a 43-character string.
 *
 * This does NOT weaken `lib/onboarding/token.ts`'s control. It mints exactly
 * the row `mint-onboarding-token.mjs` would, through the same hash-only
 * storage, and the wizard still spends it through the ordinary
 * check → provision path — nothing downstream of the CodeGate learns this
 * token came from a shortcut instead of an email. It exists only because
 * early-stage local development re-runs onboarding often enough that typing
 * a code every time is pure friction, not a security boundary worth keeping
 * in dev's way.
 *
 * Dead code unless BOTH conditions hold, same gate as
 * `app/api/dev/session/route.ts`:
 *
 *   NODE_ENV !== "production"     AND     DEV_AUTH_ENABLED === "1"
 *
 * 404, not 403, so the endpoint is not discoverable in a deployed environment.
 */
export const runtime = "nodejs";

const DEV_TIER = "addon";
const EXPIRES_MS = 60 * 60 * 1000;

function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "1";
}

export async function POST() {
  if (!devAuthEnabled()) {
    return NextResponse.json({ detail: "Not Found" }, { status: 404 });
  }

  const token = generateToken();
  await prisma.onboardingToken.create({
    data: {
      tokenHash: hashToken(token),
      tier: DEV_TIER,
      label: "dev shortcut",
      expiresAt: new Date(Date.now() + EXPIRES_MS),
    },
  });

  const reachable = tiersReachedBy(DEV_TIER);
  const modules = MODULE_CATALOG.filter(
    (m) => m.enforcement === "gated" && m.tier !== null && reachable.includes(m.tier),
  ).map((m) => m.code);

  return NextResponse.json({ valid: true, token, tier: DEV_TIER, modules });
}
