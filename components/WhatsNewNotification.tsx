"use client";

import { useEffect, useState } from "react";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { withNextBasePath } from "@/lib/next-base-path";
import { Sparkles, X, Rocket, Wrench, ShieldAlert } from "lucide-react";

type Entry = {
  id: string;
  type: "NEW_FEATURE" | "FIX" | "IMPROVEMENT" | "BREAKING_CHANGE";
  title: string;
  description: string | null;
};

type Release = {
  id: string;
  version: string;
  isCurrent: boolean;
  entries: Entry[];
};

const TYPE_CONFIG = {
  NEW_FEATURE: {
    label: "New",
    bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    icon: Rocket,
  },
  IMPROVEMENT: {
    label: "Refined",
    bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    icon: Sparkles,
  },
  FIX: {
    label: "Fix",
    bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    icon: Wrench,
  },
  BREAKING_CHANGE: {
    label: "Important",
    bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    icon: ShieldAlert,
  },
};

export default function WhatsNewNotification() {
  const user = useHydratedCurrentUser();
  const [unseenReleases, setUnseenReleases] = useState<Release[]>([]);
  const [currentRelease, setCurrentRelease] = useState<Release | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    // The notification is only surfaced to the TASU role
    if (user.role !== "TASU") return;

    let active = true;
    void fetch(withNextBasePath("/api/v1/releases/unseen"), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (active && data?.releases?.length > 0) {
          setUnseenReleases(data.releases);
          setCurrentRelease(data.releases[0]); // Show the newest unseen release
          setIsOpen(true);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user]);

  const handleDismiss = async () => {
    if (!currentRelease) return;

    try {
      const res = await fetch(
        withNextBasePath(`/api/v1/releases/${currentRelease.id}/dismiss`),
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (res.ok) {
        // Find next unseen release, if any
        const remaining = unseenReleases.filter((r) => r.id !== currentRelease.id);
        setUnseenReleases(remaining);
        if (remaining.length > 0) {
          setCurrentRelease(remaining[0]);
        } else {
          setCurrentRelease(null);
          setIsOpen(false);
        }
      }
    } catch {
      // Hide locally even if request fails to avoid blocking the user
      setIsOpen(false);
    }
  };

  if (!isOpen || !currentRelease) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-2xl animate-in slide-in-from-bottom duration-300"
      role="dialog"
      aria-labelledby="whats-new-title"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sidebar-active-bg)] text-white shadow-sm">
            <Sparkles size={16} className="animate-pulse" />
          </span>
          <div>
            <h3 id="whats-new-title" className="text-sm font-semibold text-[var(--text-primary)]">
              What's New in HUDD
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">Release v{currentRelease.version}</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--bg-primary)] transition"
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 max-h-60 overflow-y-auto space-y-3 pr-1">
        {currentRelease.entries.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">A new release has been deployed.</p>
        ) : (
          currentRelease.entries.map((entry) => {
            const conf = TYPE_CONFIG[entry.type] || TYPE_CONFIG.IMPROVEMENT;
            return (
              <div key={entry.id} className="space-y-1">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider border shrink-0 ${conf.bg}`}>
                    {conf.label}
                  </span>
                  <p className="text-xs font-semibold text-[var(--text-primary)] leading-normal">
                    {entry.title}
                  </p>
                </div>
                {entry.description && (
                  <p className="text-[11px] text-[var(--text-secondary)] pl-2 leading-relaxed">
                    {entry.description}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 pt-3 border-t border-[var(--border)]/50 flex items-center justify-between gap-3">
        <a
          href={withNextBasePath("/changelog")}
          className="text-xs font-semibold text-[var(--accent)] hover:underline"
          onClick={() => setIsOpen(false)}
        >
          View all release notes &rarr;
        </a>
        <button
          onClick={handleDismiss}
          className="rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--bg-primary)] hover:opacity-90 transition shadow-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
