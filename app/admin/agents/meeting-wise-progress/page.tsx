"use client";

import { useEffect, useState, useTransition } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission } from "@/lib/auth";
import { ArrowLeft, Play, Save, CheckCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import Link from "next/link";

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
        fetch("/hudd-dashboard/api/v1/admin/agent/config"),
        fetch("/hudd-dashboard/api/v1/admin/agent/run"),
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
      const response = await fetch("/hudd-dashboard/api/v1/admin/agent/config", {
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
      const response = await fetch("/hudd-dashboard/api/v1/admin/agent/run", {
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
        <div className="flex h-[50vh] items-center justify-center text-[var(--text-muted)]">
          <Clock className="mr-2 h-5 w-5 animate-spin" /> Loading agent configuration...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Meeting-wise Progress Agent">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        {/* Back Link */}
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Link href="/admin/agents" className="flex items-center gap-1 hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-4 w-4" /> Agent Directory
          </Link>
        </div>

        {/* Heading */}
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">AI & Rules Scheduler</p>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Meeting-wise Progress Agent</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Configure the background agent that compares snapshots and reports progress since the last review meeting.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Config Settings Form */}
          <div className="md:col-span-2 space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Scheduler Settings</h2>
              <form onSubmit={handleSave} className="mt-4 space-y-4">
                {/* Enabled checkbox */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="agent-enabled"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-card)] text-[var(--accent-text)] accent-[var(--border-strong)]"
                  />
                  <div>
                    <label htmlFor="agent-enabled" className="text-sm font-medium text-[var(--text-primary)]">
                      Enable Monitoring Agent
                    </label>
                    <p className="text-xs text-[var(--text-muted)]">
                      When enabled, the agent runs in the background on the designated schedule.
                    </p>
                  </div>
                </div>

                {/* Day of Week */}
                <div className="space-y-1.5">
                  <label htmlFor="run-day" className="text-sm font-medium text-[var(--text-primary)]">
                    Execution Day
                  </label>
                  <select
                    id="run-day"
                    value={config.runDay}
                    disabled={!config.enabled}
                    onChange={(e) => setConfig({ ...config, runDay: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50"
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
                  className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </form>
            </div>

            {/* Run History */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Execution Logs</h2>
              <p className="text-xs text-[var(--text-muted)]">Previous agent runs and insights outcomes.</p>

              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--bg-alternate-card)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Insights Summary</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                          No history logs found. Run the agent manually to create log entries.
                        </td>
                      </tr>
                    ) : (
                      history.map((log) => (
                        <tr key={log.id} className="hover:bg-[var(--bg-alternate-card)]">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-muted)]">
                            {new Date(log.runDate).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold">{log.modeUsed}</td>
                          <td className="px-4 py-3 text-xs">
                            {log.status === "SUCCESS" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--alert-success-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--alert-success)]">
                                <CheckCircle className="h-3 w-3" /> SUCCESS
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/30 px-2 py-0.5 text-[10px] font-semibold text-red-600"
                                title={log.errorLog || ""}
                              >
                                <AlertTriangle className="h-3 w-3" /> FAILED
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                            {log.insights && log.insights.length > 0 ? (
                              <div className="space-y-1.5">
                                {log.insights.map((ins, i) => (
                                  <div key={i} className="text-xs">
                                    <strong className="text-[var(--text-primary)]">{ins.title}:</strong>{" "}
                                    <span className="font-semibold text-[var(--text-primary)]">{ins.status}</span>
                                    {ins.description && <span className="text-[var(--text-muted)]"> — {ins.description}</span>}
                                    {!ins.description && ins.body && <span className="text-[var(--text-muted)]"> — {ins.body}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : log.errorLog ? (
                              <div className="max-w-xs truncate font-mono text-[10px] text-red-500">{log.errorLog}</div>
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
                              className="font-semibold text-[var(--text-primary)] underline hover:text-[var(--text-muted)]"
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
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Manual Trigger</h2>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                Bypass the scheduler and run the analysis right now. This evaluates progress since the last meeting using
                the current configuration mode.
              </p>

              <button
                type="button"
                onClick={handleTriggerRun}
                disabled={running}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] py-3 text-sm font-semibold text-[var(--bg-primary)] transition hover:opacity-90 disabled:opacity-50"
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
                <div className="mt-4 rounded-xl border border-[var(--border)] p-4 text-xs">
                  {runResult.success ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--alert-success)]">
                        <CheckCircle className="h-4 w-4" /> Agent execution completed.
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        Insights have been calculated, saved, and loaded to the dashboard.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold text-red-500">
                        <AlertTriangle className="h-4 w-4" /> Run failed.
                      </div>
                      <div className="max-h-24 overflow-y-auto rounded bg-[var(--bg-alternate-card)] p-1.5 font-mono text-[9px] text-[var(--text-muted)]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Execution Details</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Run Date: {new Date(selectedLog.runDate).toLocaleString("en-IN")} · Mode: {selectedLog.modeUsed}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setSelectedLog(null);
                }}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-alternate-card)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>

            {/* Error log if failed */}
            {selectedLog.status !== "SUCCESS" && selectedLog.errorLog && (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 p-4 space-y-1">
                <h4 className="text-xs font-bold text-red-700 dark:text-red-400">Execution Error Stack</h4>
                <pre className="overflow-x-auto font-mono text-[10px] text-red-600 dark:text-red-300 whitespace-pre-wrap">
                  {selectedLog.errorLog}
                </pre>
              </div>
            )}

            {/* Execution Steps */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Agent Tools & Execution Steps</h4>
              {selectedLog.executionLogs ? (() => {
                try {
                  const steps = JSON.parse(selectedLog.executionLogs);
                  if (Array.isArray(steps)) {
                    return (
                      <div className="space-y-3">
                        {steps.map((step: any, idx: number) => {
                          const isLLM = step.name === "LLM Selection & Refinement";
                          return (
                            <div key={idx} className="rounded-xl border border-[var(--border)] bg-[var(--bg-alternate-card)] p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[var(--text-primary)]">
                                  {idx + 1}. {step.name}
                                </span>
                                {step.success !== undefined && (
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                    step.success ? "bg-[var(--alert-success-bg)] text-[var(--alert-success)]" : "bg-red-100 text-red-700"
                                  }`}>
                                    {step.success ? "SUCCESS" : "FAILED"}
                                  </span>
                                )}
                              </div>
                              {step.details && (
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                  {step.details}
                                </p>
                              )}
                              
                              {/* If LLM step, show prompt and response */}
                              {isLLM && (
                                <div className="grid gap-3 pt-2 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">LLM Prompt</span>
                                    <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5 font-mono text-[10px] text-[var(--text-muted)] whitespace-pre-wrap">
                                      {step.prompt}
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">LLM Response</span>
                                    <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5 font-mono text-[10px] text-[var(--text-primary)] whitespace-pre-wrap">
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
                  <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-alternate-card)] p-4 font-mono text-[10px] text-[var(--text-muted)] whitespace-pre-wrap">
                    {selectedLog.executionLogs}
                  </pre>
                );
              })() : (
                <p className="text-xs text-[var(--text-muted)] italic">No detailed execution steps logged for this run.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
