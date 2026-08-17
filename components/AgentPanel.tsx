"use client";
import { useState } from "react";
import { nbaRecommendations } from "@/lib/data";
import { Zap, BrainCircuit, Activity, Clock, RefreshCw, CheckCircle2 } from "lucide-react";

const agents = [
  {
    id: "fund-velocity",
    name: "Fund Velocity Agent",
    status: "active",
    lastRun: "2 min ago",
    description: "Monitors IFMS disbursement rate vs target pace for each scheme.",
    alert: "UFC at 5.65% — pace implies ₹1,009 Cr lapse. WhatsApp sent to FA HUDD.",
    alertType: "critical",
  },
  {
    id: "compliance",
    name: "Compliance Agent",
    status: "active",
    lastRun: "14 min ago",
    description: "Tracks EFC submission deadlines, Cabinet approvals, audit requirements.",
    alert: "EFC for PMAY enhancement due in 11 days. Reminder sent to FA.",
    alertType: "warning",
  },
  {
    id: "beneficiary",
    name: "Beneficiary Agent",
    status: "active",
    lastRun: "1h ago",
    description: "Monitors scheme linkage progress (SAHAJOG, PMAY, NULM) vs targets.",
    alert: "SAHAJOG at 27.16% — 15 ULBs below trajectory. Recommends TULIUP deployment.",
    alertType: "warning",
  },
  {
    id: "action-point",
    name: "Action Point Agent",
    status: "active",
    lastRun: "6 min ago",
    description: "Tracks all open action items; escalates overdue items up officer hierarchy.",
    alert: "3 items overdue >30d — auto-drafted WhatsApp nudge to CE WATCO, Dir. SBM.",
    alertType: "critical",
  },
  {
    id: "reconciliation",
    name: "Reconciliation Agent",
    status: "idle",
    lastRun: "6h ago",
    description: "Identifies SO-to-IFMS gaps — funds released on paper but not in IFMS.",
    alert: "₹240 Cr SO-IFMS gap in UFC identified. Report routed to Finance Dept liaison.",
    alertType: "warning",
  },
];

const priorityColor: Record<string, string> = {
  critical: "var(--ax-status-critical)",
  high: "var(--ax-status-warning)",
  medium: "var(--ax-muted)",
};

export default function AgentPanel() {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  function runAgent(id: string) {
    setRunning(id);
    setTimeout(() => setRunning(null), 2000);
  }

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)", marginBottom: 4 }}>AI Agentic Engine</h2>
        <p style={{ fontSize: 13, color: "var(--ax-muted)" }}>5 autonomous sub-agents running continuously in the background</p>
      </div>

      {/* Agent grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {agents.map(agent => (
          <div
            key={agent.id}
            onClick={() => setActiveAgent(activeAgent === agent.id ? null : agent.id)}
            style={{
              background: "var(--color-surface)", border: `1px solid ${activeAgent === agent.id ? "var(--color-text)" : "var(--color-divider)"}`,
              borderRadius: 8, padding: "16px", textAlign: "left", cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <BrainCircuit size={16} style={{ color: agent.status === "active" ? "var(--ax-status-ok)" : "var(--ax-muted)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: agent.status === "active" ? "var(--ax-status-ok)" : "var(--ax-divider-strong)" }} />
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8, color: agent.status === "active" ? "var(--ax-status-ok)" : "var(--ax-muted)" }}>
                  {agent.status}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: "var(--ax-muted)", lineHeight: 1.4, marginBottom: 10 }}>{agent.description}</div>
            <div style={{
              fontSize: 11, color: agent.alertType === "critical" ? "var(--ax-status-critical)" : "var(--ax-status-warning)",
              background: agent.alertType === "critical" ? "rgba(204,0,0,0.08)" : "rgba(184,119,0,0.08)",
              padding: "6px 8px", borderRadius: 5, lineHeight: 1.4, marginBottom: 8,
            }}>
              {agent.alert}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--ax-muted)" }}>Last run: {agent.lastRun}</span>
              <button
                onClick={e => { e.stopPropagation(); runAgent(agent.id); }}
                style={{ fontSize: 10, color: "var(--ax-muted)", background: "none", border: "1px solid var(--color-divider)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <RefreshCw size={10} style={{ animation: running === agent.id ? "spin 1s linear infinite" : "none" }} />
                {running === agent.id ? "Running…" : "Run now"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* NBA Recommendations */}
      <div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ax-muted)", marginBottom: 12 }}>Next Best Action Recommendations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {nbaRecommendations.map(r => (
            <div
              key={r.id}
              style={{
                background: "var(--color-surface)", border: "1px solid var(--color-divider)",
                borderLeft: `4px solid ${priorityColor[r.priority]}`,
                borderRadius: 8, padding: "16px",
                display: "grid", gridTemplateColumns: "auto 1fr auto",
                gap: 16, alignItems: "start",
              }}
            >
              <div style={{ paddingTop: 2 }}>
                <Zap size={16} style={{ color: priorityColor[r.priority] }} />
              </div>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "2px 6px", borderRadius: 3, background: r.priority === "critical" ? "rgba(204,0,0,0.1)" : r.priority === "high" ? "rgba(184,119,0,0.1)" : "rgba(0,0,0,0.05)", color: priorityColor[r.priority] }}>{r.priority}</span>
                  <span style={{ fontSize: 10, color: "var(--ax-muted)" }}>{r.scheme}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text)", marginBottom: 6, lineHeight: 1.4 }}>{r.action}</div>
                <div style={{ fontSize: 11, color: "var(--ax-muted)", marginBottom: 4 }}>Evidence: {r.evidence}</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontSize: 11, color: "var(--ax-text-secondary)" }}>Officer: {r.officer}</span>
                  <span style={{ fontSize: 11, color: "var(--ax-text-secondary)" }}>By: {r.deadline}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 120 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ax-status-ok)" }}>{r.impact}</div>
                <button style={{ marginTop: 8, fontSize: 10, padding: "5px 10px", background: "var(--color-text)", color: "var(--color-bg)", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>
                  Act Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
