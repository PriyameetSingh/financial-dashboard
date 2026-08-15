"use client";

import { Bot, Menu, ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { isReadOnlyWatermarkUser } from "@/src/lib/read-only-watermark";
import ConversationalAI from "@/components/ConversationalAI";
import WhatsNewNotification from "@/components/WhatsNewNotification";
import { NotificationDropdown } from "@/src/components/ui/NotificationDropdown";
import { tenantTimezone, tenantLocale } from "@/lib/tenant-config/format";
import NocturneRoot from "@/components/nocturne/NocturneRoot";
import { tenantConfig } from "@/lib/tenant-config";

interface Props {
  children: React.ReactNode;
  title?: string;
}

/**
 * The authenticated app's frame — the sidebar, the top bar and the region the
 * screens render into.
 *
 * RESKIN NOTE. This component wraps everything below it in a `NocturneRoot`,
 * which is what puts the whole authenticated product on the Nocturne token
 * layer. Screens that have not yet been through their tranche still paint
 * themselves through the pre-reskin custom properties, and those resolve here
 * because `legacy-bridge.css` maps each one onto its Nocturne token. So the
 * frame and its contents share one palette from this change onward, and each
 * later tranche replaces bridge names with real primitives rather than
 * introducing a second look.
 *
 * THE SIDEBAR IS A DARK ISLAND. It carries `data-theme="dark"` whatever the
 * reader's preference, which is the borrowed treatment from the company design
 * guide. Expressed as a nested theme rather than a private palette, so the
 * tenant's own dark-theme accent still reaches the most visible chrome in the
 * product — a hardcoded sidebar palette would have quietly excluded the one
 * surface every officer looks at all day from white-labelling.
 */
export default function AppShell({ children, title }: Props) {
  const { mounted, theme, setTheme } = useTheme();
  // Read rather than passed as a prop: this component is mounted from thirty
  // page files, and threading the tenant's brand through every one of them
  // would be thirty chances to forget. `tenantConfig()` reads the request-scoped
  // holder on the server and the browser-side one after hydration — both primed
  // by the root layout, which is the Phase 2 machinery this rides on.
  const { themeOverrides } = tenantConfig();
  const user = useHydratedCurrentUser();
  const [chatOpen, setChatOpen] = useState(false);
  // SSR default: collapsed. Prevents a flash of the expanded sidebar overlapping
  // content on mobile before hydration. Desktop expands after mount if needed.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);

  // On mount, decide the correct initial state for the current viewport.
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
    // Mobile: the sidebar is a drawer and must always start closed,
      // regardless of any preference persisted from a desktop session.
      setIsSidebarCollapsed(true);
    } else {
      const stored = localStorage.getItem("hudd-sidebar-collapsed");
      setIsSidebarCollapsed(stored !== null ? stored === "true" : false);
    }
    setSidebarHydrated(true);
  }, []);

  // Persist the preference on desktop only — mobile is always a drawer.
  useEffect(() => {
    if (!sidebarHydrated) return;
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      localStorage.setItem("hudd-sidebar-collapsed", String(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed, sidebarHydrated]);

  // Auto-close the drawer when the viewport shrinks to mobile.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 768) setIsSidebarCollapsed(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isViewer = isReadOnlyWatermarkUser(user);

  const nowLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleString(tenantLocale(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tenantTimezone(),
      timeZoneName: "short",
    });
  }, []);

  return (
    <NocturneRoot
      theme={theme}
      overrides={themeOverrides}
      className="flex h-screen overflow-hidden bg-[var(--color-bg)]"
    >
      <Sidebar isCollapsed={isSidebarCollapsed} />
      {!isSidebarCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--color-neutral-900)_70%,transparent)] md:hidden"
          onClick={() => setIsSidebarCollapsed(true)}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="ax-app-topbar px-4 py-3 md:px-6 md:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex items-center justify-between gap-3 min-w-0 flex-1">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="btn btn-secondary h-8 w-8 !p-0"
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
                  <p className="truncate text-base font-medium text-[var(--color-text)] md:text-lg">
                    <span className="inline md:hidden">HUDD Odisha</span>
                    <span className="hidden md:inline">Housing & Urban Development Department</span>
                  </p>
                  {title && <p className="truncate text-sm text-[var(--ax-muted)]">{title}</p>}
                </div>
              </div>

              {/* Mobile Notifications dropdown */}
              <div className="relative md:hidden shrink-0">
                <NotificationDropdown align="right" />
              </div>
            </div>
            <div className="hidden md:flex flex-wrap items-center gap-2 text-sm text-[var(--ax-muted)] sm:gap-3 lg:ml-auto lg:justify-end">
              <span className="hidden text-xs text-[var(--ax-muted)] 2xl:inline">{mounted ? nowLabel : ""}</span>
              {/* The reader's own choice of ground. Rendered only after mount,
                  because before it the stored preference is not known and the
                  button would claim the wrong state. */}
              {mounted && (
                <button
                  type="button"
                  className="btn btn-secondary h-8 w-8 !p-0"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              )}
              <NotificationDropdown align="right" />
            </div>
          </div>
        </header>
        <main className="relative flex-1 overflow-y-auto">
          {isViewer && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-[80px] font-bold uppercase tracking-[0.6em] text-[var(--color-text)] opacity-10 rotate-[-12deg]">
                Read Only
              </div>
            </div>
          )}
          <div className="relative z-20">{children}</div>
        </main>
      </div>
      {chatOpen && (
        <div className="dialog-backdrop z-[70]">
          <div className="relative h-full w-full max-w-4xl rounded-[var(--radius-lg)] bg-[var(--color-surface)] elev-lg">
            <button
              className="btn btn-secondary absolute right-4 top-4 text-[10px] uppercase tracking-[0.3em]"
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
        className="ax-app-fab"
        onClick={() => setChatOpen(true)}
        type="button"
        aria-label="Urban Assistant Chatbot"
      >
        <Bot size={24} />
      </button>
      <WhatsNewNotification />
    </NocturneRoot>
  );
}
