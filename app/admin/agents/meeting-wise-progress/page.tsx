"use client";

import { useEffect, useState, useTransition } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission } from "@/lib/auth";
import { ArrowLeft, Play, Save, CheckCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantLocale } from "@/lib/tenant-config/format";

type Config = {
  enabled: boolean;
  runDay: string;
  mode: string;
  updatedAt?: string;
};

type HistoryLog = {
  id: string;
  runDate: string;
  modeUsed: string;
  status: string;
  insights: Array<{ title: string; body?: string; status?: string; description?: string }>;
  errorLog: string | null;
  executionLogs: string | null;
};

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ANALYSIS_MODES = [
  { value: "RULE_BASED", label: "Rule-Based Only (Fast, Deterministic)" },
  { value: "LLM_BASED", label: "LLM-Based Only (Generative - Qwen/Kimi)" },
  { value: "BOTH", label: "Hybrid (LLM Insights with Rules Fallback)" },
];

export default function MeetingWiseProgressAgentPage() {
  useRequireAnyPermission([Permission.MANAGE_PERMISSIONS, Permission.MANAGE_FINANCIAL_YEARS], "/dashboard");

  const [config, setConfig] = useState<Config>({ enabled: true, runDay: "Monday", mode: "BOTH" });
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<HistoryLog | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ success: boolean; error?: string; insights?: Array<{ title: string; body: string }> } | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchConfigAndHistory = async () => {
    try {
      const [configRes, historyRes] = await Promise.all([
        fetch(withNextBasePath("/api/v1/admin/agent/config")),
        fetch(withNextBasePath("/api/v1/admin/agent/run")),
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig({
          enabled: configData.enabled,
          runDay: configData.runDay,
          mode: configData.mode,
          updatedAt: configData.updatedAt,
        });
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData);
      }
    } catch (e) {
      console.error("Failed to load configuration", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfigAndHistory();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(withNextBasePath("/api/v1/admin/agent/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (response.ok) {
        alert("Agent configuration saved successfully!");
        void fetchConfigAndHistory();
      } else {
        alert("Failed to save configuration.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerRun = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const response = await fetch(withNextBasePath("/api/v1/admin/agent/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: config.mode }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setRunResult({ success: true });
        void fetchConfigAndHistory();
      } else {
        setRunResult({ success: false, error: data.error || "Execution failed." });
      }
    } catch (err: any) {
      setRunResult({ success: false, error: err.message || "Network error." });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Meeting-wise Progress Agent">
        <div className="flex h-[50vh] items-center justify-center text-[var(--ax-muted)]">
          <Clock className="mr-2 h-5 w-5 animate-spin" /> Loading agent configuration...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Meeting-wise Progress Agent">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        {/* Back Link */}
        <div className="flex items-center gap-2 text-sm text-[var(--ax-muted)]">
          <Link href="/admin/agents" className="flex items-center gap-1 hover:text-[var(--color-text)]">
            <ArrowLeft className="h-4 w-4" /> Agent Directory
          </Link>
        </div>

        {/* Heading */}
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--ax-muted)]">AI & Rules Scheduler</p>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Meeting-wise Progress Agent</h1>
          <p className="mt-1 text-sm text-[var(--ax-muted)]">
            Configure the background agent that compares snapshots and reports progress since the last review meeting.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Config Settings Form */}
          <div className="md:col-span-2 space-y-6">
            <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Scheduler Settings</h2>
              <form onSubmit={handleSave} className="mt-4 space-y-4">
                {/* Enabled checkbox */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="agent-enabled"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--ax-on-accent)] accent-[var(--ax-divider-strong)]"
                  />
                  <div>
                    <label htmlFor="agent-enabled" className="text-sm font-medium text-[var(--color-text)]">
                      Enable Monitoring Agent
                    </label>
                    <p className="text-xs text-[var(--ax-muted)]">
                      When enabled, the agent runs in the background on the designated schedule.
                    </p>
                  </div>
                </div>

                {/* Day of Week */}
                <div className="space-y-1.5">
                  <label htmlFor="run-day" className="text-sm font-medium text-[var(--color-text)]">
                    Execution Day
                  </label>
                  <select
                    id="run-day"
                    value={config.runDay}
                    disabled={!config.enabled}
                    onChange={(e) => setConfig({ ...config, runDay: e.target.value })}
                    className="w-full rounded-xl border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] disabled:opacity-50"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        Every {d}
                      </option>
                    ))}
                  </select>
                </div>



                {/* Submit button */}
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-[var(--color-text)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </form>
            </div>

            {/* Run History */}
            <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Execution Logs</h2>
              <p className="text-xs text-[var(--ax-muted)]">Previous agent runs and insights outcomes.</p>

              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-divider)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--ax-row-alt)] text-xs uppercase tracking-wider text-[var(--ax-muted)]">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Insights Summary</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-divider)]">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-[var(--ax-muted)]">
                          No history logs found. Run the agent manually to create log entries.
                        </td>
                      </tr>
                    ) : (
                      history.map((log) => (
                        <tr key={log.id} className="hover:bg-[var(--ax-row-alt)]">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--ax-muted)]">
                            {new Date(log.runDate).toLocaleString(tenantLocale(), {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold">{log.modeUsed}</td>
                          <td className="px-4 py-3 text-xs">
                            {log.status === "SUCCESS" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ax-status-ok-tint)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ax-status-ok)]">
                                <CheckCircle className="h-3 w-3" /> SUCCESS
                              </span>
                            ) : (
                              <span
                                className="ax-chip ax-chip-critical px-2 py-0.5 text-[10px] font-semibold"
                                title={log.errorLog || ""}
                              >
                                <AlertTriangle className="h-3 w-3" /> FAILED
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--ax-muted)]">
                            {log.insights && log.insights.length > 0 ? (
                              <div className="space-y-1.5">
                                {log.insights.map((ins, i) => (
                                  <div key={i} className="text-xs">
                                    <strong className="text-[var(--color-text)]">{ins.title}:</strong>{" "}
                                    <span className="font-semibold text-[var(--color-text)]">{ins.status}</span>
                                    {ins.description && <span className="text-[var(--ax-muted)]"> — {ins.description}</span>}
                                    {!ins.description && ins.body && <span className="text-[var(--ax-muted)]"> — {ins.body}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : log.errorLog ? (
                              <div className="max-w-xs truncate font-mono text-[10px] ax-tone-critical">{log.errorLog}</div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLog(log);
                                setModalOpen(true);
                              }}
                              className="font-semibold text-[var(--color-text)] underline hover:text-[var(--ax-muted)]"
                            >
                              View Logs
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Manual Run Override Box */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Manual Trigger</h2>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ax-muted)]">
                Bypass the scheduler and run the analysis right now. This evaluates progress since the last meeting using
                the current configuration mode.
              </p>

              <button
                type="button"
                onClick={handleTriggerRun}
                disabled={running}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-text)] py-3 text-sm font-semibold text-[var(--color-bg)] transition hover:opacity-90 disabled:opacity-50"
              >
                {running ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Running Agent...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Trigger Agent Run Now
                  </>
                )}
              </button>

              {/* Run output */}
              {runResult && (
                <div className="mt-4 rounded-xl border border-[var(--color-divider)] p-4 text-xs">
                  {runResult.success ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--ax-status-ok)]">
                        <CheckCircle className="h-4 w-4" /> Agent execution completed.
                      </div>
                      <p className="text-[10px] text-[var(--ax-muted)]">
                        Insights have been calculated, saved, and loaded to the dashboard.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold ax-tone-critical">
                        <AlertTriangle className="h-4 w-4" /> Run failed.
                      </div>
                      <div className="max-h-24 overflow-y-auto rounded bg-[var(--ax-row-alt)] p-1.5 font-mono text-[9px] text-[var(--ax-muted)]">
                        {runResult.error}
                      </div>
                    </div>
                  )}
                </div>
              )}
        </div>
      </div>
    </div>
  </div>
  {modalOpen && selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center ax-scrim backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-divider)] pb-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Execution Details</h3>
                <p className="text-xs text-[var(--ax-muted)]">
                  Run Date: {new Date(selectedLog.runDate).toLocaleString(tenantLocale())} · Mode: {selectedLog.modeUsed}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setSelectedLog(null);
                }}
                className="rounded-lg p-1 text-[var(--ax-muted)] hover:bg-[var(--ax-row-alt)] hover:text-[var(--color-text)]"
              >
                Close
              </button>
            </div>

            {/* Error log if failed */}
            {selectedLog.status !== "SUCCESS" && selectedLog.errorLog && (
              <div className="ax-chip ax-chip-critical block w-full p-4 space-y-1">
                <h4 className="text-xs font-bold">Execution Error Stack</h4>
                <pre className="overflow-x-auto font-mono text-[10px] whitespace-pre-wrap">
                  {selectedLog.errorLog}
                </pre>
              </div>
            )}

            {/* Execution Steps */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-[var(--color-text)]">Agent Tools & Execution Steps</h4>
              {selectedLog.executionLogs ? (() => {
                try {
                  const steps = JSON.parse(selectedLog.executionLogs);
                  if (Array.isArray(steps)) {
                    return (
                      <div className="space-y-3">
                        {steps.map((step: any, idx: number) => {
                          const isLLM = step.name === "LLM Selection & Refinement";
                          return (
                            <div key={idx} className="rounded-xl border border-[var(--color-divider)] bg-[var(--ax-row-alt)] p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[var(--color-text)]">
                                  {idx + 1}. {step.name}
                                </span>
                                {step.success !== undefined && (
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                    step.success ? "ax-chip ax-chip-ok" : "ax-chip ax-chip-critical"
                                  }`}>
                                    {step.success ? "SUCCESS" : "FAILED"}
                                  </span>
                                )}
                              </div>
                              {step.details && (
                                <p className="text-xs text-[var(--ax-muted)] leading-relaxed">
                                  {step.details}
                                </p>
                              )}
                              
                              {/* If LLM step, show prompt and response */}
                              {isLLM && (
                                <div className="grid gap-3 pt-2 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ax-muted)]">LLM Prompt</span>
                                    <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] p-2.5 font-mono text-[10px] text-[var(--ax-muted)] whitespace-pre-wrap">
                                      {step.prompt}
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ax-muted)]">LLM Response</span>
                                    <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] p-2.5 font-mono text-[10px] text-[var(--color-text)] whitespace-pre-wrap">
                                      {step.response}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                } catch {
                  // Fallback if not valid JSON
                }
                return (
                  <pre className="overflow-x-auto rounded-xl border border-[var(--color-divider)] bg-[var(--ax-row-alt)] p-4 font-mono text-[10px] text-[var(--ax-muted)] whitespace-pre-wrap">
                    {selectedLog.executionLogs}
                  </pre>
                );
              })() : (
                <p className="text-xs text-[var(--ax-muted)] italic">No detailed execution steps logged for this run.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
