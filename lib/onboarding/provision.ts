import { prismaUnscoped } from "@/lib/prisma";
import { MODULE_CATALOG, type ModuleTier } from "@/lib/entitlements/catalog";
import { resolveGrants, tiersReachedBy } from "@/lib/entitlements/plan";
import { validateConfigValue } from "@/lib/tenant-config/registry";
import { hashToken, judgeToken, looksLikeToken } from "./token";
import {
  RESERVED_SLUGS,
  type OnboardingDraft,
  type ProvisionRejection,
  validateDraft,
} from "./draft";

/**
 * Provisioning — the one privileged write the onboarding wizard performs.
 *
 * Everything before the last step is a draft in the visitor's browser. This is
 * the moment a Tenant exists, and it is the only moment, so all of it happens
 * inside one transaction: consume the token, create the tenant, write its
 * entitlements, write its configuration. Any failure and none of it happened.
 *
 * WHY THE UNSCOPED CLIENT. The Prisma chokepoint scopes every tenant-scoped
 * write to the request's resolved tenant. There is no resolved tenant here —
 * that is the whole point, the tenant does not exist yet — so the chokepoint
 * would correctly refuse. `prismaUnscoped` is the sanctioned escape, and the
 * safety argument is different in kind from the usual one: this code never
 * READS across tenants and never writes to an existing tenant. It writes rows
 * whose `tenantId` is one it minted itself, microseconds earlier, inside the
 * same transaction. There is no other tenant it could reach.
 *
 * WHAT IT DOES NOT DO, and why
 *
 *   - It creates no users. Inviting real people needs an identity provider and
 *     is gated behind D1; the wizard's People step collects the list and this
 *     records it as a pending request. A workspace with no administrators is
 *     the honest state until D1 lands, and it is visible as such.
 *   - It seeds no sample portfolio. The starter-data choice is recorded; the
 *     seeder is not built. `empty` is fully implemented — and an empty
 *     workspace is a working workspace.
 *
 * Both are stubs with names, not silent omissions: `provisionResult.pending`
 * lists them and the wizard's launch screen says so.
 */

/**
 * Re-exported so the onboarding endpoints have one import site. The ceiling
 * itself lives in `lib/entitlements/plan.ts`, shared with the menu-card
 * configurator — the two must never be able to disagree about what a tier
 * reaches.
 */
export { tiersReachedBy };

export type ProvisionInput = {
  token: string;
  draft: OnboardingDraft;
  /** Collected separately from the draft — see `route.ts`. Never persisted raw. */
  llmApiKey?: string;
};

export type ProvisionResult = {
  tenantId: string;
  slug: string;
  name: string;
  /** Module codes actually enabled, after the tier ceiling was applied. */
  enabledModules: readonly string[];
  /**
   * Modules the visitor asked for that their tier does not reach. Reported so
   * the launch screen can say what was dropped rather than quietly dropping it.
   */
  deniedModules: readonly string[];
  /** True when an AI key was stored. The key itself never leaves the server. */
  llmApiKeySet: boolean;
  /** Named, deliberate gaps. Rendered on the launch screen verbatim. */
  pending: readonly string[];
};

export type ProvisionOutcome =
  | { ok: true; result: ProvisionResult }
  | { ok: false; rejection: ProvisionRejection };

/**
 * Config keys the wizard sets, derived from the draft.
 *
 * Every one goes through `validateConfigValue` before it is written — the same
 * validator the admin API uses on every later edit. A value the wizard could
 * write but the admin API would reject would be a workspace that cannot be
 * edited back to health.
 */
function configFromDraft(draft: OnboardingDraft): Record<string, unknown> {
  const currency =
    draft.numberFormat === "eu"
      ? { currencySymbol: "€", currencyUnit: "" }
      : draft.numberFormat === "intl"
        ? { currencySymbol: "₹", currencyUnit: "million" }
        : { currencySymbol: "₹", currencyUnit: "crore" };

  return {
    productName: draft.orgName,
    pdfHeaderLine: draft.orgName,
    reportFilenamePrefix: draft.slug.slice(0, 32),
    locale: draft.locale,
    timezone: draft.timezone,
    ...currency,
    // Only the dark-ground accent: StepBranding checks contrast against
    // `themeGround("dark")` alone, so dark is the only role the visitor's
    // choice actually says anything about. Leaving `light` unset falls back
    // to `PLATFORM_ROLE_DEFAULTS.light` rather than guessing a value nobody
    // picked.
    themeOverrides: { dark: { "--color-accent": draft.brandColor } },
  };
}

export async function provisionTenant(input: ProvisionInput): Promise<ProvisionOutcome> {
  if (!looksLikeToken(input.token)) {
    return { ok: false, rejection: { kind: "token", detail: "malformed" } };
  }

  const draftError = validateDraft(input.draft);
  if (draftError) return { ok: false, rejection: draftError };

  const tokenHash = hashToken(input.token);
  const now = new Date();

  // Read the token first, outside the transaction, so an invalid one costs one
  // indexed lookup rather than an opened transaction. The authoritative check
  // is inside the transaction below — this is a filter, not the gate.
  const preview = await prismaUnscoped.onboardingToken.findUnique({
    where: { tokenHash },
    select: { id: true, tier: true, expiresAt: true, consumedAt: true },
  });
  const verdict = judgeToken(preview, now);
  if (!verdict.ok) {
    return { ok: false, rejection: { kind: "token", detail: verdict.reason } };
  }

  const tier = verdict.tier as ModuleTier;

  // The tier ceiling. The client sends module codes; the server decides which of
  // them this token is allowed to enable. The same function the menu-card
  // configurator calls, so a tenant cannot reach through one door what the other
  // refuses.
  const { enabled, denied } = resolveGrants(input.draft.moduleCodes, tier);

  const config = configFromDraft(input.draft);
  for (const [key, value] of Object.entries(config)) {
    const error = validateConfigValue(key, value);
    if (error) return { ok: false, rejection: { kind: "config", detail: error } };
  }
  if (input.llmApiKey !== undefined) {
    const error = validateConfigValue("llmApiKey", input.llmApiKey);
    if (error) return { ok: false, rejection: { kind: "config", detail: error } };
  }

  const moduleRows = await prismaUnscoped.module.findMany({
    where: { code: { in: enabled } },
    select: { id: true, code: true, tier: true },
  });
  if (moduleRows.length !== enabled.length) {
    // The catalog and the seeded `modules` table have drifted. Fail rather than
    // provision a tenant missing entitlements nobody will notice are missing.
    return {
      ok: false,
      rejection: { kind: "internal", detail: "module catalog and database are out of step" },
    };
  }

  try {
    const created = await prismaUnscoped.$transaction(async (tx) => {
      // Consume the token as a CONDITIONAL update: `consumedAt: null` in the
      // where clause means two concurrent launches race on one row and exactly
      // one wins. Checking-then-updating would let both through.
      const consumed = await tx.onboardingToken.updateMany({
        where: { id: verdict.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new ProvisionConflict("token");

      const tenant = await tx.tenant.create({
        data: {
          slug: input.draft.slug,
          name: input.draft.orgName,
          status: "active",
          // The ceiling, recorded once and for good. Without this the menu-card
          // configurator would have nothing to measure a later toggle against.
          planTier: tier,
        },
        select: { id: true, slug: true, name: true },
      });

      await tx.onboardingToken.update({
        where: { id: verdict.id },
        data: { tenantId: tenant.id },
      });

      await tx.tenantEntitlement.createMany({
        // `tier` on an entitlement row is the MODULE's tier, matching how the
        // seeded tenants were written. It is not the plan — the plan is on the
        // tenant. Writing the token's tier here would have made every row claim
        // the same tier and quietly redefined a column other code reads.
        data: moduleRows.map((m) => ({
          tenantId: tenant.id,
          moduleId: m.id,
          enabled: true,
          tier: m.tier,
        })),
      });

      const entries = Object.entries(config).map(([key, value]) => ({
        tenantId: tenant.id,
        key,
        value: value as never,
      }));
      if (input.llmApiKey !== undefined) {
        entries.push({ tenantId: tenant.id, key: "llmApiKey", value: input.llmApiKey as never });
      }
      await tx.tenantConfigEntry.createMany({ data: entries });

      return tenant;
    });

    return {
      ok: true,
      result: {
        tenantId: created.id,
        slug: created.slug,
        name: created.name,
        enabledModules: enabled,
        deniedModules: denied,
        llmApiKeySet: input.llmApiKey !== undefined,
        pending: pendingWork(input.draft),
      },
    };
  } catch (error) {
    if (error instanceof ProvisionConflict) {
      return { ok: false, rejection: { kind: "token", detail: "consumed" } };
    }
    // Unique violation on `slug`. Reported without saying who holds it — the
    // set of provisioned organizations is not public information.
    if (isUniqueViolation(error)) {
      return { ok: false, rejection: { kind: "slug", detail: "taken" } };
    }
    throw error;
  }
}

/** Named gaps, surfaced to the visitor rather than left as silence. */
export function pendingWork(draft: OnboardingDraft): string[] {
  const pending: string[] = [];
  if (draft.invites.length > 0) {
    pending.push(
      `${draft.invites.length} invitation${draft.invites.length === 1 ? "" : "s"} recorded. ` +
        `Sending them needs your identity provider connected, which is not open yet.`,
    );
  }
  if (draft.starterData === "sample") {
    pending.push(
      "The sample portfolio is loaded separately by your onboarding lead — the workspace starts empty.",
    );
  }
  if (draft.logoFileName) {
    pending.push(
      "Your logo file name was recorded, but uploading the file itself is not wired up yet. " +
        "Your onboarding lead applies your logo after launch.",
    );
  }
  return pending;
}

class ProvisionConflict extends Error {
  constructor(readonly what: string) {
    super(`provisioning conflict: ${what}`);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

export { RESERVED_SLUGS };
