"use client";

import AppShell from "@/components/AppShell";
import { Permission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { withNextBasePath } from "@/lib/next-base-path";
import { Search, Plus, Edit2, Check, X, Loader2 } from "lucide-react";

type EntityTab = "organisations" | "verticals" | "sections" | "ulbs" | "designations";

interface MasterDataItem {
  id: string;
  name: string;
  code?: string; // only Verticals have code
}

const TABS: Array<{ id: EntityTab; label: string; description: string }> = [
  { id: "organisations", label: "Organisations", description: "Manage organizational entities that map to users and data boundaries." },
  { id: "verticals", label: "Verticals", description: "Manage sectors/verticals (e.g. Housing, Water, SBM) containing schemes." },
  { id: "sections", label: "Sections", description: "Manage internal sections (e.g. Accounts, PHE, Municipal-II) assigned to officers." },
  { id: "ulbs", label: "ULBs", description: "Manage Urban Local Bodies (Municipal Corporations, Municipalities, etc.)." },
  { id: "designations", label: "Designations", description: "Manage professional designations of officers in the department." },
];

export default function AdminSystemSettingsPage() {
  const user = useRequireAnyPermission(
    [Permission.MANAGE_PERMISSIONS, Permission.MANAGE_FINANCIAL_YEARS],
    "/dashboard",
  );

  const [activeTab, setActiveTab] = useState<EntityTab>("organisations");
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create form state
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState(""); // Verticals only

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState(""); // Verticals only

  // Load items for the current active tab
  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(withNextBasePath(`/api/v1/admin/${activeTab}`), { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { detail?: string };
      if (!res.ok) throw new Error(data.detail ?? res.statusText);

      // Extract items based on the active tab key
      const key = activeTab;
      const fetchedItems = (data[key] ?? []) as MasterDataItem[];
      setItems(fetchedItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load master data items.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    void load();
    // Clear notifications and input state on tab change
    setError(null);
    setSuccess(null);
    setNewName("");
    setNewCode("");
    setEditingId(null);
    setSearchQuery("");
  }, [user, activeTab, load]);

  // Create handler
  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || (activeTab === "verticals" && !newCode.trim())) {
      setError("Please fill out all required fields.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, string> = { name: newName.trim() };
      if (activeTab === "verticals") {
        payload.code = newCode.trim().toUpperCase();
      }

      const res = await fetch(withNextBasePath(`/api/v1/admin/${activeTab}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as { detail?: string; name: string };
      if (!res.ok) throw new Error(data.detail ?? res.statusText);

      setSuccess(`Successfully added "${data.name}".`);
      setNewName("");
      setNewCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item.");
    } finally {
      setBusy(false);
    }
  }

  // Start editing handler
  function startEdit(item: MasterDataItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCode(item.code ?? "");
    setError(null);
    setSuccess(null);
  }

  // Save edit handler
  async function onSaveEdit(id: string) {
    if (!editName.trim() || (activeTab === "verticals" && !editCode.trim())) {
      setError("Please fill out all required fields.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, string> = { name: editName.trim() };
      if (activeTab === "verticals") {
        payload.code = editCode.trim().toUpperCase();
      }

      const res = await fetch(withNextBasePath(`/api/v1/admin/${activeTab}/${id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as { detail?: string; name: string };
      if (!res.ok) throw new Error(data.detail ?? res.statusText);

      setSuccess(`Successfully updated to "${data.name}".`);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update item.");
    } finally {
      setBusy(false);
    }
  }

  // Filter items based on query
  const filteredItems = items.filter((item) => {
    const query = searchQuery.toLowerCase();
    const matchesName = item.name.toLowerCase().includes(query);
    const matchesCode = item.code ? item.code.toLowerCase().includes(query) : false;
    return matchesName || matchesCode;
  });

  const activeTabMeta = TABS.find((t) => t.id === activeTab) || TABS[0];

  if (!user) return null;

  return (
    <AppShell title="System Settings">
      <div className="space-y-6 px-6 py-6 max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-[var(--border)] pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mt-1">System Settings</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Configure master directories used across workflows, user metadata, and profiles.
            </p>
            <Link href="/admin" className="mt-3 inline-flex items-center text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline">
              ← Back to Administration
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
                activeTab === tab.id
                  ? "border-[var(--text-primary)] text-[var(--text-primary)] font-bold"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-sm">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{activeTabMeta.label} Directory</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{activeTabMeta.description}</p>
        </div>

        {/* Notification Feedback */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center justify-between" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-200 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center justify-between" role="alert">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-emerald-200 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Add Form */}
          <div className="lg:col-span-1">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
                <Plus className="w-5 h-5 text-[var(--text-primary)]" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                  Add {activeTabMeta.label.slice(0, -1)}
                </h3>
              </div>
              <form onSubmit={onCreate} className="space-y-4">
                {activeTab === "verticals" && (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="new-code" className="text-sm font-medium text-[var(--text-primary)]">
                      Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="new-code"
                      type="text"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)] focus:border-[var(--text-primary)] focus:ring-1 focus:ring-[var(--text-primary)] outline-none transition"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="e.g. WATER"
                      required
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label htmlFor="new-name" className="text-sm font-medium text-[var(--text-primary)]">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="new-name"
                    type="text"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)] focus:border-[var(--text-primary)] focus:ring-1 focus:ring-[var(--text-primary)] outline-none transition"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`e.g. ${activeTab === "verticals" ? "Water Supply" : activeTab === "ulbs" ? "Bhubaneswar MC" : "New Entry"}`}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-10 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
              </form>
            </section>
          </div>

          {/* List & Search */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder={`Search ${activeTabMeta.label.toLowerCase()} by name${activeTab === "verticals" ? " or code" : ""}...`}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:border-[var(--text-primary)] focus:ring-1 focus:ring-[var(--text-primary)] outline-none transition shadow-sm text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Items Card */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-muted)]">Loading directory items...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 text-sm text-[var(--text-muted)]">
                  {items.length === 0 ? `No ${activeTabMeta.label.toLowerCase()} registered in the system.` : "No matches found."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                        {activeTab === "verticals" && <th className="pb-3 pr-4 font-semibold uppercase tracking-wider text-xs">Code</th>}
                        <th className="pb-3 pr-4 font-semibold uppercase tracking-wider text-xs">Name</th>
                        <th className="pb-3 font-semibold uppercase tracking-wider text-xs text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/40">
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="group hover:bg-[var(--bg-primary)]/30 transition-colors">
                          {editingId === item.id ? (
                            <>
                              {activeTab === "verticals" && (
                                <td className="py-3 pr-2">
                                  <input
                                    type="text"
                                    className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm uppercase"
                                    value={editCode}
                                    onChange={(e) => setEditCode(e.target.value)}
                                  />
                                </td>
                              )}
                              <td className="py-3 pr-2">
                                <input
                                  type="text"
                                  className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                />
                              </td>
                              <td className="py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 p-1.5 text-white disabled:opacity-50 transition"
                                    onClick={() => void onSaveEdit(item.id)}
                                    title="Save changes"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] transition"
                                    onClick={() => setEditingId(null)}
                                    title="Cancel"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              {activeTab === "verticals" && (
                                <td className="py-3.5 pr-4 font-mono font-semibold text-[var(--text-primary)]">
                                  {item.code}
                                </td>
                              )}
                              <td className="py-3.5 pr-4 text-[var(--text-primary)] font-medium">
                                {item.name}
                              </td>
                              <td className="py-3.5 text-right">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 hover:bg-[var(--bg-primary)] hover:border-[var(--border-strong)] transition"
                                  onClick={() => startEdit(item)}
                                >
                                  <Edit2 className="w-3 h-3" />
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
        </div>
      </div>
    </AppShell>
  );
}
