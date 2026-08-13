"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission } from "@/lib/auth";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Sparkles,
  ShieldAlert,
  Mail,
  CheckCircle,
  AlertTriangle,
  Clock,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantLocale } from "@/lib/tenant-config/format";

type Config = {
  enabled: boolean;
  runDay: string;
  mode: string;
};

type HistoryLog = {
  id: string;
  runDate: string;
  status: string;
  errorLog: string | null;
};

export default function AdminAgentsDirectoryPage() {
  useRequireAnyPermission([Permission.MANAGE_PERMISSIONS, Permission.MANAGE_FINANCIAL_YEARS], "/dashboard");

  const [config, setConfig] = useState<Config | null>(null);
  const [lastLog, setLastLog] = useState<HistoryLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [configRes, historyRes] = await Promise.all([
          fetch(withNextBasePath("/api/v1/admin/agent/config")),
          fetch(withNextBasePath("/api/v1/admin/agent/run")),
        ]);

        if (configRes.ok) {
          const configData = await configRes.json();
          setConfig(configData);
        }

        if (historyRes.ok) {
          const historyData: HistoryLog[] = await historyRes.json();
          if (historyData.length > 0) {
            setLastLog(historyData[0]);
          }
        }
      } catch (e) {
        console.error("Failed to load agent dashboard statistics", e);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  return (
    <AppShell title="Agent Directory">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        {/* Back Link */}
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Link href="/admin" className="flex items-center gap-1 hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-4 w-4" /> Admin Controls
          </Link>
        </div>

        {/* Heading */}
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">System Monitors</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Background AI Agents</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Overview and controls for automated agents running scheduled analysis, notification dispatches, and rule engines.
          </p>
        </div>

        {loading ? (
          <div className="flex h-[30vh] items-center justify-center text-[var(--text-muted)]">
            <Clock className="mr-2 h-5 w-5 animate-spin" /> Loading agents...
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* 1. Meeting-wise Progress Agent Card */}
            <div className="group relative flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 transition hover:border-[var(--border-strong)]">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    {config?.enabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--alert-success-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--alert-success)]">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Meeting-wise Progress Agent
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    Compares financial and operational snapshots since the last review meeting. Generates leadership insights
                    and alerts displayed on the Command Centre.
                  </p>
                </div>

                {/* Additional Metadata / Scheduled detail */}
                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
                  <div className="flex justify-between">
                    <span>Schedule:</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {config?.enabled ? `Every ${config.runDay}` : "Disabled"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Run:</span>
                    <span className="flex items-center gap-1 font-medium text-[var(--text-primary)]">
                      {lastLog ? (
                        <>
                          {lastLog.status === "SUCCESS" ? (
                            <CheckCircle className="h-3 w-3 text-[var(--alert-success)]" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          )}
                          {new Date(lastLog.runDate).toLocaleString(tenantLocale(), {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </>
                      ) : (
                        "Never Run"
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4">
                <Link
                  href="/admin/agents/meeting-wise-progress"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] transition hover:opacity-90"
                >
                  <Settings2 className="h-4 w-4" />
                  Configure & Trigger
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* 2. Finance Audit Monitor Card (Future) */}
            <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/50 p-6 opacity-75">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      Under Dev
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Finance Audit Monitor</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    Scans live ledger tables and budget line entries to detect pacing anomalies or over-allocation hazards before they occur.
                  </p>
                </div>

                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
                  <div className="flex justify-between">
                    <span>Schedule:</span>
                    <span className="font-medium text-[var(--text-primary)]">Daily (Midnight)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Audits:</span>
                    <span className="font-medium text-[var(--text-primary)]">Pacing, Threshold alerts</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4">
                <button
                  disabled
                  className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                >
                  Unavailable
                </button>
              </div>
            </div>

            {/* 3. Action Item Emailer Agent Card (Future) */}
            <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/50 p-6 opacity-75">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      Inactive
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Action Item Reminder</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    Aggregates critical deadlines and compiles scheduled email updates to departmental officers for upcoming or overdue tasks.
                  </p>
                </div>

                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
                  <div className="flex justify-between">
                    <span>Schedule:</span>
                    <span className="font-medium text-[var(--text-primary)]">Every Friday</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target:</span>
                    <span className="font-medium text-[var(--text-primary)]">Nodal Officers & ACS</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4">
                <button
                  disabled
                  className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                >
                  Unavailable
                </button>
              </div>
            </div>

            {/* 4. Ad-hoc Assistant Agent Card (Future) */}
            <div className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/50 p-6 opacity-75">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <Bot className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      Inactive
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Ad-hoc query Assistant</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    Enables conversational natural language inquiries on budget snapshots, scheme progress files, and meeting minutes.
                  </p>
                </div>

                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
                  <div className="flex justify-between">
                    <span>Interface:</span>
                    <span className="font-medium text-[var(--text-primary)]">Command Centre Ask Input</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="font-medium text-[var(--text-primary)]">Pre-Alpha Testing</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4">
                <button
                  disabled
                  className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                >
                  Unavailable
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
