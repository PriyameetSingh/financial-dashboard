"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import SchemeModal from "@/components/schemes/SchemeModal";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import { fetchFinancialBudgets } from "@/src/lib/services/financialService";
import type { FinancialEntry } from "@/types";

function effBudget(e: FinancialEntry) {
  return e.effectiveBudgetCr ?? e.annualBudget + (e.totalSupplementCr ?? 0);
}

function utilPct(e: FinancialEntry): number {
  const b = effBudget(e);
  if (!b || b <= 0) return 0;
  return (e.ifms / b) * 100;
}

type Bucket = "on_track" | "at_risk" | "critical";

function bucketFor(pct: number): Bucket {
  if (pct > 75) return "on_track";
  if (pct >= 40) return "at_risk";
  return "critical";
}

function bucketLabel(bucket: Bucket): string {
  switch (bucket) {
    case "critical":
      return "Critical";
    case "at_risk":
      return "At risk";
    case "on_track":
      return "On track";
    default:
      return "";
  }
}

type SponsorshipKind = "SS" | "CSS";

function sponsorshipKind(e: FinancialEntry): SponsorshipKind {
  const t = e.metadata?.sponsorshipType;
  if (t === "STATE") return "SS";
  return "CSS";
}

function subEffBudget(
  s: NonNullable<FinancialEntry["subschemes"]>[number],
): number {
  return (
    s.effectiveBudgetCr ??
    (s.annualBudget ?? 0) + (s.totalSupplementCr ?? 0)
  );
}

function subUtilPct(s: NonNullable<FinancialEntry["subschemes"]>[number]): number {
  const b = subEffBudget(s);
  if (!b || b <= 0) return 0;
  return ((s.ifms ?? 0) / b) * 100;
}

const BUCKET_ORDER: Bucket[] = ["critical", "at_risk", "on_track"];

const COLUMN_UI: Record<
  Bucket,
  {
    title: string;
    range: string;
    headerBg: string;
    headerText: string;
    countBg: string;
    barFill: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    cardBorder: string;
  }
> = {
  critical: {
    title: "CRITICAL",
    range: "< 40%",
    headerBg: "bg-rose-50 dark:bg-rose-950/40",
    headerText: "text-rose-800 dark:text-rose-200",
    countBg: "bg-rose-100/90 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
    barFill: "bg-rose-500",
    badgeBg: "bg-rose-100 dark:bg-rose-900/40",
    badgeText: "text-rose-800 dark:text-rose-200",
    border: "border-rose-200/80 dark:border-rose-800/60",
    cardBorder: "border-rose-100 dark:border-rose-900/50",
  },
  at_risk: {
    title: "AT RISK",
    range: "40–75%",
    headerBg: "bg-amber-50 dark:bg-amber-950/40",
    headerText: "text-amber-900 dark:text-amber-200",
    countBg: "bg-amber-100/90 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100",
    barFill: "bg-amber-500",
    badgeBg: "bg-amber-100 dark:bg-amber-900/40",
    badgeText: "text-amber-900 dark:text-amber-200",
    border: "border-amber-200/80 dark:border-amber-800/60",
    cardBorder: "border-amber-100 dark:border-amber-900/50",
  },
  on_track: {
    title: "ON TRACK",
    range: "> 75%",
    headerBg: "bg-emerald-50 dark:bg-emerald-950/40",
    headerText: "text-emerald-900 dark:text-emerald-200",
    countBg: "bg-emerald-100/90 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100",
    barFill: "bg-emerald-500",
    badgeBg: "bg-emerald-100 dark:bg-emerald-900/40",
    badgeText: "text-emerald-900 dark:text-emerald-200",
    border: "border-emerald-200/80 dark:border-emerald-800/60",
    cardBorder: "border-emerald-100 dark:border-emerald-900/50",
  },
};

export default function SchemesBoardClient() {
  const currentUser = useHydratedCurrentUser();
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedSchemeId, setExpandedSchemeId] = useState<string | null>(null);
  const [schemeModalEntry, setSchemeModalEntry] = useState<FinancialEntry | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchFinancialBudgets();
        if (!alive) return;
        setEntries(data.entries);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.scheme.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.vertical.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const columns = useMemo(() => {
    const cols: Record<Bucket, FinancialEntry[]> = {
      on_track: [],
      at_risk: [],
      critical: [],
    };
    for (const e of filtered) {
      cols[bucketFor(utilPct(e))].push(e);
    }
    for (const k of BUCKET_ORDER) {
      cols[k].sort((a, b) => utilPct(b) - utilPct(a));
    }
    return cols;
  }, [filtered]);

  const totals = useMemo(() => {
    const totalRe = filtered.reduce((s, e) => s + effBudget(e), 0);
    const spent = filtered.reduce((s, e) => s + e.ifms, 0);
    const overallPct = totalRe > 0 ? (spent / totalRe) * 100 : 0;
    const verticalCount = new Set(filtered.map((e) => e.vertical)).size;
    return { totalRe, spent, overallPct, verticalCount };
  }, [filtered]);

  const isViewer = isReadOnlyWatermarkUser(currentUser);

  const fmtCr = (n: number) =>
    n >= 100 ? n.toFixed(0) : n.toFixed(1);

  return (
    <AppShell title="Scheme utilisation board">
      <div className="relative space-y-6 px-6 py-6">
        {isViewer && (
          <div className="pointer-events-none absolute right-6 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Read-only
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">
              Financial
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Scheme Budget vs. Expenditure
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
              {filtered.length} schemes across {totals.verticalCount} verticals — each card is a
              scheme; expand to see sub-schemes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-500" />
                SS — State Scheme
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-orange-500" />
                CSS — Centrally Sponsored Scheme
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-xl flex-col gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-end">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schemes or verticals…"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-full border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs tabular-nums text-[var(--text-primary)]">
                Total RE ₹{fmtCr(totals.totalRe)} Cr
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs tabular-nums text-[var(--text-primary)]">
                Spent ₹{fmtCr(totals.spent)} Cr
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                {totals.overallPct.toFixed(1)}% overall
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--alert-warning)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)]">
            {error}
          </div>
        )}

        {loading && (
          <p className="text-sm text-[var(--text-muted)]">Loading schemes…</p>
        )}

        {!loading && !error && (
          <div className="grid gap-4 lg:grid-cols-3">
            {BUCKET_ORDER.map((key) => {
              const ui = COLUMN_UI[key];
              const list = columns[key];
              return (
                <div
                  key={key}
                  className={`flex min-h-[360px] flex-col overflow-hidden rounded-2xl border-2 bg-[var(--bg-card)] ${ui.border}`}
                >
                  <div
                    className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${ui.headerBg} ${ui.border}`}
                  >
                    <div>
                      <p className={`text-sm font-bold ${ui.headerText}`}>
                        {ui.title}{" "}
                        <span className="font-normal opacity-80">({ui.range})</span>
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${ui.countBg}`}
                    >
                      {list.length}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                    {list.map((entry) => {
                      const pct = utilPct(entry);
                      const kind = sponsorshipKind(entry);
                      const entryBucket = bucketFor(pct);
                      const hasSubs =
                        !!entry.subschemes?.length;
                      const expanded =
                        hasSubs && expandedSchemeId === entry.id;

                      const cardClass = `cursor-pointer rounded-xl border bg-[var(--bg-document)] p-3 shadow-sm outline-none ring-offset-2 ring-offset-[var(--bg-document)] focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] ${ui.cardBorder}`;

                      return (
                        <div
                          key={entry.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open scheme details for ${entry.scheme}`}
                          onClick={() => setSchemeModalEntry(entry)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSchemeModalEntry(entry);
                            }
                          }}
                          className={cardClass}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
                                {entry.scheme}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                                {entry.vertical} · {entry.id}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ui.badgeBg} ${ui.badgeText}`}
                            >
                              {bucketLabel(entryBucket)} — {pct.toFixed(1)}%
                            </span>
                          </div>

                          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                            RE ₹{fmtCr(effBudget(entry))} Cr · Spent ₹
                            {fmtCr(entry.ifms)} Cr
                          </p>

                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={`mt-0.5 size-2 shrink-0 rounded-full ${
                                kind === "SS" ? "bg-sky-500" : "bg-orange-500"
                              }`}
                              title={kind === "SS" ? "State Scheme" : "Centrally Sponsored"}
                            />
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                              <div
                                className={`h-full rounded-full transition-all ${ui.barFill}`}
                                style={{
                                  width: `${Math.min(100, pct)}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                              {pct.toFixed(1)}%
                            </span>
                          </div>

                          {hasSubs && (
                            <div
                              className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-2"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={`text-[11px] font-medium ${ui.headerText} hover:underline`}
                                aria-expanded={expanded}
                                onClick={() =>
                                  setExpandedSchemeId((id) =>
                                    id === entry.id ? null : entry.id,
                                  )
                                }
                              >
                                {expanded ? "Collapse ∨" : "View sub-schemes >"}
                              </button>
                            </div>
                          )}

                          {expanded && entry.subschemes && (
                            <ul
                              className="mt-3 space-y-2 border-t border-[var(--border)] pt-3"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {entry.subschemes.map((sub) => {
                                const sp = subUtilPct(sub);
                                const re = subEffBudget(sub);
                                return (
                                  <li
                                    key={sub.id}
                                    className="flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5 text-[11px]"
                                  >
                                    <span
                                      className={`mt-1 size-1.5 shrink-0 rounded-full ${
                                        kind === "SS"
                                          ? "bg-sky-400"
                                          : "bg-orange-400"
                                      }`}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-[var(--text-primary)]">
                                        {sub.name}
                                      </p>
                                      <p className="text-[10px] text-[var(--text-muted)]">
                                        {sub.code}
                                      </p>
                                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] tabular-nums text-[var(--text-secondary)]">
                                        <span>RE ₹{fmtCr(re)} Cr</span>
                                        <span>
                                          Spent ₹{fmtCr(sub.ifms ?? 0)} Cr
                                        </span>
                                      </div>
                                    </div>
                                    <span className="shrink-0 self-start rounded bg-[var(--bg-document)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                                      {sp.toFixed(1)}%
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    {list.length === 0 && (
                      <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                        No schemes in this band.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <SchemeModal
          open={schemeModalEntry !== null}
          onClose={() => setSchemeModalEntry(null)}
          scheme={
            schemeModalEntry
              ? {
                  id: schemeModalEntry.schemeId ?? schemeModalEntry.id,
                  code: schemeModalEntry.id,
                  name: schemeModalEntry.scheme,
                  verticalName: schemeModalEntry.vertical,
                }
              : null
          }
        />
      </div>
    </AppShell>
  );
}
