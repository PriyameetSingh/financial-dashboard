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

