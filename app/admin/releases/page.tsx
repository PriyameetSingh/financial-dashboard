"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Permission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { withNextBasePath } from "@/lib/next-base-path";
import { Calendar, Rocket, ShieldAlert, Sparkles, Trash2, Wrench, CheckCircle, Plus } from "lucide-react";

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

export default function AdminReleasesPage() {
  const user = useRequireAnyPermission([Permission.MANAGE_FINANCIAL_YEARS], "/dashboard");

  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New Release Form State
  const [newVersion, setNewVersion] = useState("");
  const [newIsCurrent, setNewIsCurrent] = useState(false);

  // New Entry Form State (mapped by release ID)
  const [entryForms, setEntryForms] = useState<Record<string, {
    type: "NEW_FEATURE" | "FIX" | "IMPROVEMENT" | "BREAKING_CHANGE";
    title: string;
    description: string;
  }>>({});

  const loadReleases = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(withNextBasePath("/api/v1/releases"), { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load releases");
      setReleases(data.releases || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadReleases();
    }
  }, [user, loadReleases]);

  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(withNextBasePath("/api/v1/releases"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: newVersion, isCurrent: newIsCurrent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Create release failed");

      setNewVersion("");
      setNewIsCurrent(false);
      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSetCurrent = async (releaseId: string) => {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(withNextBasePath(`/api/v1/releases/${releaseId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCurrent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Update failed");

      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRelease = async (releaseId: string) => {
    if (!confirm("Are you sure you want to delete this release and all of its changelog entries?")) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(withNextBasePath(`/api/v1/releases/${releaseId}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");

      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddEntry = async (releaseId: string, e: React.FormEvent) => {
    e.preventDefault();
    const form = entryForms[releaseId];
    if (!form || !form.title.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(withNextBasePath(`/api/v1/releases/${releaseId}/entries`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          description: form.description || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Add entry failed");

      // Reset form
      setEntryForms((prev) => ({
        ...prev,
        [releaseId]: { type: "NEW_FEATURE", title: "", description: "" },
      }));

      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add entry failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = async (releaseId: string, entryId: string) => {
    if (!confirm("Are you sure you want to delete this changelog entry?")) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(withNextBasePath(`/api/v1/releases/${releaseId}/entries/${entryId}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete entry failed");

      await loadReleases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete entry failed");
    } finally {
      setBusy(false);
    }
  };

  const updateEntryForm = (releaseId: string, field: string, value: string) => {
    setEntryForms((prev) => {
      const current = prev[releaseId] || { type: "NEW_FEATURE", title: "", description: "" };
      return {
        ...prev,
        [releaseId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  if (!user) return null;

  return (
    <AppShell title="Release Management">
      <div className="space-y-6 px-6 py-6 max-w-5xl mx-auto">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Release Management</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Create versions, manage logs, and control which release is currently shown.
          </p>
          <Link href="/admin" className="mt-3 inline-block text-sm text-[var(--text-primary)] underline hover:no-underline">
            &larr; Administration
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
            {error}
          </div>
        )}

        {/* Create Release Block */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Create New Release</h2>
          <form onSubmit={handleCreateRelease} className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4 items-end">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--text-muted)] font-medium">Version</span>
              <input
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                placeholder="1.4.0"
                required
                disabled={busy}
              />
            </label>
            <label className="flex items-center gap-2 text-sm h-10 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={newIsCurrent}
                onChange={(e) => setNewIsCurrent(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] outline-none"
                disabled={busy}
              />
              <span className="text-[var(--text-secondary)] font-medium">Mark as Current Release</span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-lg bg-[var(--sidebar-active-bg)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              Create Release
            </button>
          </form>
        </section>

        {/* Release History & Entry Publisher */}
        <section className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Existing Releases</h2>
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading releases...</p>
          ) : releases.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No releases published yet.</p>
          ) : (
            <div className="space-y-6">
              {releases.map((release) => {
                const dateLabel = new Date(release.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                const form = entryForms[release.id] || { type: "NEW_FEATURE", title: "", description: "" };

                return (
                  <div key={release.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between border-b border-[var(--border)]/50 bg-[var(--bg-document)] px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-[var(--text-primary)]">v{release.version}</span>
                        {release.isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            <CheckCircle size={10} /> Active Current
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetCurrent(release.id)}
                            disabled={busy}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-50 transition"
                          >
                            Mark Current
                          </button>
                        )}
                        <span className="text-xs text-[var(--text-muted)]">{dateLabel}</span>
                      </div>
                      <div>
                        <button
                          onClick={() => handleDeleteRelease(release.id)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
                          title="Delete Release"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>

                    <div className="p-5 grid gap-6 md:grid-cols-[1fr_320px]">
                      {/* Left: Entries list */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Changelog Entries</h3>
                        {release.entries.length === 0 ? (
                          <p className="text-xs italic text-[var(--text-muted)]">No entries published for this version.</p>
                        ) : (
                          <div className="space-y-2">
                            {release.entries.map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)]/60 bg-[var(--bg-primary)]/20 p-3 text-sm"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="rounded bg-[var(--border)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                      {entry.type.replace("_", " ")}
                                    </span>
                                    <span className="font-semibold text-[var(--text-primary)]">{entry.title}</span>
                                  </div>
                                  {entry.description && (
                                    <p className="text-xs text-[var(--text-secondary)] pl-1 whitespace-pre-wrap">{entry.description}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleDeleteEntry(release.id, entry.id)}
                                  disabled={busy}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                  title="Delete entry"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: Form to add entry */}
                      <div className="border-t md:border-t-0 md:border-l border-[var(--border)]/50 pt-5 md:pt-0 md:pl-6 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add Changelog Entry</h3>
                        <form onSubmit={(e) => handleAddEntry(release.id, e)} className="space-y-3">
                          <label className="flex flex-col gap-1 text-xs">
                            <span className="text-[var(--text-muted)] font-medium">Type</span>
                            <select
                              value={form.type}
                              onChange={(e) => updateEntryForm(release.id, "type", e.target.value)}
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                            >
                              <option value="NEW_FEATURE">New Feature</option>
                              <option value="IMPROVEMENT">Improvement</option>
                              <option value="FIX">Fix</option>
                              <option value="BREAKING_CHANGE">Breaking Change</option>
                            </select>
                          </label>

                          <label className="flex flex-col gap-1 text-xs">
                            <span className="text-[var(--text-muted)] font-medium">Title</span>
                            <input
                              value={form.title}
                              onChange={(e) => updateEntryForm(release.id, "title", e.target.value)}
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                              placeholder="Describe feature or fix..."
                              required
                              disabled={busy}
                            />
                          </label>

                          <label className="flex flex-col gap-1 text-xs">
                            <span className="text-[var(--text-muted)] font-medium">Description (Optional)</span>
                            <textarea
                              value={form.description}
                              onChange={(e) => updateEntryForm(release.id, "description", e.target.value)}
                              rows={2}
                              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none resize-none"
                              placeholder="Detail explanation (optional)..."
                              disabled={busy}
                            />
                          </label>

                          <button
                            type="submit"
                            disabled={busy || !form.title.trim()}
                            className="flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-primary)] hover:opacity-90 disabled:opacity-50 transition"
                          >
                            <Plus size={12} /> Add Entry
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
