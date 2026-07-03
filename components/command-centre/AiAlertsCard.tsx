"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Settings, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { Permission, hasPermission } from "@/lib/auth";

type Insight = {
  title: string;
  body: string;
};

type LatestInsight = {
  id: string;
  runDate: string;
  modeUsed: string;
  status: string;
  insights: Insight[];
};

export default function AiAlertsCard({ className = "" }: { className?: string }) {
  const [insight, setInsight] = useState<LatestInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useHydratedCurrentUser();
  const isAdmin = user && (hasPermission(user, Permission.MANAGE_PERMISSIONS) || hasPermission(user, Permission.MANAGE_FINANCIAL_YEARS));

  const fetchLatestInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/hudd-dashboard/api/v1/dashboard/ai-alerts", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load insights");
      const data = await res.json();
      setInsight(data.latestInsight);
    } catch (e: any) {
      console.error(e);
      setError("Failed to load active monitors.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLatestInsight();
  }, []);

  const formatRelativeTime = (isoString: string) => {
    try {
      const runDate = new Date(isoString);
      const diffMs = Date.now() - runDate.getTime();
      const diffMin = Math.floor(diffMs / (60 * 1000));
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);

      if (diffMin < 1) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      return `${diffDay}d ago`;
    } catch {
      return "";
    }
  };

  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3.5 ${className}`}
      style={{ borderStyle: "solid" }}
    >
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">Progress Monitor</span>
        {insight && (
          <span className="text-[9.5px] font-medium text-[var(--text-muted)]">
            Last report generated: {formatRelativeTime(insight.runDate)}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3 py-2 animate-pulse">
          <div className="space-y-1">
            <div className="h-3 w-1/4 rounded bg-[var(--border)]" />
            <div className="h-2.5 w-full rounded bg-[var(--border)]" />
          </div>
          <div className="h-[1px] w-full bg-[var(--border)]" />
          <div className="space-y-1">
            <div className="h-3 w-1/3 rounded bg-[var(--border)]" />
            <div className="h-2.5 w-full rounded bg-[var(--border)]" />
          </div>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 py-2 text-xs text-red-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : !insight || !insight.insights || insight.insights.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-[var(--text-muted)]">No monitoring logs compiled yet.</p>
          {isAdmin ? (
            <Link
              href="/admin/agents"
              className="mt-2 inline-block text-[10px] text-[var(--text-primary)] underline underline-offset-2 hover:opacity-85"
            >
              Setup agent & trigger run
            </Link>
          ) : (
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Contact an admin to configure scheduler.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {insight.insights.map((a, i) => (
            <li key={i} className="border-b border-[var(--border)] pb-2.5 last:border-0 last:pb-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">{a.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
