import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MODULE_CATALOG, type ModuleTier } from "@/lib/entitlements/catalog";
import { PLANS } from "@/lib/platform/landing";
import {
  emptyDraft,
  RESERVED_SLUGS,
  slugify,
  validateDraft,
  type OnboardingDraft,
} from "@/lib/onboarding/draft";
import {
  constantTimeEquals,
  generateToken,
  hashToken,
  judgeToken,
  looksLikeToken,
} from "@/lib/onboarding/token";
import { tiersReachedBy } from "@/lib/onboarding/provision";
import { clientKey, rateLimit, resetRateLimits } from "@/lib/onboarding/rate-limit";

/**
 * S2 — onboarding.
 *
 * The wizard's screens are checked by the accessibility leg and by eye. What is
 * tested here is the part that decides whether a stranger on the public internet
 * gets to create an organization, and the part that decides what that
 * organization is allowed to have. Both are pure enough to test without a
 * database, which is the reason they were written as pure functions.
 */

function draftWith(patch: Partial<OnboardingDraft>): OnboardingDraft {
  return { ...emptyDraft(), orgName: "Suryapur Development Authority", slug: "suryapur", ...patch };
}

describe("onboarding tokens", () => {
  it("generates 256 bits, URL-safe, of the shape the endpoints accept", () => {
    for (let i = 0; i < 20; i += 1) {
      const token = generateToken();
      expect(token).toHaveLength(43);
      expect(looksLikeToken(token), token).toBe(true);
    }
  });

  it("never generates the same token twice", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(seen.size).toBe(500);
  });

  it("hashes deterministically, and the hash is not the token", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toContain(token);
  });

  it("rejects anything that is not exactly a token", () => {
    for (const bad of [
      "",
      "short",
      `${generateToken()}x`, // one character too long
      generateToken().slice(0, 42), // one too short
      `${generateToken().slice(0, 42)}+`, // base64, not base64url
      "../../etc/passwd",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(looksLikeToken(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("compares without throwing on mismatched lengths", () => {
    // `timingSafeEqual` throws when the buffers differ in length, and the throw
    // would itself be a length oracle. Both sides are hashed first.
    expect(constantTimeEquals("a", "a-much-longer-value")).toBe(false);
    expect(constantTimeEquals("same", "same")).toBe(true);
  });
});

describe("judging a token row", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const future = new Date("2026-09-15T12:00:00Z");
  const past = new Date("2026-08-01T12:00:00Z");

  it("accepts an unconsumed, unexpired row", () => {
    const verdict = judgeToken({ id: "t1", tier: "standard", expiresAt: future, consumedAt: null }, now);
    expect(verdict).toEqual({ ok: true, id: "t1", tier: "standard" });
  });

  it("refuses a missing row", () => {
    expect(judgeToken(null, now)).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuses a spent row, even if it has not expired", () => {
    const verdict = judgeToken({ id: "t1", tier: "standard", expiresAt: future, consumedAt: past }, now);
    expect(verdict).toEqual({ ok: false, reason: "consumed" });
  });

  it("refuses an expired row", () => {
    const verdict = judgeToken({ id: "t1", tier: "standard", expiresAt: past, consumedAt: null }, now);
    expect(verdict).toEqual({ ok: false, reason: "expired" });
  });

  it("treats the expiry instant itself as expired", () => {
    const verdict = judgeToken({ id: "t1", tier: "standard", expiresAt: now, consumedAt: null }, now);
    expect(verdict.ok).toBe(false);
  });

  it("checks consumption before expiry, so a spent token never reads as merely stale", () => {
    // Both are rejections and the API collapses them into one message, so this
    // only matters for what gets logged — but a log saying "expired" about a
    // token somebody actually used would send an investigation the wrong way.
    const verdict = judgeToken({ id: "t1", tier: "standard", expiresAt: past, consumedAt: past }, now);
    expect(verdict).toEqual({ ok: false, reason: "consumed" });
  });
});

describe("the tier ceiling", () => {
  it("reaches its own tier and everything below it", () => {
    expect(tiersReachedBy("core")).toEqual(["core"]);
    expect(tiersReachedBy("standard")).toEqual(["core", "standard"]);
    expect(tiersReachedBy("premium")).toEqual(["core", "standard", "premium"]);
  });

  it("falls back to the lowest tier for an unrecognised value", () => {
    // Fails closed: an unexpected tier string grants the least, never the most.
    expect(tiersReachedBy("enterprise-plus" as ModuleTier)).toEqual(["core"]);
  });

  it("agrees with the plan table the pricing page renders", () => {
    // If these drifted, a customer would be sold one plan and provisioned
    // another — the pricing page and the provisioner are two readings of one
    // commercial decision.
    const cumulative: ModuleTier[] = [];
    for (const plan of PLANS) {
      cumulative.push(...plan.adds);
      const top = plan.adds[plan.adds.length - 1];
      const reached = tiersReachedBy(top);
      for (const tier of cumulative) {
        expect(reached.includes(tier), `${plan.name} sells ${tier}, ceiling does not reach it`).toBe(true);
      }
    }
  });

  it("covers every tier the catalog actually uses", () => {
    const used = new Set(MODULE_CATALOG.map((m) => m.tier).filter((t): t is ModuleTier => t !== null));
    const reachable = new Set(tiersReachedBy("addon"));
    for (const tier of used) {
      expect(reachable.has(tier), `no token tier reaches "${tier}"`).toBe(true);
    }
  });
});

describe("draft validation", () => {
  it("accepts a complete, ordinary draft", () => {
    expect(validateDraft(draftWith({}))).toBeNull();
  });

  it("requires a real organization name", () => {
    expect(validateDraft(draftWith({ orgName: "" }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ orgName: "A" }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ orgName: "x".repeat(121) }))?.kind).toBe("field");
  });

  it("enforces the slug shape", () => {
    for (const bad of [
      "",
      "ab", // too short
      "-leading",
      "trailing-",
      "Upper",
      "has space",
      "has_underscore",
      "a".repeat(33),
      "../etc",
      "a.b",
    ]) {
      const rejection = validateDraft(draftWith({ slug: bad }));
      expect(rejection?.kind, `"${bad}" was accepted`).toBe("slug");
    }
    for (const good of ["abc", "suryapur", "a-b", "hudd-odisha-2026", "a".repeat(32)]) {
      expect(validateDraft(draftWith({ slug: good })), good).toBeNull();
    }
  });

  it("refuses reserved addresses", () => {
    // Two different harms in one list: colliding with the platform's own routes,
    // and reading as the vendor or as an official channel.
    for (const reserved of ["api", "login", "admin", "airawat", "official", "www"]) {
      expect(RESERVED_SLUGS.has(reserved), reserved).toBe(true);
      expect(validateDraft(draftWith({ slug: reserved }))).toEqual({ kind: "slug", detail: "reserved" });
    }
  });

  it("bounds the invitation list and validates every address in it", () => {
    expect(validateDraft(draftWith({ invites: [{ email: "not-an-email", role: "Viewer" }] }))?.kind).toBe(
      "field",
    );
    const tooMany = Array.from({ length: 51 }, (_, i) => ({ email: `p${i}@example.test`, role: "Viewer" }));
    expect(validateDraft(draftWith({ invites: tooMany }))?.kind).toBe("field");
    const fine = Array.from({ length: 50 }, (_, i) => ({ email: `p${i}@example.test`, role: "Viewer" }));
    expect(validateDraft(draftWith({ invites: fine }))).toBeNull();
  });

  it("requires an endpoint only when the visitor is self-hosting", () => {
    expect(validateDraft(draftWith({ aiMode: "managed", aiEndpoint: "" }))).toBeNull();
    expect(validateDraft(draftWith({ aiMode: "selfhost", aiEndpoint: "" }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ aiMode: "selfhost", aiEndpoint: "not a url" }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ aiMode: "selfhost", aiEndpoint: "https://llm.internal" }))).toBeNull();
  });

  it("rejects values outside each closed set", () => {
    expect(validateDraft(draftWith({ sector: "other" as never }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ numberFormat: "uk" as never }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ fiscalStart: "sep" as never }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ starterData: "demo" as never }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ aiMode: "hybrid" as never }))?.kind).toBe("field");
    expect(validateDraft(draftWith({ brandColor: "rebeccapurple" }))?.kind).toBe("field");
  });
});

describe("slugify", () => {
  it("produces a slug the validator accepts, from ordinary names", () => {
    for (const name of [
      "Suryapur Development Authority",
      "Housing & Urban Development Dept.",
      "  Leading and trailing  ",
      "Numbers 2026 in the middle",
    ]) {
      const slug = slugify(name);
      expect(validateDraft(draftWith({ slug })), `${name} → ${slug}`).toBeNull();
    }
  });

  it("never leaves a trailing hyphen, including after truncation", () => {
    // 32 characters landing mid-word used to leave "…-", which the shape rejects.
    const slug = slugify("Municipal Corporation of Greater Metropolitan Region");
    expect(slug.endsWith("-")).toBe(false);
    expect(validateDraft(draftWith({ slug }))).toBeNull();
  });
});

describe("the rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit and refuses past it", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit("k", 5, 1000, 0).allowed, `attempt ${i + 1}`).toBe(true);
    }
    const refused = rateLimit("k", 5, 1000, 0);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate budgets per key", () => {
    for (let i = 0; i < 5; i += 1) rateLimit("a", 5, 1000, 0);
    expect(rateLimit("a", 5, 1000, 0).allowed).toBe(false);
    expect(rateLimit("b", 5, 1000, 0).allowed).toBe(true);
  });

  it("resets once the window passes", () => {
    for (let i = 0; i < 5; i += 1) rateLimit("k", 5, 1000, 0);
    expect(rateLimit("k", 5, 1000, 0).allowed).toBe(false);
    expect(rateLimit("k", 5, 1000, 1001).allowed).toBe(true);
  });

  it("takes the first hop of x-forwarded-for, not the last", () => {
    // The last hop is the proxy. Keying on it would put every request in the
    // world into one bucket.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(clientKey(headers)).toBe("203.0.113.7");
  });

  it("shares one bucket for unattributable traffic rather than granting many", () => {
    expect(clientKey(new Headers())).toBe("unknown");
    expect(clientKey(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("secrets never enter the persisted draft", () => {
  const wizard = readFileSync(join(process.cwd(), "app", "onboarding", "OnboardingWizard.tsx"), "utf8");

  it("has no field on the draft type that could hold a credential", () => {
    // The type is the guarantee: the draft is what gets JSON-stringified into
    // localStorage, so a key that cannot exist on it cannot be written there.
    const draft = emptyDraft() as Record<string, unknown>;
    for (const key of Object.keys(draft)) {
      expect(key.toLowerCase(), `draft carries a field named "${key}"`).not.toMatch(/key|secret|token|password/);
    }
  });

  it("persists only the draft, the step and the furthest step", () => {
    // A blunt source check, because the failure it guards against — someone
    // adding `aiKey` to the persisted object — is a one-line edit that nothing
    // else would notice.
    const persisted = wizard.match(/JSON\.stringify\(\s*\{([^}]*)\}/);
    expect(persisted, "the persist call has changed shape; re-check what it writes").not.toBeNull();
    const fields = persisted![1];
    expect(fields).toContain("draft");
    expect(fields).not.toMatch(/aiKey|token|grant/);
  });

  it("keeps the API key and the onboarding code in component state only", () => {
    expect(wizard).toMatch(/const \[aiKey, setAiKey\] = useState\(""\)/);
    expect(wizard).toMatch(/const \[grant, setGrant\] = useState<CodeGrant \| null>\(null\)/);
  });
});
