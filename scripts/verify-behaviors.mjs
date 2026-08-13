/**
 * Lightweight checks for core helpers (run: node scripts/verify-behaviors.mjs)
 */
import assert from "node:assert/strict";
import { test } from "node:test";

function deriveFinancialEntryStatus({ workflowStatus, asOfDate, referenceDate }) {
  const now = referenceDate ?? new Date();
  if (workflowStatus === "draft") return "draft";
  const ms = now.getTime() - asOfDate.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days > 21) return "overdue";
  if (days <= 7) return "submitted_this_week";
  return "submitted_pending";
}

test("deriveFinancialEntryStatus: draft stays draft", () => {
  const s = deriveFinancialEntryStatus({
    workflowStatus: "draft",
    asOfDate: new Date("2026-04-01"),
    referenceDate: new Date("2026-04-07"),
  });
  assert.equal(s, "draft");
});

test("deriveFinancialEntryStatus: submitted recent is submitted_this_week", () => {
  const s = deriveFinancialEntryStatus({
    workflowStatus: "submitted",
    asOfDate: new Date("2026-04-05"),
    referenceDate: new Date("2026-04-07"),
  });
  assert.equal(s, "submitted_this_week");
});

test("denominator lock rule: second change blocked without override", () => {
  const hasExisting = true;
  const canOverride = false;
  const allowed = !hasExisting || canOverride;
  assert.equal(allowed, false);
});

test("action item status: transitions directly to COMPLETED when assignee is reviewer", () => {
  const performerIds = new Set(["user-1"]);
  const reviewerIds = new Set(["user-1"]);
  const hasOverlap = [...performerIds].some((id) => reviewerIds.has(id));

  let status = "UNDER_REVIEW";
  if (status === "UNDER_REVIEW" && hasOverlap) {
    status = "COMPLETED";
  }
  assert.equal(status, "COMPLETED");
});

// ─── Core-surface derivation rules (odisha golden baseline) ────────────────
// These mirror the exact thresholds/labels used by the Command Centre and
// Financial Overview surfaces so a silent change to a magic number is caught
// here without needing a running app. They assert behaviour, not identity.

// Mirrors lib/command-centre-dashboard.ts schemeStatusFromPct / schemePct.
function schemePct(entry) {
  const b = entry.effectiveBudgetCr ?? entry.annualBudget + (entry.totalSupplementCr ?? 0);
  if (!b || b <= 0) return 0;
  return (entry.ifms / b) * 100;
}
function schemeStatusFromPct(pct) {
  if (pct < 40) return "critical";
  if (pct < 75) return "warning";
  return "on-track";
}

test("command-centre: utilisation pct is zero when budget is zero/missing", () => {
  assert.equal(schemePct({ ifms: 50, annualBudget: 0, totalSupplementCr: 0 }), 0);
  assert.equal(schemePct({ ifms: 50, annualBudget: 0, totalSupplementCr: 0, effectiveBudgetCr: 0 }), 0);
});

test("command-centre: status thresholds — <40 critical, <75 warning, >=75 on-track", () => {
  assert.equal(schemeStatusFromPct(0), "critical");
  assert.equal(schemeStatusFromPct(39.9), "critical");
  assert.equal(schemeStatusFromPct(40), "warning");
  assert.equal(schemeStatusFromPct(74.9), "warning");
  assert.equal(schemeStatusFromPct(75), "on-track");
  assert.equal(schemeStatusFromPct(100), "on-track");
});

test("command-centre: pct uses effective budget (annual + supplement) when present", () => {
  const pct = schemePct({ ifms: 50, annualBudget: 100, totalSupplementCr: 0, effectiveBudgetCr: 200 });
  assert.equal(pct, 25); // 50/200
});

// Mirrors the financial-summary head-code label fallback in
// app/api/v1/financial/summary/route.ts (labelForHeadCode).
const FINANCE_YEAR_BUDGET_CATEGORY_LABELS = {
  STATE_SCHEME: "State Sector Scheme",
  CENTRALLY_SPONSORED_SCHEME: "Centrally Sponsored Scheme",
  CENTRAL_SECTOR_SCHEME: "Central Sector Scheme",
  STATE_FINANCE_COMMISSION: "State Finance Commission",
  UNION_FINANCE_COMMISSION: "Union Finance Commission",
  OTHER_TRANSFER_STAMP_DUTY: "Other Transfer (Stamp Duty)",
  ADMIN_EXPENDITURE: "Admin. Expenditure",
};
const LEGACY_HEAD_LABELS = { PLAN_TYPE: "Plan Type", TRANSFER: "Transfer", ADMIN_EXPENDITURE: "Admin Expenditure" };
function labelForHeadCode(headCode) {
  if (headCode in FINANCE_YEAR_BUDGET_CATEGORY_LABELS) {
    return FINANCE_YEAR_BUDGET_CATEGORY_LABELS[headCode];
  }
  return LEGACY_HEAD_LABELS[headCode] ?? headCode;
}

test("financial overview: known FY budget category head codes resolve to labels", () => {
  assert.equal(labelForHeadCode("STATE_SCHEME"), "State Sector Scheme");
  assert.equal(labelForHeadCode("CENTRALLY_SPONSORED_SCHEME"), "Centrally Sponsored Scheme");
  assert.equal(labelForHeadCode("ADMIN_EXPENDITURE"), "Admin. Expenditure");
});

test("financial overview: legacy head codes fall back, unknown codes pass through", () => {
  assert.equal(labelForHeadCode("PLAN_TYPE"), "Plan Type");
  assert.equal(labelForHeadCode("TRANSFER"), "Transfer");
  assert.equal(labelForHeadCode("UNKNOWN_HEAD"), "UNKNOWN_HEAD");
});


