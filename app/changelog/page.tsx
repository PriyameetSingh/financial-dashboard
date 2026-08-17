"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/src/lib/route-guards";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantLocale } from "@/lib/tenant-config/format";
import { Calendar, Rocket, ShieldAlert, Sparkles, Wrench } from "lucide-react";

type Entry = {
  id: string;
  type: "NEW_FEATURE" | "FIX" | "IMPROVEMENT" | "BREAKING_CHANGE";
  title: string;
  description: string | null;
  createdAt: string;
};

type Release = {
  id: string;
  version: string;
  isCurrent: boolean;
  createdAt: string;
  entries: Entry[];
};

/*
 * Four kinds of change, three of which are a KIND and one of which is a
 * SEVERITY. That distinction is why they do not all read from one palette: New
 * Feature, Improvement and Fix are categorical — no one of them is worse than
 * another — while Breaking Change is a warning, and painting it as just another
 * category would lose the only thing about it a reader needs to notice.
 *
 * Each entry keeps its own icon, which is what actually carries the kind at a
 * glance; the tint and the edge reinforce it.
 */
const TYPE_CONFIG = {
  NEW_FEATURE: {
    label: "New Feature",
    chip: "ax-chip-cat-2",
    edge: "ax-edge-cat-2",
    icon: Rocket,
  },
  IMPROVEMENT: {
    label: "Improvement",
    chip: "ax-chip-cat-4",
    edge: "ax-edge-cat-4",
    icon: Sparkles,
  },
  FIX: {
    label: "Fix",
    chip: "ax-chip-cat-3",
    edge: "ax-edge-cat-3",
    icon: Wrench,
  },
  BREAKING_CHANGE: {
    label: "Breaking Change",
    chip: "ax-chip-critical",
    edge: "ax-edge-critical",
    icon: ShieldAlert,
  },
};

export default function ChangelogPage() {
  const user = useRequireAuth();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let active = true;
    void fetch(withNextBasePath("/api/v1/releases"), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load releases");
        return res.json();
      })
      .then((data) => {
        if (active) {
          setReleases(data.releases || []);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const sortedReleases = useMemo(() => {
    return [...releases].sort((a, b) => {
      // Sort by semver descending
      const parse = (v: string) => v.split(".").map(Number);
      const partsA = parse(a.version);
      const partsB = parse(b.version);
      for (let i = 0; i < 3; i++) {
        const valA = partsA[i] || 0;
        const valB = partsB[i] || 0;
        if (valA !== valB) return valB - valA;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [releases]);

  if (!user) return null;

  return (
    <AppShell title="Release Notes">
      <div className="space-y-8 px-6 py-6 max-w-4xl mx-auto">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-[var(--color-divider)]/50 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--ax-muted)]">Updates & Changelog</p>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)] mt-1">What's New in HUDD Dashboard</h1>
            <p className="mt-2 text-sm text-[var(--ax-muted)]">
              Follow along with features, refinements, and fixes shipped to improve your planning workflow.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--ax-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition"
            >
              &larr; Back to Dashboard
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
            <p className="text-sm text-[var(--ax-muted)]">Loading changelog data...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--ax-status-critical)]/20 ax-fill-critical/5 p-4 text-sm ax-tone-critical">
            {error}
          </div>
        ) : sortedReleases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-divider)] p-12 text-center">
            <Rocket className="mx-auto h-12 w-12 text-[var(--ax-muted)] opacity-50" />
            <h3 className="mt-4 text-base font-semibold text-[var(--color-text)]">No releases logged</h3>
            <p className="mt-2 text-sm text-[var(--ax-muted)]">Release history will appear here once published.</p>
          </div>
        ) : (
          <div className="relative border-l border-[var(--color-divider)]/80 ml-4 pl-8 space-y-12 py-2">
            {sortedReleases.map((release) => {
              const dateLabel = new Date(release.createdAt).toLocaleDateString(tenantLocale(), {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <div key={release.id} className="relative group">
                  {/* Timeline point */}
                  <span className="absolute -left-[41px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-bg)] ring-4 ring-[var(--color-bg)]">
                    <span className={`h-2.5 w-2.5 rounded-full ${release.isCurrent ? "bg-[var(--color-accent)]" : "bg-[var(--ax-divider-strong)]"}`} />
                  </span>

                  <div className="space-y-4">
                    <header className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
                        v{release.version}
                      </h2>
                      {release.isCurrent && (
                        <span className="rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          Current Release
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-[var(--ax-muted)]">
                        <Calendar size={14} />
                        <span>{dateLabel}</span>
                      </div>
                    </header>

                    {release.entries.length === 0 ? (
                      <p className="text-sm italic text-[var(--ax-muted)]">No entry details provided for this release.</p>
                    ) : (
                      <div className="grid gap-4">
                        {release.entries.map((entry) => {
                          const conf = TYPE_CONFIG[entry.type] || TYPE_CONFIG.IMPROVEMENT;
                          const Icon = conf.icon;

                          return (
                            <div
                              key={entry.id}
                              className={`card elev-sm ${conf.edge} p-5 transition hover:shadow-md`}
                            >
                              <div className="flex items-start gap-4">
                                <span className={`ax-chip ${conf.chip} flex h-8 w-8 shrink-0 items-center justify-center rounded-xl`}>
                                  <Icon size={16} />
                                </span>
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-base font-semibold text-[var(--color-text)] leading-snug">
                                      {entry.title}
                                    </h4>
                                    <span className={`ax-chip ${conf.chip} px-2 py-0.5 text-[10px] font-semibold capitalize`}>
                                      {conf.label}
                                    </span>
                                  </div>
                                  {entry.description && (
                                    <p className="text-sm text-[var(--ax-text-secondary)] leading-relaxed whitespace-pre-wrap">
                                      {entry.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
