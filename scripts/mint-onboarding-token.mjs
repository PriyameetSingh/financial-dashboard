#!/usr/bin/env node
/**
 * Mint an onboarding token — the authorization to create one tenant.
 *
 * A command-line tool because issuing tokens belongs to the control plane (S4),
 * which is out of scope for this phase. Rather than leave the wizard
 * unreachable until that exists, or leave tenant creation open, the gate is
 * enforced now and the issuing surface arrives later. When it does, this script
 * becomes the thing it replaces.
 *
 * The token is printed ONCE. Only its SHA-256 hash is stored, so it cannot be
 * recovered from the database, from a backup, or from this terminal's scrollback
 * once it is cleared. That is the intended property, not an inconvenience.
 *
 *   node --env-file=.env.local scripts/mint-onboarding-token.mjs \
 *     --tier standard --label "Suryapur Development Authority" --days 30
 *
 * `--tier` is the ceiling on what the resulting workspace can enable:
 *   core      the Essential plan
 *   standard  Governance
 *   premium   Institution
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);

function flag(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  return args[i + 1];
}

const TIERS = ["core", "standard", "premium", "addon"];

const tier = flag("tier", "standard");
const label = flag("label", null);
const days = Number(flag("days", "30"));

if (!TIERS.includes(tier)) {
  console.error(`mint-onboarding-token: --tier must be one of ${TIERS.join(", ")}`);
  process.exit(1);
}
if (!Number.isFinite(days) || days < 1 || days > 365) {
  console.error("mint-onboarding-token: --days must be between 1 and 365");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const prisma = new PrismaClient();
try {
  const row = await prisma.onboardingToken.create({
    data: { tokenHash, tier, label, expiresAt },
    select: { id: true, expiresAt: true },
  });

  console.log("");
  console.log("  Onboarding code (shown once — copy it now):");
  console.log("");
  console.log(`    ${token}`);
  console.log("");
  console.log(`  id       ${row.id}`);
  console.log(`  tier     ${tier}`);
  if (label) console.log(`  issued   ${label}`);
  console.log(`  expires  ${row.expiresAt.toISOString()}`);
  console.log("");
  console.log("  Only its hash is stored. It cannot be recovered.");
  console.log("");
} finally {
  await prisma.$disconnect();
}
