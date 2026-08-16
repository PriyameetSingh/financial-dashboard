"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  X,
  FileText,
  LineChart,
  Target,
  TrendingUp,
  ListTodo,
  CirclePlus,
  Bot,
} from "lucide-react";
import { hasPermission, Permission } from "@/lib/auth";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { addMeetingTopic, type MeetingListItem } from "@/src/lib/services/meetingService";
import { getFinancialYear } from "../meetingUtils";
import PresentationsPanel from "./PresentationsPanel";
import FinancialMeetingPanel from "./FinancialMeetingPanel";
import KpiMeetingPanel from "./KpiMeetingPanel";
import SinceLastMeetingPanel from "./SinceLastMeetingPanel";
import ActionItemsMeetingPanel from "./ActionItemsMeetingPanel";
import CreateActionItemMeetingModal from "./CreateActionItemMeetingModal";
import ConversationalAI from "@/components/ConversationalAI";

export type MeetingPanelId =
  | "presentations"
  | "financial"
  | "kpis"
  | "since_last"
  | "action_items"
  | "assistant";

const PANELS: Array<{
  id: MeetingPanelId;
  label: string;
  icon: typeof FileText;
}> = [
  { id: "presentations", label: "Presentations", icon: FileText },
  { id: "financial", label: "Financial", icon: LineChart },
  { id: "kpis", label: "KPIs", icon: Target },
  { id: "since_last", label: "Since last meeting", icon: TrendingUp },
  { id: "action_items", label: "Action items", icon: ListTodo },
  { id: "assistant", label: "Urban Assistant", icon: Bot },
];

type MeetingTopicRow = { id: string; topic: string };

function AgendaTodoPanel({
  topics,
  discussedIds,
  onToggleDiscussed,
  newTopicText,
  onNewTopicTextChange,
  onAddTopic,
  addingTopic,
  topicAddError,
  compact,
  className = "",
}: {
  topics: MeetingTopicRow[];
  discussedIds: Set<string>;
  onToggleDiscussed: (id: string) => void;
  newTopicText: string;
  onNewTopicTextChange: (v: string) => void;
  onAddTopic: () => void;
  addingTopic?: boolean;
  topicAddError?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const canSubmit = newTopicText.trim().length > 0 && !addingTopic;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--ax-status-critical)]">Important Topics for discussion</p>
        <span className="rounded-md bg-[var(--color-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--ax-muted)]">
          {topics.length}
        </span>
      </div>
      {/* <p className={`mb-2 text-[var(--ax-muted)] ${compact ? "text-[10px] leading-snug" : "text-xs"}`}>
        
      </p> */}

      <ul className={`space-y-0.5 ${compact ? "max-h-[min(28vh,220px)]" : ""} overflow-y-auto pr-0.5`}>
        {topics.map((t, idx) => {
          const discussed = discussedIds.has(t.id);
          return (
            <li key={t.id}>
              <div className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--color-bg)] sm:gap-2.5 sm:px-2 sm:py-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDiscussed(t.id);
                  }}
                  className="mt-0.5 shrink-0 rounded-md p-0.5 text-[var(--ax-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)]"
                  aria-label={discussed ? "Mark as not discussed" : "Mark as discussed"}
                  title={discussed ? "Discussed" : "Mark discussed"}
                >
                  {discussed ? (
                    <CheckCircle2 size={compact ? 15 : 17} className="text-[var(--ax-status-ok)]" aria-hidden />
                  ) : (
                    <Circle size={compact ? 15 : 17} className="text-[var(--color-divider)]" strokeWidth={1.75} aria-hidden />
                  )}
                </button>
                <span
                  className={`min-w-0 flex-1 text-sm leading-snug ${
                    discussed ? "text-[var(--ax-muted)] line-through opacity-75" : "text-[var(--color-text)]"
                  }`}
                >
                  <span className="mr-1.5 inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded bg-[var(--color-bg)] px-1 text-[10px] font-semibold text-[var(--ax-muted)]">
                    {idx + 1}
                  </span>
                  {t.topic}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {topics.length === 0 && (
        <p className="mb-2 text-xs text-[var(--ax-muted)]">No topics yet. Add one below.</p>
      )}

      <div className={`mt-3 flex gap-2 border-t border-[var(--color-divider)] pt-3 ${compact ? "flex-col" : ""}`}>
        <input
          type="text"
          value={newTopicText}
          disabled={addingTopic}
          onChange={(e) => onNewTopicTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              onAddTopic();
            }
          }}
          placeholder="New topic…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] px-2.5 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--ax-muted)] focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/25 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onAddTopic}
          disabled={!canSubmit}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--ax-on-accent)] transition-opacity hover:opacity-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <Plus size={16} aria-hidden />
          {addingTopic ? "Saving…" : "Add"}
        </button>
      </div>
      {topicAddError && (
        <p className="mt-2 text-xs text-[var(--ax-status-critical)]" role="alert">
          {topicAddError}
        </p>
      )}
    </div>
  );
}

export default function ActiveMeetingOverlay({
  meeting,
  allMeetings,
  onClose,
  onActionItemCreated,
  onTopicAdded,
}: {
  meeting: MeetingListItem;
  allMeetings: MeetingListItem[];
  onClose: () => void;
  onActionItemCreated?: () => void | Promise<void>;
  onTopicAdded?: () => void | Promise<void>;
}) {
  const materials = meeting.materials ?? [];
  const [panel, setPanel] = useState<MeetingPanelId>(() =>
    materials.length > 0 ? "presentations" : "financial",
  );

  const effectivePanel: MeetingPanelId =
    panel === "presentations" && materials.length === 0 ? "financial" : panel;

  const [elapsed, setElapsed] = useState(0);
  const [showCreateActionItem, setShowCreateActionItem] = useState(false);
  /** Session-only "discussed" flags; not persisted */
  const [discussedIds, setDiscussedIds] = useState<Set<string>>(() => new Set());
  const [newTopicText, setNewTopicText] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [topicAddError, setTopicAddError] = useState<string | null>(null);

  const sessionUser = useHydratedCurrentUser();
  const canCreateActionItem = hasPermission(sessionUser, Permission.CREATE_ACTION_ITEMS);

  const toggleDiscussed = (id: string) => {
    setDiscussedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addTopic = async () => {
    const topic = newTopicText.trim();
    if (!topic || addingTopic) return;
    setTopicAddError(null);
    setAddingTopic(true);
    try {
      await addMeetingTopic(meeting.id, topic);
      setNewTopicText("");
      await onTopicAdded?.();
    } catch (e) {
      setTopicAddError(e instanceof Error ? e.message : "Could not save topic");
    } finally {
      setAddingTopic(false);
    }
  };

  useEffect(() => {
    const t = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h > 0 ? String(h).padStart(2, "0") + ":" : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const agendaPanelProps = {
    topics: meeting.topics,
    discussedIds,
    onToggleDiscussed: toggleDiscussed,
    newTopicText,
    onNewTopicTextChange: (v: string) => {
      setTopicAddError(null);
      setNewTopicText(v);
    },
    onAddTopic: addTopic,
    addingTopic,
    topicAddError,
  } as const;

  const panelLabel = PANELS.find((p) => p.id === effectivePanel)?.label ?? "";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--color-bg)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[var(--color-accent)]/6 blur-[100px]" />
        <div className="absolute -bottom-32 -right-32 h-[380px] w-[380px] rounded-full bg-[var(--color-accent)]/4 blur-[100px]" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-[var(--color-divider)] bg-[var(--color-surface)] shadow-sm">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-[var(--color-accent)]">Live meeting</p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-[var(--color-text)] sm:text-xl">
              {meeting.title ?? "Untitled Meeting"}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--ax-muted)]">
              {meeting.meetingDate} · FY {getFinancialYear(meeting.meetingDate)}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 md:gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2">
              <Clock size={15} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
              <span className="font-mono text-sm font-semibold tabular-nums text-[var(--color-text)]">
                {fmtTime(elapsed)}
              </span>
            </div>

            {canCreateActionItem && (
              <button
                id="btn-meeting-quick-action-item"
                type="button"
                onClick={() => setShowCreateActionItem(true)}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 px-3 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/18"
              >
                <CirclePlus size={16} aria-hidden />
                <span className="hidden sm:inline">Action item</span>
              </button>
            )}

            <button
              id="btn-end-meeting"
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 rounded-lg border border-[var(--ax-status-critical)]/35 bg-[var(--ax-status-critical)]/[0.07] px-3 py-2 text-sm font-medium text-[var(--ax-status-critical)] transition-colors hover:bg-[var(--ax-status-critical)]/15"
            >
              <X size={16} aria-hidden /> <span className="hidden sm:inline">End meeting</span>
              <span className="sm:hidden">End</span>
            </button>
          </div>
        </div>

        <nav
          className="flex gap-1.5 overflow-x-auto border-t border-[var(--color-divider)] px-3 py-2.5 sm:px-8"
          aria-label="Meeting sections"
        >
          {PANELS.map(({ id, label, icon: Icon }) => {
            if (id === "presentations" && materials.length === 0) return null;
            const active = effectivePanel === id;
            /*
             * The assistant tab carries the AI accent rather than the tenant's.
             * "A machine is answering here" is a property of the product, not of
             * the organization, so it is the one colour on this bar a tenant
             * cannot rebrand — and it is never the only signal: the tab is
             * labelled "Urban Assistant" and carries the bot glyph.
             */
            const isAi = id === "assistant";
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPanel(id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? isAi
                      ? "ax-ai-tab-active"
                      : "ax-accent-panel"
                    : isAi
                      ? "ax-ai-kicker hover:bg-[var(--color-bg)]"
                      : "ax-tone-muted hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
                }`}
              >
                <Icon size={14} className="shrink-0 opacity-90" aria-hidden />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[min(100%,20rem)] shrink-0 overflow-y-auto border-r border-[var(--color-divider)] bg-[var(--color-surface)] p-4 md:block lg:w-80 lg:p-5">
          <AgendaTodoPanel {...agendaPanelProps} />
        </aside>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg)]/80">
          <div className="shrink-0 border-b border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-3 md:hidden">
            <AgendaTodoPanel {...agendaPanelProps} compact />
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
            {effectivePanel !== "assistant" && (
              <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--ax-muted)]">{panelLabel}</p>
            )}

            {effectivePanel === "presentations" && materials.length > 0 && (
              <div className="space-y-4 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
                <PresentationsPanel meetingId={meeting.id} materials={materials} />
              </div>
            )}

            {effectivePanel === "financial" && (
              <div className="space-y-4 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
                <FinancialMeetingPanel
                  key={getFinancialYear(meeting.meetingDate)}
                  financialYearLabel={getFinancialYear(meeting.meetingDate)}
                />
              </div>
            )}

            {effectivePanel === "kpis" && (
              <div className="space-y-4 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
                <KpiMeetingPanel />
              </div>
            )}

            {effectivePanel === "since_last" && (
              <div className="space-y-4 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
                <SinceLastMeetingPanel key={meeting.id} meeting={meeting} allMeetings={allMeetings} />
              </div>
            )}

            {effectivePanel === "action_items" && (
              <div className="space-y-4 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
                <ActionItemsMeetingPanel meeting={meeting} />
              </div>
            )}

            {effectivePanel === "assistant" && (
              <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                <div className="ax-ai-section card elev-sm flex min-h-[min(70vh,560px)] flex-1 flex-col overflow-hidden p-3 sm:p-4">
                  <ConversationalAI
                    variant="meeting"
                    embedded
                    meetingContext={{
                      meetingId: meeting.id,
                      meetingDate: meeting.meetingDate,
                      title: meeting.title ?? null,
                      financialYearLabel: getFinancialYear(meeting.meetingDate),
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {canCreateActionItem && (
        <CreateActionItemMeetingModal
          open={showCreateActionItem}
          onClose={() => setShowCreateActionItem(false)}
          meetingId={meeting.id}
          meetingLabel={`${meeting.meetingDate}${meeting.title ? ` — ${meeting.title}` : ""}`}
          onCreated={onActionItemCreated}
        />
      )}
    </div>
  );
}
