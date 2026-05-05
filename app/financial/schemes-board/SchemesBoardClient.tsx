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

type ViewTab = "board" | "list";
type SortKey = "scheme" | "vertical" | "re" | "spent" | "pct" | "bucket";
type SortDir = "asc" | "desc";

export default function SchemesBoardClient() {
  const currentUser = useHydratedCurrentUser();
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedSchemeId, setExpandedSchemeId] = useState<string | null>(null);
  const [schemeModalEntry, setSchemeModalEntry] = useState<FinancialEntry | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("board");
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  const sortedList = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "scheme":
          cmp = a.scheme.localeCompare(b.scheme);
          break;
        case "vertical":
          cmp = a.vertical.localeCompare(b.vertical);
          break;
        case "re":
          cmp = effBudget(a) - effBudget(b);
          break;
        case "spent":
          cmp = a.ifms - b.ifms;
          break;
        case "pct":
          cmp = utilPct(a) - utilPct(b);
          break;
        case "bucket": {
          const order: Record<Bucket, number> = { critical: 0, at_risk: 1, on_track: 2 };
          cmp = order[bucketFor(utilPct(a))] - order[bucketFor(utilPct(b))];
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

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

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1 w-fit">
          {(["board", "list"] as ViewTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? "bg-[var(--bg-document)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab === "board" ? (
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="4" height="14" rx="1" />
                  <rect x="6" y="1" width="4" height="14" rx="1" />
                  <rect x="11" y="1" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 4h14M1 8h14M1 12h14" strokeLinecap="round" />
                </svg>
              )}
              {tab === "board" ? "Board" : "List"}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--alert-warning)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)]">
            {error}
          </div>
        )}

        {loading && (
          <p className="text-sm text-[var(--text-muted)]">Loading schemes…</p>
        )}

        {!loading && !error && activeTab === "board" && (
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

        {!loading && !error && activeTab === "list" && (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-surface)] text-xs uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {(
                      [
                        { key: "scheme" as SortKey, label: "Scheme" },
                        { key: "vertical" as SortKey, label: "Vertical" },
                        { key: "re" as SortKey, label: "RE (Cr)" },
                        { key: "spent" as SortKey, label: "Spent (Cr)" },
                        { key: "pct" as SortKey, label: "Utilisation" },
                      ] as { key: SortKey; label: string }[]
                    ).map(({ key, label }) => (
                      <th
                        key={key}
                        scope="col"
                        className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left font-semibold hover:text-[var(--text-primary)] ${
                          key === "re" || key === "spent" || key === "pct"
                            ? "text-right"
                            : ""
                        }`}
                        onClick={() => handleSort(key)}
                      >
                        {label}
                        <SortIcon col={key} />
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {sortedList.map((entry) => {
                    const pct = utilPct(entry);
                    const bucket = bucketFor(pct);
                    const kind = sponsorshipKind(entry);

                    const barFill =
                      bucket === "critical"
                        ? "bg-rose-500"
                        : bucket === "at_risk"
                          ? "bg-amber-500"
                          : "bg-emerald-500";

                    return (
                      <tr
                        key={entry.id}
                        className="group cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                        onClick={() => setSchemeModalEntry(entry)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 shrink-0 rounded-full ${kind === "SS" ? "bg-sky-500" : "bg-orange-500"}`}
                              title={kind === "SS" ? "State Scheme" : "Centrally Sponsored"}
                            />
                            <div>
                              <p className="font-medium leading-snug text-[var(--text-primary)]">
                                {entry.scheme}
                              </p>
                              <p className="text-[11px] text-[var(--text-muted)]">{entry.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {entry.vertical}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                          ₹{fmtCr(effBudget(entry))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                          ₹{fmtCr(entry.ifms)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border)]">
                              <div
                                className={`h-full rounded-full ${barFill}`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-medium text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                            View →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedList.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-12 text-center text-xs text-[var(--text-muted)]"
                      >
                        No schemes match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
