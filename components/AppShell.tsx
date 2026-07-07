"use client";

import { Bell, Bot, Menu, ChevronLeft, ChevronRight, FlaskConical, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import TextSizeToolbarControl from "@/components/TextSizeToolbarControl";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import ConversationalAI from "@/components/ConversationalAI";
import WhatsNewNotification from "@/components/WhatsNewNotification";

type MockApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: unknown }
  | { status: "error"; message: string };

function MockApiButton() {
  const [state, setState] = useState<MockApiState>({ status: "idle" });
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const callApi = useCallback(async () => {
    setState({ status: "loading" });
    setPanelOpen(true);
    try {
      const res = await fetch("/hudd-dashboard/api/v1/test");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ status: "success", data });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Request failed" });
    }
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (panelOpen && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [panelOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => void callApi()}
        disabled={state.status === "loading"}
        className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-60"
        aria-label="Call mock API"
      >
        <FlaskConical size={14} />
        <span className="hidden xl:inline">
          {state.status === "loading" ? "Calling…" : "Test API"}
        </span>
      </button>

      {panelOpen && state.status !== "idle" && (
        <div className="absolute right-0 top-full z-40 mt-2 w-96 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Mock API Response
            </span>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-3">
            {state.status === "loading" && (
              <p className="py-4 text-center text-xs text-[var(--text-muted)]">Fetching…</p>
            )}
            {state.status === "error" && (
              <p className="rounded-lg border border-[var(--alert-critical)] bg-[rgba(229,62,62,0.08)] px-3 py-2 text-xs text-[var(--alert-critical)]">
                Error: {state.message}
              </p>
            )}
            {state.status === "success" && (
              <pre className="max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-[11px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words">
                {JSON.stringify(state.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function AppShell({ children, title }: Props) {
  const { mounted } = useTheme();
  const user = useHydratedCurrentUser();
  const [chatOpen, setChatOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setTimeout(() => {
        setIsSidebarCollapsed(true);
      }, 0);
    }
  }, []);

  const isViewer = isReadOnlyWatermarkUser(user);

  const nowLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
      timeZoneName: "short",
    });
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationMenuOpen && notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [notificationMenuOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar isCollapsed={isSidebarCollapsed} />
      {!isSidebarCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsSidebarCollapsed(true)}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 md:px-6 md:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <span className="hidden md:inline">
                  {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </span>
                <span className="inline md:hidden">
                  {isSidebarCollapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
                </span>
              </button>
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-[var(--sidebar-text-primary)] md:text-lg">
                  Housing & Urban Development Department
                </p>
                {title && <p className="truncate text-sm text-[var(--text-muted)]">{title}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-on-dark-muted)] sm:gap-3 lg:ml-auto lg:justify-end">
              <TextSizeToolbarControl />
              <MockApiButton />
              <button
                className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-secondary)]"
                onClick={() => setChatOpen(true)}
                type="button"
              >
                <Bot size={14} />
                <span className="hidden xl:inline">Urban Assistant</span>
              </button>
              <span className="hidden text-xs text-[var(--text-muted)] 2xl:inline">{mounted ? nowLabel : ""}</span>
              <div className="relative" ref={notificationsRef}>
                <button
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)]"
                  aria-label="Notifications"
                  aria-expanded={notificationMenuOpen}
                  onClick={() => {
                    setNotificationMenuOpen((open) => !open);
                  }}
                  type="button"
                >
                  <Bell size={16} />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--alert-critical)]" />
                </button>
                {notificationMenuOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Notifications</p>
                    <ul className="mt-3 space-y-2 text-sm text-[var(--sidebar-text-primary)]">
                      <li className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                        No new notifications.
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className="relative flex-1 overflow-y-auto">
          {isViewer && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-[80px] font-bold uppercase tracking-[0.6em] text-[var(--text-muted)] opacity-10 rotate-[-12deg]">
                Read Only
              </div>
            </div>
          )}
          <div className="relative z-20">{children}</div>
        </main>
      </div>
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="relative h-full w-full max-w-4xl rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
            <button
              className="absolute right-4 top-4 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]"
              onClick={() => setChatOpen(false)}
              type="button"
            >
              Close
            </button>
            <ConversationalAI />
          </div>
        </div>
      )}
      <WhatsNewNotification />
    </div>
  );
}
