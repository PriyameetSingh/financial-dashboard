import { PLATFORM_ROLE_DEFAULTS } from "@/components/nocturne/theme";

/**
 * The onboarding draft — what the wizard collects, and what counts as valid.
 *
 * Shared by the client (which validates to show errors as you type) and the
 * server (which validates because the client's opinion is not evidence). One
 * module, so the two cannot disagree about what a valid slug is.
 *
 * NOT IN HERE: the AI API key. It is collected by the wizard and posted to the
 * server, but it is deliberately not part of the draft type, because the draft
 * is what gets written to `localStorage` for save-and-resume. A credential
 * sitting in browser storage until someone clears it is a real leak, on a
 * shared government desktop especially. The key lives in React state for the
 * life of the tab and nowhere else; `tests/onboarding.test.ts` pins that the
 * persisted shape cannot carry it.
 */

/** The sectors the wizard offers. Presentational today; recorded for later. */
export const SECTORS = ["gov", "psu", "ent"] as const;
export type Sector = (typeof SECTORS)[number];

export const NUMBER_FORMATS = ["in", "intl", "eu"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const FISCAL_STARTS = ["apr", "jan", "jul"] as const;
export type FiscalStart = (typeof FISCAL_STARTS)[number];

export const STARTER_DATA = ["empty", "sample"] as const;
export type StarterData = (typeof STARTER_DATA)[number];

export const AI_MODES = ["managed", "byok", "selfhost"] as const;
export type AiMode = (typeof AI_MODES)[number];

export type Invite = {
  email: string;
  role: string;
};

export type OnboardingDraft = {
  orgName: string;
  slug: string;
  sector: Sector;
  contactEmail: string;

  brandColor: string;
  logoFileName: string;

  locale: string;
  timezone: string;
  numberFormat: NumberFormat;
  fiscalStart: FiscalStart;

  /** Gated modules the visitor asked for. Core modules are always on. */
  moduleCodes: string[];

  aiMode: AiMode;
  aiEndpoint: string;
  aiRegionLocal: boolean;
  aiRedactNames: boolean;

  starterData: StarterData;
  invites: Invite[];
};

/**
 * Addresses that must never become a tenant slug.
 *
 * Two different reasons, both worth the list. The first group would collide
 * with the platform's own routes — a tenant at `api` or `login` is a routing
 * bug waiting to happen. The second group is the impersonation surface: an
 * address that reads as Airawat itself, or as an official channel, is exactly
 * what the token gate exists to prevent, so it is refused even to an authorized
 * customer who asks for it by accident.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Platform routes and infrastructure
  "api",
  "app",
  "auth",
  "login",
  "logout",
  "onboarding",
  "platform",
  "static",
  "assets",
  "public",
  "www",
  "mail",
  "smtp",
  "ftp",
  "ns",
  "cdn",
  "status",
  "health",
  // Reads as the vendor or as an official channel
  "airawat",
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "security",
  "billing",
  "official",
  "gov",
  "government",
  "test",
  "demo",
  "staging",
  "production",
]);

/** 3-32 characters, lowercase alphanumeric and single inner hyphens. */
const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Conservative, and deliberately not RFC 5322. A wrong address is a bounce. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type ProvisionRejection =
  | { kind: "token"; detail: string }
  | { kind: "field"; field: string; detail: string }
  | { kind: "slug"; detail: "taken" | "reserved" | "malformed" }
  | { kind: "config"; detail: string }
  | { kind: "internal"; detail: string };

/**
 * Server-side validation of a whole draft.
 *
 * Returns the first problem, or null. Ordered so the visitor is sent back to
 * the earliest step that needs attention rather than the last one checked.
 */
export function validateDraft(draft: OnboardingDraft): ProvisionRejection | null {
  if (typeof draft.orgName !== "string" || draft.orgName.trim().length < 2) {
    return { kind: "field", field: "orgName", detail: "Enter the organization's name." };
  }
  if (draft.orgName.trim().length > 120) {
    return { kind: "field", field: "orgName", detail: "That name is too long (120 characters max)." };
  }

  if (typeof draft.slug !== "string" || !SLUG_SHAPE.test(draft.slug)) {
    return { kind: "slug", detail: "malformed" };
  }
  if (RESERVED_SLUGS.has(draft.slug)) {
    return { kind: "slug", detail: "reserved" };
  }

  if (draft.contactEmail && !EMAIL_SHAPE.test(draft.contactEmail)) {
    return { kind: "field", field: "contactEmail", detail: "That does not look like an email address." };
  }
  if (!SECTORS.includes(draft.sector)) {
    return { kind: "field", field: "sector", detail: "Choose a sector." };
  }

  if (!HEX_COLOR.test(draft.brandColor)) {
    return { kind: "field", field: "brandColor", detail: "The brand colour must be a hex value." };
  }

  if (!NUMBER_FORMATS.includes(draft.numberFormat)) {
    return { kind: "field", field: "numberFormat", detail: "Choose a number format." };
  }
  if (!FISCAL_STARTS.includes(draft.fiscalStart)) {
    return { kind: "field", field: "fiscalStart", detail: "Choose a fiscal year start." };
  }

  if (!AI_MODES.includes(draft.aiMode)) {
    return { kind: "field", field: "aiMode", detail: "Choose how the assistant should run." };
  }
  if (draft.aiMode === "selfhost" && !/^https?:\/\/\S+$/.test(draft.aiEndpoint)) {
    return { kind: "field", field: "aiEndpoint", detail: "Enter the endpoint URL for your own model." };
  }

  if (!STARTER_DATA.includes(draft.starterData)) {
    return { kind: "field", field: "starterData", detail: "Choose how the workspace should start." };
  }

  if (!Array.isArray(draft.moduleCodes) || draft.moduleCodes.some((c) => typeof c !== "string")) {
    return { kind: "field", field: "moduleCodes", detail: "Module selection is malformed." };
  }

  if (!Array.isArray(draft.invites)) {
    return { kind: "field", field: "invites", detail: "Invitation list is malformed." };
  }
  if (draft.invites.length > 50) {
    // A bound, because this list is attacker-controlled and gets stored.
    return { kind: "field", field: "invites", detail: "Invite up to 50 people here; the rest from inside the workspace." };
  }
  for (const invite of draft.invites) {
    if (!EMAIL_SHAPE.test(invite.email)) {
      return { kind: "field", field: "invites", detail: `"${invite.email}" is not an email address.` };
    }
  }

  return null;
}

/** Derives the default slug from a typed organization name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

/** A draft with nothing filled in. The wizard's starting state. */
export function emptyDraft(): OnboardingDraft {
  return {
    orgName: "",
    slug: "",
    sector: "gov",
    contactEmail: "",
    // The platform accent, from the token layer rather than restated here.
    brandColor: PLATFORM_ROLE_DEFAULTS.dark["--color-accent"],
    logoFileName: "",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    numberFormat: "in",
    fiscalStart: "apr",
    moduleCodes: [],
    aiMode: "managed",
    aiEndpoint: "",
    aiRegionLocal: true,
    aiRedactNames: true,
    starterData: "empty",
    invites: [],
  };
}
