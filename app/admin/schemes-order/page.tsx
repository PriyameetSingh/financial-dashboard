"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { Permission } from "@/lib/auth";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { withNextBasePath } from "@/lib/next-base-path";
import { ArrowUp, ArrowDown, Search, Check, Save } from "lucide-react";
import type { SchemeOverview } from "@/types";

export default function SchemesOrderPage() {
  const user = useRequireAnyPermission([Permission.REORDER_SCHEMES], "/dashboard");

  const [schemes, setSchemes] = useState<SchemeOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [subschemesMap, setSubschemesMap] = useState<Record<string, Array<{ id: string; code: string; name: string }>>>({});

  const [schemesSaving, setSchemesSaving] = useState(false);
  const [subschemesSaving, setSubschemesSaving] = useState(false);
  const [schemesSuccess, setSchemesSuccess] = useState(false);
  const [subschemesSuccess, setSubschemesSuccess] = useState(false);

  // Track initial arrays to check for changes
  const [initialSchemeIds, setInitialSchemeIds] = useState<string[]>([]);
  const [initialSubschemesMap, setInitialSubschemesMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(withNextBasePath("/api/v1/schemes/overview?archived=false"), { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load schemes");
        const data = await res.json();
        if (!active) return;

        const fetchedSchemes = data.schemes as SchemeOverview[];
        setSchemes(fetchedSchemes);
        setInitialSchemeIds(fetchedSchemes.map((s) => s.id));

        const subMap: Record<string, Array<{ id: string; code: string; name: string }>> = {};
        const initSubMap: Record<string, string[]> = {};
        for (const s of fetchedSchemes) {
          subMap[s.id] = s.subschemes.map((sub) => ({ id: sub.id, code: sub.code, name: sub.name }));
          initSubMap[s.id] = s.subschemes.map((sub) => sub.id);
        }
        setSubschemesMap(subMap);
        setInitialSubschemesMap(initSubMap);

        if (fetchedSchemes.length > 0) {
          setSelectedSchemeId(fetchedSchemes[0].id);
        }
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredSchemes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return schemes;
    return schemes.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.verticalName.toLowerCase().includes(q)
    );
  }, [schemes, searchQuery]);

  const activeScheme = useMemo(() => {
    return schemes.find((s) => s.id === selectedSchemeId) || null;
  }, [schemes, selectedSchemeId]);

  const activeSubschemes = useMemo(() => {
    if (!selectedSchemeId) return [];
    return subschemesMap[selectedSchemeId] || [];
  }, [subschemesMap, selectedSchemeId]);

  const schemesOrderChanged = useMemo(() => {
    const currentIds = schemes.map((s) => s.id);
    if (currentIds.length !== initialSchemeIds.length) return true;
    return currentIds.some((id, idx) => id !== initialSchemeIds[idx]);
  }, [schemes, initialSchemeIds]);

  const subschemesOrderChanged = useMemo(() => {
    if (!selectedSchemeId) return false;
    const currentIds = (subschemesMap[selectedSchemeId] || []).map((s) => s.id);
    const initialIds = initialSubschemesMap[selectedSchemeId] || [];
    if (currentIds.length !== initialIds.length) return true;
    return currentIds.some((id, idx) => id !== initialIds[idx]);
  }, [subschemesMap, initialSubschemesMap, selectedSchemeId]);

  const handleMoveScheme = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= filteredSchemes.length) return;

    // Find the elements in the master 'schemes' array to swap
    const itemA = filteredSchemes[index];
    const itemB = filteredSchemes[nextIndex];
    const masterIndexA = schemes.findIndex((s) => s.id === itemA.id);
    const masterIndexB = schemes.findIndex((s) => s.id === itemB.id);

    if (masterIndexA === -1 || masterIndexB === -1) return;

    const updated = [...schemes];
    updated[masterIndexA] = itemB;
    updated[masterIndexB] = itemA;
    setSchemes(updated);
  };

  const handleMoveSubscheme = (index: number, direction: "up" | "down") => {
    if (!selectedSchemeId) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    const currentList = subschemesMap[selectedSchemeId] || [];
    if (nextIndex < 0 || nextIndex >= currentList.length) return;

    const updatedList = [...currentList];
    const temp = updatedList[index];
    updatedList[index] = updatedList[nextIndex];
    updatedList[nextIndex] = temp;

    setSubschemesMap((prev) => ({
      ...prev,
      [selectedSchemeId]: updatedList,
    }));
  };

  const handleSaveSchemesOrder = async () => {
    setSchemesSaving(true);
    setSchemesSuccess(false);
    setError(null);

    const schemeIds = schemes.map((s) => s.id);

    try {
      const res = await fetch(withNextBasePath("/api/v1/schemes/reorder"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemeIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to update schemes order");
      }
      setInitialSchemeIds(schemeIds);
      setSchemesSuccess(true);
      setTimeout(() => setSchemesSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSchemesSaving(false);
    }
  };

  const handleSaveSubschemesOrder = async () => {
    if (!selectedSchemeId) return;
    setSubschemesSaving(true);
    setSubschemesSuccess(false);
    setError(null);

    const currentList = subschemesMap[selectedSchemeId] || [];
    const subschemeIds = currentList.map((s) => s.id);

    try {
      const res = await fetch(withNextBasePath("/api/v1/subschemes/reorder"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subschemeIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to update subschemes order");
      }
      setInitialSubschemesMap((prev) => ({
        ...prev,
        [selectedSchemeId]: subschemeIds,
      }));
      setSubschemesSuccess(true);
      setTimeout(() => setSubschemesSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSubschemesSaving(false);
    }
  };

  if (!user) return null;

  return (
    <AppShell title="Reorder Schemes & Subschemes">
      <div className="space-y-6 px-6 py-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Priority Reordering</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Arrange the display order of schemes on the dashboard, and sorting orders of subschemes inside them.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--alert-critical)] bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-[var(--alert-critical)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[var(--text-muted)]">Loading registry items...</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column: Schemes */}
            <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Schemes Order</h3>
                  <p className="text-xs text-[var(--text-muted)]">Move schemes up and down to change priority.</p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveSchemesOrder}
                  disabled={schemesSaving || !schemesOrderChanged}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-text)] shadow transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {schemesSaving ? "Saving..." : schemesSuccess ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Saved
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" /> Save Order
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-document)] px-3 py-2">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Filter schemes by name, code or vertical..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                />
              </div>

              <div className="mt-4 max-h-[500px] overflow-y-auto space-y-2 pr-1">
                {filteredSchemes.map((scheme, idx) => {
                  const isSelected = scheme.id === selectedSchemeId;
                  return (
                    <div
                      key={scheme.id}
                      onClick={() => setSelectedSchemeId(scheme.id)}
                      className={`group flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-all ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--bg-content-surface)] ring-1 ring-[var(--accent)]"
                          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-document)]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--bg-surface-text)]">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-sm truncate text-[var(--text-primary)]">
                            {scheme.name}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)] pl-7">
                          {scheme.verticalName} · Code: {scheme.code}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 pl-2 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveScheme(idx, "up");
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)] disabled:opacity-30 disabled:hover:bg-[var(--bg-card)] disabled:hover:text-[var(--text-secondary)]"
                          aria-label="Move Up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === filteredSchemes.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveScheme(idx, "down");
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)] disabled:opacity-30 disabled:hover:bg-[var(--bg-card)] disabled:hover:text-[var(--text-secondary)]"
                          aria-label="Move Down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredSchemes.length === 0 && (
                  <p className="py-8 text-center text-xs text-[var(--text-muted)]">No schemes match search query.</p>
                )}
              </div>
            </div>

            {/* Right Column: Subschemes */}
            <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Subschemes inside Scheme</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {activeScheme ? `Adjusting order for: ${activeScheme.name}` : "Select a scheme from the left list."}
                  </p>
                </div>
                {activeScheme && activeSubschemes.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSaveSubschemesOrder}
                    disabled={subschemesSaving || !subschemesOrderChanged}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-text)] shadow transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    {subschemesSaving ? "Saving..." : subschemesSuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Saved
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" /> Save Order
                      </>
                    )}
                  </button>
                )}
              </div>

              {!activeScheme ? (
                <div className="flex flex-1 flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                  <p className="text-sm">Please select a scheme on the left to see and reorder its subschemes.</p>
                </div>
              ) : activeSubschemes.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                  <p className="text-sm">This scheme has no subschemes.</p>
                  <p className="text-xs mt-1">Sorting is only available for schemes with nested components.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-2 max-h-[564px] overflow-y-auto pr-1">
                  {activeSubschemes.map((sub, idx) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3.5 transition-all hover:border-[var(--border-strong)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[var(--bg-document)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-sm text-[var(--text-primary)]">
                            {sub.name}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)] pl-7">
                          Code: {sub.code}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 pl-2">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveSubscheme(idx, "up")}
                          className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)] disabled:opacity-30 disabled:hover:bg-[var(--bg-card)] disabled:hover:text-[var(--text-secondary)]"
                          aria-label="Move Up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeSubschemes.length - 1}
                          onClick={() => handleMoveSubscheme(idx, "down")}
                          className="flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)] disabled:opacity-30 disabled:hover:bg-[var(--bg-card)] disabled:hover:text-[var(--text-secondary)]"
                          aria-label="Move Down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
