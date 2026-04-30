"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Mic, Bot, User } from "lucide-react";
import { hasPermission, Permission } from "@/lib/auth";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import type { AssistantMeetingContext } from "@/lib/assistant-types";
import { postAssistantQuery } from "@/src/lib/services/assistantService";

type Message = { role: "user" | "assistant"; content: string };

export type ConversationalAIProps = {
  variant?: "default" | "meeting";
  meetingContext?: AssistantMeetingContext;
  /** When true, fills parent height (e.g. meeting panel) instead of viewport modal height */
  embedded?: boolean;
};

function renderMd(text: string) {
  if (!text) return "";
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>")
    .replace(
      /\| ([^|]+) \| ([^|]+) \|/g,
      '<div style="display:flex;gap:24px;font-size:11px;border-bottom:1px solid var(--border);padding:3px 0"><span style="min-width:160px;color:var(--text-secondary)">$1</span><span style="color:var(--text-primary);font-weight:600">$2</span></div>',
    );
}

export default function ConversationalAI({
  variant = "default",
  meetingContext,
  embedded = false,
}: ConversationalAIProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const user = useHydratedCurrentUser();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const scopeLabel = useMemo(() => {
    if (!user) return "Guest";
    if (!hasPermission(user, Permission.VIEW_ALL_DATA)) {
      return "Assigned schemes only";
    }
    if (isReadOnlyWatermarkUser(user)) {
      return "Read-only (all schemes)";
    }
    return "All schemes";
  }, [user]);

  const suggestedQueries = useMemo(() => {
    if (variant === "meeting") {
      return [
        "Show agenda topics for this meeting",
        "List action items linked to this meeting",
        "Summarise financial position for this FY",
        "Show KPI submission status",
        "Show overdue actions across HUDD",
        "Command centre overview of schemes and lapse risk",
      ];
    }
    const base = [
      "Show me overdue action items",
      "Which schemes have lapse risk this month?",
      "Summarise KPI submissions awaiting approval",
      "Which financial entries are pending review?",
      "Command centre overview of schemes and lapse risk",
    ];
    if (user && hasPermission(user, Permission.ENTER_KPI_DATA) && !hasPermission(user, Permission.ENTER_FINANCIAL_DATA)) {
      return ["Which KPIs are pending for my schemes?", "Show KPI completion for PMAY-U", ...base];
    }
    if (
      user &&
      hasPermission(user, Permission.ENTER_FINANCIAL_DATA) &&
      !hasPermission(user, Permission.ENTER_KPI_DATA)
    ) {
      return ["Show expenditure status for SUJALA", "Which entries are overdue?", ...base];
    }
    return base;
  }, [user, variant]);

  async function send(q?: string) {
    const query = q ?? input.trim();
    if (!query) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: query }]);
    setLoading(true);
    try {
      const { answer } = await postAssistantQuery({
        query,
        meetingContext: variant === "meeting" && meetingContext ? meetingContext : undefined,
      });
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? `**Could not load data.** ${error.message}`
              : "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const rootStyle = embedded
    ? undefined
    : ({
        padding: "24px",
        height: "calc(100vh - 48px)",
      } as const);

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-col gap-0 overflow-hidden bg-[var(--bg-card)]"
          : "flex flex-col gap-0 bg-[var(--bg-card)]"
      }
      style={rootStyle}
    >
      <div className={embedded ? "mb-3 shrink-0 px-1" : "mb-4"} style={embedded ? undefined : { marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Ask Assistant</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {variant === "meeting"
            ? "Ask for live HUDD data — financials, KPIs, agenda, actions, or command centre overview"
            : "Conversational intelligence — answers use live dashboard data"}
        </p>
        {variant === "meeting" && meetingContext?.title && (
          <p style={{ fontSize: 12, color: "var(--accent)", marginTop: 6 }}>Meeting: {meetingContext.title}</p>
        )}
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Current access: {scopeLabel}</p>
      </div>

      <div
        className={embedded ? "min-h-0 flex-1 overflow-y-auto" : ""}
        style={
          embedded
            ? { display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }
            : { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }
        }
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              flexDirection: m.role === "user" ? "row-reverse" : "row",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: m.role === "user" ? "var(--text-primary)" : "var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {m.role === "user" ? (
                <User size={13} style={{ color: "var(--bg-primary)" }} />
              ) : (
                <Bot size={13} style={{ color: "var(--text-primary)" }} />
              )}
            </div>
            <div
              style={{
                maxWidth: "78%",
                background: m.role === "user" ? "var(--text-primary)" : "var(--bg-card)",
                color: m.role === "user" ? "var(--bg-primary)" : "var(--text-primary)",
                border: m.role === "user" ? "none" : "1px solid var(--border)",
                borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: 1.6,
              }}
              dangerouslySetInnerHTML={{ __html: renderMd(m.content) }}
            />
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bot size={13} />
            </div>
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px 12px 12px 2px",
                padding: "12px 14px",
              }}
            >
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--text-muted)",
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div
        className="shrink-0"
        style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}
      >
        {suggestedQueries.map((sq) => (
          <button
            key={sq}
            type="button"
            onClick={() => send(sq)}
            style={{
              fontSize: 11,
              padding: "5px 10px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 20,
              cursor: "pointer",
              color: "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {sq}
          </button>
        ))}
      </div>

      <div className="shrink-0" style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={
            variant === "meeting"
              ? "Ask for agenda, finances, KPIs, actions, or overview…"
              : "Ask about any scheme, ULB, budget, or action point…"
          }
          style={{
            flex: 1,
            padding: "12px 16px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={!input.trim()}
          style={{
            padding: "0 18px",
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: input.trim() ? 1 : 0.4,
          }}
        >
          <Send size={14} />
        </button>
        <button
          type="button"
          style={{
            padding: "0 14px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
          title="Voice input (coming soon)"
        >
          <Mic size={14} />
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.1)} }
      `}</style>
    </div>
  );
}
