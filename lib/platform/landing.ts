/**
 * What the public landing page says about the product, derived from the module
 * catalog rather than restated beside it.
 *
 * The rule this file exists to honour: no hardcoded module list on a shipped
 * surface. A marketing page that lists modules from its own array is the exact
 * failure mode — it looks right on the day it ships and drifts the first time a
 * module is added, renamed or reclassified, and nothing catches it because
 * marketing copy has no tests.
 *
 * So the split is:
 *
 *   the LIST, the NAMES, the TIERS and every COUNT come from `MODULE_CATALOG`.
 *   the PROSE is content, keyed by module code, and `tests/platform-landing`
 *   asserts the keys are exactly the catalog's sellable codes. Adding a module
 *   to the catalog fails the build until someone writes a sentence about it,
 *   which is the correct outcome: shipping a module the landing cannot describe
 *   is a content gap, not a silent omission.
 *
 * Nothing here reads a database, a session or a tenant. The landing is public
 * and unauthenticated, and it must stay that way — a public page that queried
 * tenant rows would be an unscoped cross-tenant read, which this phase forbids
 * outright.
 */
import { MODULE_CATALOG, type ModuleDef, type ModuleTier } from "@/lib/entitlements/catalog";

/* ── module copy ──────────────────────────────────────────────────────────── */

export type ModuleCopy = {
  /** One sentence, in the officer's language, on what the module does. */
  summary: string;
  /** Three concrete things a user sees. Shown in the tour panel. */
  highlights: readonly [string, string, string];
};

/**
 * Keyed by catalog code. Covers every sellable module — core and gated alike,
 * since a buyer comparing plans needs to know what the base tier contains, not
 * only what the upsells are.
 *
 * Roadmap modules are deliberately absent: they have no product surface, and
 * describing one on a pricing page would be selling something that does not
 * exist. They appear on the page as named, dated-as-planned vocabulary only.
 */
const MODULE_COPY: Record<string, ModuleCopy> = {
  "MOD-AUTH": {
    summary:
      "Sign-in for your officers, with your own identity provider when you have one.",
    highlights: [
      "Sign in with the account your office already issues",
      "Sessions end immediately when an account is suspended",
      "Single sign-on available on the top tier",
    ],
  },
  "MOD-SHELL": {
    summary:
      "The navigation, search and personal task list every officer sees, whatever else you enable.",
    highlights: [
      "Navigation shows only the modules your organization has",
      "A personal list of everything awaiting you, across modules",
      "Works on a phone, which is where most field officers are",
    ],
  },
  "MOD-PROF": {
    summary: "Each officer's own details, contact information and preferences.",
    highlights: [
      "Officers keep their own contact details current",
      "Text size and theme follow the officer, not the device",
      "Post and department shown on everything they submit",
    ],
  },
  "MOD-RBAC": {
    summary:
      "Roles and permissions, scoped to the departments and schemes each post is responsible for.",
    highlights: [
      "Roles are defined once and applied everywhere",
      "An officer sees only their department's figures",
      "Every permission change is recorded with who made it",
    ],
  },
  "MOD-ADMIN": {
    summary:
      "Your reference directories — organizations, verticals, sections, local bodies, designations and financial years.",
    highlights: [
      "Your own organizational structure, not a fixed template",
      "Financial years follow your fiscal calendar",
      "Changes take effect without a release",
    ],
  },
  "MOD-CC": {
    summary:
      "Your leadership's first screen each morning: utilization, releases, flags and pending approvals in one view.",
    highlights: [
      "Utilization against allotment, at a glance",
      "Schemes at risk of lapsing flagged against your year end",
      "Alerts name the officer who can act on them",
    ],
  },
  "MOD-FIN": {
    summary:
      "Allotments, treasury releases and expenditure, entered once and agreed across teams.",
    highlights: [
      "Scheme-wise and summary entry, by sponsorship type",
      "Release against allotment tracked through the year",
      "One set of figures, so no two reports disagree",
    ],
  },
  "MOD-SR": {
    summary: "The register of schemes, their sponsors, sanctions and current status.",
    highlights: [
      "Every scheme with its sanction, head code and owner",
      "Ordering and grouping that matches how you review",
      "Progress visible without opening a file",
    ],
  },
  "MOD-KPI": {
    summary:
      "Indicators with thresholds, owners and reviewers, tracked to completion.",
    highlights: [
      "Thresholds you define, not ones we assume",
      "A performer and a reviewer on every indicator",
      "Status that says whether it is on track, at risk or breached",
    ],
  },
  "MOD-MTG": {
    summary:
      "Meetings with their agenda, discussion topics, presentations and minutes.",
    highlights: [
      "Agenda assembled from live figures, not last week's",
      "Presentations attached and circulated with the pack",
      "Decisions recorded against the meeting that made them",
    ],
  },
  "MOD-RPT": {
    summary:
      "Print-ready meeting packs and exports, in PDF and Excel, under your letterhead.",
    highlights: [
      "A full review pack in minutes, not a morning",
      "PDF for circulation, Excel for further work",
      "Your organization's name and logo on every page",
    ],
  },
  "MOD-ACT": {
    summary: "Action items from every meeting, with an owner, a date and proof of completion.",
    highlights: [
      "Every decision has a named officer and a due date",
      "Officers attach evidence when they close an item",
      "Overdue items surface before the next meeting, not during it",
    ],
  },
  "MOD-AI": {
    summary:
      "Written summaries and question answering over your own figures, for officers who would rather ask than filter.",
    highlights: [
      "Ask in plain language and get the figure with its source",
      "Summaries drafted for review, never published unread",
      "Runs on your data only",
    ],
  },
  "MOD-NOTIF": {
    summary:
      "Alerts and digests that reach the officer who can act, by mail and in the dashboard.",
    highlights: [
      "Assignments and approvals notified as they happen",
      "Quiet hours, so nothing arrives at midnight",
      "Critical alerts still get through",
    ],
  },
  "MOD-CHLOG": {
    summary: "A plain-language record of what changed in the platform and when.",
    highlights: [
      "Written for officers, not for engineers",
      "Visible in the dashboard, no release notes to hunt for",
      "Useful when an auditor asks what the system did last quarter",
    ],
  },
};

/** A catalog module with its landing copy attached. */
export type LandingModule = ModuleDef & { copy: ModuleCopy };

/** Every module that can actually be provisioned, with copy. Catalog order. */
export const SELLABLE_MODULES: readonly LandingModule[] = MODULE_CATALOG.filter(
  (m) => m.enforcement !== "roadmap",
).map((m) => {
  const copy = MODULE_COPY[m.code];
  if (!copy) {
    // Not a soft failure: rendering a module with no description would put an
    // empty card on a public page. The test catches this at build time; this
    // throw is the runtime backstop.
    throw new Error(`landing: no copy for catalog module ${m.code}`);
  }
  return { ...m, copy };
});

/** Named, planned, not sold. Shown as vocabulary so the roadmap is not a secret. */
export const PLANNED_MODULES: readonly ModuleDef[] = MODULE_CATALOG.filter(
  (m) => m.enforcement === "roadmap",
);

/**
 * The module tour — the subset the page walks a visitor through, in order.
 *
 * Curation is content, so the ORDER is written here; membership is validated
 * against the catalog by the test, and everything not in the tour still appears
 * in the full grid below it. Nothing in the catalog can go unmentioned.
 */
export const TOUR_CODES: readonly string[] = [
  "MOD-CC",
  "MOD-FIN",
  "MOD-KPI",
  "MOD-MTG",
  "MOD-RPT",
];

export const TOUR_MODULES: readonly LandingModule[] = TOUR_CODES.map((code) => {
  const found = SELLABLE_MODULES.find((m) => m.code === code);
  if (!found) throw new Error(`landing: tour names ${code}, which is not a sellable module`);
  return found;
});

/* ── plans ────────────────────────────────────────────────────────────────── */

/**
 * The commercial tiers, expressed as which catalog tiers each one includes.
 *
 * IMPORTANT: this mapping is a COMMERCIAL decision, not a technical one. The
 * catalog's `tier` column is documented there as "a placeholder for the future
 * menu-card pricing", and the guard never reads it. What is asserted here — that
 * Essential is the core tier, Governance adds standard, Institution adds premium
 * — is a reading of the design's three plans, not a signed-off price list, and
 * it needs product sign-off before this page is public.
 *
 * It is written as one table precisely so that sign-off has one thing to look
 * at, and so a new catalog tier cannot quietly belong to no plan: the test
 * asserts every tier present in the catalog is claimed by exactly one plan.
 *
 * No prices appear on the page. The design's own call to action is "request a
 * quote", and inventing figures would be fabrication.
 */
export type Plan = {
  id: string;
  /** "Tier 1" etc. — the kicker. */
  rank: string;
  name: string;
  summary: string;
  /** Catalog tiers this plan adds on top of the plans before it. */
  adds: readonly ModuleTier[];
  /** Deployment and support notes. Content. */
  notes: string;
  /** The design highlights the middle plan. */
  featured?: boolean;
};

export const PLANS: readonly Plan[] = [
  {
    id: "essential",
    rank: "Tier 1",
    name: "Essential",
    summary:
      "The command centre, your organizational structure, roles and sign-in — everything needed to run one dashboard well.",
    adds: ["core"],
    notes: "Shared deployment.",
  },
  {
    id: "governance",
    rank: "Tier 2",
    name: "Governance",
    summary:
      "Adds the working modules: finance, schemes, indicators, meetings, report packs, action items and notifications.",
    adds: ["standard"],
    notes: "Shared deployment, with the design-system configurator.",
    featured: true,
  },
  {
    id: "institution",
    rank: "Tier 3",
    name: "Institution",
    summary: "Every module we sell, on an isolated deployment with an assigned onboarding lead.",
    adds: ["premium", "addon"],
    notes: "Isolated deployment, single sign-on, custom retention.",
  },
];

/** A plan with its module set resolved from the catalog. Cumulative. */
export type ResolvedPlan = Plan & {
  /** Every module included at this tier, counting the tiers below it. */
  modules: readonly LandingModule[];
};

export const RESOLVED_PLANS: readonly ResolvedPlan[] = (() => {
  const cumulative: ModuleTier[] = [];
  return PLANS.map((plan) => {
    cumulative.push(...plan.adds);
    const included = [...cumulative];
    return {
      ...plan,
      modules: SELLABLE_MODULES.filter((m) => m.tier !== null && included.includes(m.tier)),
    };
  });
})();

/* ── figures the page quotes about itself ─────────────────────────────────── */

/**
 * The stat band. Every number is counted from the catalog at build time, so the
 * page cannot claim a module count it does not have.
 */
export const PLATFORM_FIGURES = {
  sellableModules: SELLABLE_MODULES.length,
  plannedModules: PLANNED_MODULES.length,
  gatedModules: SELLABLE_MODULES.filter((m) => m.enforcement === "gated").length,
} as const;
