"use client";

import { Bot, Menu, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import ConversationalAI from "@/components/ConversationalAI";
import WhatsNewNotification from "@/components/WhatsNewNotification";
import { NotificationDropdown } from "@/src/components/ui/NotificationDropdown";

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function AppShell({ children, title }: Props) {
  const { mounted } = useTheme();
  const user = useHydratedCurrentUser();
  const [chatOpen, setChatOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("hudd-sidebar-collapsed");
    if (stored !== null) {
      return stored === "true";
    }
    return window.innerWidth < 768;
  });

  useEffect(() => {
    localStorage.setItem("hudd-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

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
            <div className="flex items-center justify-between gap-3 min-w-0 flex-1">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--sidebar-text-primary)]"
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
                    <span className="inline md:hidden">HUDD Odisha</span>
                    <span className="hidden md:inline">Housing & Urban Development Department</span>
                  </p>
                  {title && <p className="truncate text-sm text-[var(--text-muted)]">{title}</p>}
                </div>
              </div>

              {/* Mobile Notifications dropdown */}
              <div className="relative md:hidden shrink-0">
                <NotificationDropdown align="right" />
              </div>
            </div>
            <div className="hidden md:flex flex-wrap items-center gap-2 text-sm text-[var(--text-on-dark-muted)] sm:gap-3 lg:ml-auto lg:justify-end">
              <span className="hidden text-xs text-[var(--text-muted)] 2xl:inline">{mounted ? nowLabel : ""}</span>
              <NotificationDropdown align="right" />
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
          <div className="relative z-50">{children}</div>
        </main>
      </div>
      {chatOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-6">
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
      {/* Floating Urban Assistant button (FAB) */}
      <button
        className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--sidebar-text-primary)] hover:bg-[var(--sidebar-hover-bg)] shadow-2xl transition-transform hover:scale-105 active:scale-95 border border-[var(--sidebar-border)] cursor-pointer"
        onClick={() => setChatOpen(true)}
        type="button"
        aria-label="Urban Assistant Chatbot"
      >
        <Bot size={24} />
      </button>
      <WhatsNewNotification />
    </div>
  );
}
