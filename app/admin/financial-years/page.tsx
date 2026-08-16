"use client";

import AppShell from "@/components/AppShell";
import { Permission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { withNextBasePath } from "@/lib/next-base-path";

type FyRow = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isDefaultForApis: boolean;
};

export default function AdminFinancialYearsPage() {
  const user = useRequireAnyPermission([Permission.MANAGE_FINANCIAL_YEARS], "/dashboard");

  const [items, setItems] = useState<FyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createLabel, setCreateLabel] = useState("");
  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(withNextBasePath("/api/v1/admin/financial-years"), { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { items?: FyRow[]; detail?: string };
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withNextBasePath("/api/v1/admin/financial-years"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: createLabel, startDate: createStart, endDate: createEnd }),
      });
      const data = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setCreateLabel("");
      setCreateStart("");
      setCreateEnd("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: FyRow) {
    setEditingId(row.id);
    setEditLabel(row.label);
    setEditStart(row.startDate);
    setEditEnd(row.endDate);
  }

  async function onSaveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(withNextBasePath(`/api/v1/admin/financial-years/${id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel, startDate: editStart, endDate: editEnd }),
      });
      const data = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell title="Financial years">
      <div className="space-y-6 px-6 py-6">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Financial years</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
            Years are stored in the database. Most screens use the year with the latest end date as the default when no
            FY is selected. Changing dates or adding a new year affects which FY is treated as current.
          </p>
          <Link href="/admin" className="mt-3 inline-block text-sm text-[var(--text-primary)] underline-offset-2 hover:underline">
            ← Administration
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--ax-status-critical)]/40 ax-fill-critical/10 px-4 py-3 text-sm" role="alert">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Add financial year</h2>
          <form onSubmit={onCreate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)]">Label</span>
              <input
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)]"
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
                placeholder="2026-27"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)]">Start (YYYY-MM-DD)</span>
              <input
                type="date"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)]"
                value={createStart}
                onChange={(e) => setCreateStart(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)]">End (YYYY-MM-DD)</span>
              <input
                type="date"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)]"
                value={createEnd}
                onChange={(e) => setCreateEnd(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-lg bg-[var(--sidebar-active-bg)] px-4 text-sm font-medium disabled:opacity-50"
            >
              Create
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Existing years</h2>
          {loading ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">Loading…</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">No financial years yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                    <th className="py-2 pr-4 font-medium">Label</th>
                    <th className="py-2 pr-4 font-medium">Start</th>
                    <th className="py-2 pr-4 font-medium">End</th>
                    <th className="py-2 pr-4 font-medium">Default</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)]/60">
                      {editingId === row.id ? (
                        <>
                          <td className="py-2 pr-2">
                            <input
                              className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1"
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="date"
                              className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="date"
                              className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1"
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-2 text-[var(--text-muted)]">—</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded-md bg-[var(--sidebar-active-bg)] px-3 py-1 text-xs font-medium disabled:opacity-50"
                                onClick={() => void onSaveEdit(row.id)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-[var(--border)] px-3 py-1 text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-[var(--text-primary)]">{row.label}</td>
                          <td className="py-2 pr-4 tabular-nums text-[var(--text-muted)]">{row.startDate}</td>
                          <td className="py-2 pr-4 tabular-nums text-[var(--text-muted)]">{row.endDate}</td>
                          <td className="py-2 pr-4">
                            {row.isDefaultForApis ? (
                              <span className="rounded-full ax-fill-ok/20 px-2 py-0.5 text-xs">Yes</span>
                            ) : (
                              <span className="text-[var(--text-muted)]">No</span>
                            )}
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
