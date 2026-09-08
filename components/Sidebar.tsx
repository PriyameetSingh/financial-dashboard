"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { UserRole, hasPermission, Permission } from "@/lib/auth";
import { visibleNavItems } from "@/lib/entitlements/guard";
import { HUDD_LOGO_PUBLIC_PATH } from "@/lib/hudd-logo";
import { withNextBasePath } from "@/lib/next-base-path";
import { tenantLocale } from "@/lib/tenant-config/format";
import {
  canSeeMyTasksNav,
  hasPendingAssignedActionItems,
} from "@/src/lib/actionItemAssignment";
import {
  mergePendingBadges,
  pendingAssignedBadgeState,
  pendingKpiEntryBadgeState,
  SIDEBAR_BADGE_TONE_CLASS,
} from "@/src/lib/myTasksPendingBadges";
import { useHydratedCurrentUser } from "@/src/lib/use-hydrated-current-user";
import { fetchActionItems } from "@/src/lib/services/actionItemService";
import { fetchKPISubmissions, type KpiLatestMeeting } from "@/src/lib/services/kpiService";
import { fetchMeetings, type MeetingListItem } from "@/src/lib/services/meetingService";
import type { ActionItem, KPISubmission } from "@/types";
import {
  LayoutDashboard,
  LayoutGrid,
  IndianRupee,
  ListChecks,
  Activity,
  UserCog,
  ClipboardList,
  CalendarDays,
  Calendar,
  Layers,
  Gauge,
  CheckSquare,
  User,
  Shield,
  FileText,
  Settings,
  ChevronDown,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import TextSizeToolbarControl from "@/components/TextSizeToolbarControl";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  roles: UserRole[];
  badge?: string;
  emphasis?: boolean;
  children?: NavItem[];
  /** When true, item is shown only if hub permissions apply or the user has pending assigned decision items. */
  myTasksHubGate?: boolean;
};

const items: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: Object.values(UserRole),
  },
  {
    label: "My Tasks",
    href: "/my-tasks",
    icon: CheckSquare,
    roles: Object.values(UserRole),
    myTasksHubGate: true,
  },
  {
    label: "Financial Progress",
    href: "/financial",
    icon: IndianRupee,
    roles: Object.values(UserRole),
  },
  {
    label: "Scheme Budget vs Expense",
    href: "/financial/schemes-board",
    icon: LayoutGrid,
    roles: Object.values(UserRole),
  },
  {
    label: " Create Schemes",
    href: "/schemes",
    icon: Layers,
    roles: [UserRole.TASU],
  },
  {
    label: "Decision Tracker",
    href: "/action-items",
    icon: ListChecks,
    roles: Object.values(UserRole),
    children: [
      {
        label: "Create Item",
        href: "/action-items/create",
        icon: Activity,
        roles: [UserRole.TASU],
        emphasis: true,
      },
    ],
  },
  {
    label: "KPI Monitoring",
    href: "/kpis",
    icon: ClipboardList,
    roles: Object.values(UserRole),
  },

  {
    label: "Dashboard Meetings",
    href: "/meetings",
    icon: CalendarDays,
    roles: [UserRole.TASU, UserRole.VERTICAL_HEAD, UserRole.ACS],
  },
  {
    label: "Reports & Export",
    href: "/reports",
    icon: FileText,
    roles: [UserRole.ACS, UserRole.VERTICAL_HEAD, UserRole.TASU],
  },
  // {
  //   label: "Execution Efficiency",
  //   href: "/financial/execution-efficiency",
  //   icon: Gauge,
  //   roles: Object.values(UserRole),
  // },
  {
    label: "Administration",
    href: "/admin",
    icon: UserCog,
    roles: [UserRole.TASU,],
    children: [
      {
        label: "Users",
        href: "/admin/users",
        icon: UserCog,
        roles: [UserRole.TASU],
      },
      {
        label: "Roles",
        href: "/admin/roles",
        icon: Shield,
        roles: [UserRole.TASU],
      },
      {
        label: "Financial years",
        href: "/admin/financial-years",
        icon: Calendar,
        roles: [UserRole.TASU,],
      },
      {
        label: "Masters data",
        href: "/admin/masters",
        icon: Settings,
        roles: [UserRole.TASU],
      }
    ],
  },
  {
    label: "My Profile",
    href: "/profile",
    icon: Activity,
    roles: Object.values(UserRole),
  },
];

/*
 * The role badge used to carry one of five arbitrary hues. They encoded nothing
 * a reader could decode — two roles shared a colour, and the badge already spells
 * the role out — so the reskin drops the mapping rather than inventing five
 * tenant-safe equivalents for information that was never there.
 */

/** Dashboard merged from legacy `/command-centre`; keep both paths highlighting the same nav item. */
function isTopNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/command-centre";
  }
  return pathname === href;
}

function formatMeetingSidebarLabel(m: MeetingListItem) {
  const d = new Date(`${m.meetingDate}T12:00:00`);
  const label = new Intl.DateTimeFormat(tenantLocale(), { day: "numeric", month: "short", year: "numeric" }).format(d);
  const title = m.title?.trim();
  return title ? `${label} — ${title}` : label;
}

/** Returns the Indian financial year label for a meetingDate string (YYYY-MM-DD).
 *  April–March cycle: April 2024 → "2024-25", January 2025 → "2024-25". */
function getMeetingFinancialYear(meetingDate: string): string {
  const [yearStr, monthStr] = meetingDate.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

function MeetingScopeSelectInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMeetings()
      .then((m) => {
        if (active) setMeetings(m);
      })
      .catch(() => {
        if (active) setMeetings([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const sorted = useMemo(
    () => [...meetings].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)),
    [meetings],
  );

  /** Unique financial years, most-recent first. */
  const financialYears = useMemo(() => {
    const seen = new Set<string>();
    const years: string[] = [];
    for (const m of sorted) {
      const fy = getMeetingFinancialYear(m.meetingDate);
      if (!seen.has(fy)) {
        seen.add(fy);
        years.push(fy);
      }
    }
    return years;
  }, [sorted]);

  const [selectedFY, setSelectedFY] = useState<string>("");

  /** Initialise selectedFY once data is ready. */
  useEffect(() => {
    if (financialYears.length > 0 && !selectedFY) {
      setSelectedFY(financialYears[0]);
    }
  }, [financialYears, selectedFY]);

  const meetingsInFY = useMemo(
    () => (selectedFY ? sorted.filter((m) => getMeetingFinancialYear(m.meetingDate) === selectedFY) : sorted),
    [sorted, selectedFY],
  );

  const param = searchParams.get("meeting");
  const selectedId = useMemo(() => {
    if (param && meetingsInFY.some((m) => m.id === param)) return param;
    return meetingsInFY[0]?.id ?? "";
  }, [param, meetingsInFY]);

  useEffect(() => {
    if (!sorted.length) return;
    if (pathname !== "/dashboard" && pathname !== "/command-centre") return;
    const p = searchParams.get("meeting");
    if (p && !sorted.some((m) => m.id === p)) {
      router.replace(`/dashboard?meeting=${encodeURIComponent(sorted[0].id)}`, { scroll: false });
    }
  }, [sorted, pathname, searchParams, router]);

  /** When the FY changes, auto-select the first meeting in the new FY. */
  const onFYChange = (fy: string) => {
    setSelectedFY(fy);
    const first = sorted.find((m) => getMeetingFinancialYear(m.meetingDate) === fy);
    if (first) {
      if (pathname === "/dashboard" || pathname === "/command-centre") {
        router.replace(`/dashboard?meeting=${encodeURIComponent(first.id)}`, { scroll: false });
      } else {
        router.push(`/dashboard?meeting=${encodeURIComponent(first.id)}`);
      }
    }
  };

  const onSelect = (id: string) => {
    if (!id) return;
    if (pathname === "/dashboard" || pathname === "/command-centre") {
      router.replace(`/dashboard?meeting=${encodeURIComponent(id)}`, { scroll: false });
    } else {
      router.push(`/dashboard?meeting=${encodeURIComponent(id)}`);
    }
  };

  if (!loaded) {
    return (
      <div className="mx-3 mb-3 h-[72px] animate-pulse rounded-lg bg-[var(--color-divider)]/25" aria-hidden />
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-dashed border-[var(--color-divider)] px-2.5 py-2 text-[10px] leading-snug text-[var(--ax-muted)]">
        No meetings yet. Schedule one under Meetings to scope the dashboard.
      </div>
    );
  }

  return (
    <div className="mx-3 mb-3 flex flex-col gap-1.5">
      {/* Financial year selector */}
      <select
        className="w-full rounded-md border border-(--color-divider) bg-(--color-surface) px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ax-muted)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--ax-nav-active)]/40"
        value={selectedFY}
        onChange={(e) => onFYChange(e.target.value)}
        title="Filter meetings by financial year"
      >
        {financialYears.map((fy) => (
          <option key={fy} value={fy}>
            FY {fy}
          </option>
        ))}
      </select>

      {/* Meeting selector */}
      <select
        className="w-full rounded-md border border-(--color-divider) bg-(--color-surface) px-2 py-1.5 text-[12px] font-medium text-[var(--color-text)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--ax-nav-active)]/40"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        title="Topics, presentations, and meeting context on the dashboard follow this meeting (latest by default)."
      >
        {meetingsInFY.map((m) => (
          <option key={m.id} value={m.id}>
            {formatMeetingSidebarLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}

function MeetingScopeSelect() {
  return (
    <Suspense
      fallback={<div className="mx-3 mb-3 h-[72px] animate-pulse rounded-lg bg-[var(--color-divider)]/25" aria-hidden />}
    >
      <MeetingScopeSelectInner />
    </Suspense>
  );
}

interface SidebarProps {
  isCollapsed: boolean;
}

export default function Sidebar({ isCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const user = useHydratedCurrentUser();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [kpiSubmissions, setKpiSubmissions] = useState<KPISubmission[]>([]);
  const [latestKpiMeeting, setLatestKpiMeeting] = useState<KpiLatestMeeting | null>(null);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    let active = true;
    void fetch(withNextBasePath("/api/v1/releases/current"))
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.release?.version) {
          setVersion(data.release.version);
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLatestKpiMeeting(null);
      setKpiSubmissions([]);
      setActionItems([]);
      return;
    }

    const loadSidebarData = async () => {
      try {
        const data = await fetchActionItems();
        if (active) setActionItems(data);
      } catch {
        if (active) setActionItems([]);
      }
      if (hasPermission(user, Permission.ENTER_KPI_DATA)) {
        try {
          const kpiData = await fetchKPISubmissions();
          if (active) {
            setLatestKpiMeeting(kpiData.latestMeeting);
            setKpiSubmissions(kpiData.submissions);
          }
        } catch {
          if (active) {
            setLatestKpiMeeting(null);
            setKpiSubmissions([]);
          }
        }
      } else {
        if (active) {
          setLatestKpiMeeting(null);
          setKpiSubmissions([]);
        }
      }
    };

    void loadSidebarData();

    const handleDataChanged = () => {
      void loadSidebarData();
    };

    window.addEventListener("my-tasks-data-changed", handleDataChanged);

    return () => {
      active = false;
      window.removeEventListener("my-tasks-data-changed", handleDataChanged);
    };
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [userMenuOpen]);

  const actionItemsBadge = useMemo(() => {
    if (!user) return null;
    return pendingAssignedBadgeState(actionItems, user, latestKpiMeeting);
  }, [actionItems, user, latestKpiMeeting]);

  const kpiEntryBadge = useMemo(
    () => pendingKpiEntryBadgeState(kpiSubmissions, latestKpiMeeting),
    [kpiSubmissions, latestKpiMeeting],
  );

  const myTasksHubBadge = useMemo((): { count: number; tone: "red" | "yellow" | "green" | null } => {
    if (!user || !canSeeMyTasksNav(user, actionItems)) return { count: 0, tone: null };
    const slices: { count: number; tone: "red" | "yellow" | "green" | null }[] = [];
    const includeActionSlice =
      hasPermission(user, Permission.UPDATE_ACTION_ITEMS) ||
      hasPermission(user, Permission.CREATE_ACTION_ITEMS) ||
      hasPendingAssignedActionItems(actionItems, user);
    if (includeActionSlice) {
      slices.push(actionItemsBadge ?? { count: 0, tone: null });
    }
    if (hasPermission(user, Permission.ENTER_KPI_DATA)) {
      slices.push(kpiEntryBadge);
    }
    return mergePendingBadges(slices);
  }, [user, actionItems, actionItemsBadge, kpiEntryBadge]);

  const roleBadge = useMemo(() => {
    if (!user) return null;
    return (
      <span className="tag tag-accent tracking-[0.2em]">{user.role.replace("_", " ")}</span>
    );
  }, [user]);

  /**
   * Nav = entitlement ∩ role ∩ hub gate, in that order.
   *
   * Entitlement composes with the existing role filter rather than replacing it:
   * a module being provisioned says nothing about whether THIS user may see it.
   * Hiding is presentation only — proxy.ts 404s a disabled module by direct URL
   * regardless — but both read the same route→module map, so a link that is
   * shown can never 404 and a route that 404s can never be linked.
   */
  const visibleItems = useMemo(() => {
    if (!user) return [];
    const enabled = new Set(user.enabledModules ?? []);
    return visibleNavItems(items, enabled).filter(
      (item) =>
        item.roles.includes(user.role) && (!item.myTasksHubGate || canSeeMyTasksNav(user, actionItems)),
    );
  }, [user, actionItems]);
  const roleLabel = user?.role.replaceAll("_", " ");

  // Auto-expand submenus if their children are active
  useEffect(() => {
    if (!user) return;
    setOpenSubmenus((prev) => {
      let changed = false;
      const updated = { ...prev };
      items.forEach((item) => {
        if (item.children?.length) {
          const childLinks = item.children.filter((child) => child.roles.includes(user.role));
          const hasActiveChild = childLinks.some(
            (child) => pathname === child.href || isTopNavActive(pathname, child.href)
          );
          const isParentActive = isTopNavActive(pathname, item.href);

          if (hasActiveChild || isParentActive) {
            if (updated[item.label] === undefined) {
              updated[item.label] = true;
              changed = true;
            }
          }
        }
      });
      return changed ? updated : prev;
    });
  }, [pathname, user]);

  const toggleSubmenu = (label: string) => {
    setOpenSubmenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };


  return (
    <aside
      /*
       * A permanent dark island. Every Nocturne token inside resolves to its
       * dark value whichever theme the reader chose — including the TENANT'S own
       * dark-theme accent, which a private sidebar palette would have excluded.
       */
      data-theme="dark"
      className={`
      ax-nav fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300
      md:sticky md:h-full md:translate-x-0
      ${isCollapsed
        ? "w-64 -translate-x-full md:w-20 md:translate-x-0"
        : "w-64 translate-x-0 md:w-64"
      }
    `}
    >
      <div className={`px-4 py-3 border-b border-(--color-divider) items-center justify-center flex ${isCollapsed ? "px-2" : "px-6"}`}>
        <div className={`ax-nav-brand transition-all ${isCollapsed ? "size-10" : "size-14"}`}>
          <img
            src={withNextBasePath(HUDD_LOGO_PUBLIC_PATH)}
            alt="HUDD Logo"
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      {!isCollapsed && <MeetingScopeSelect />}

      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {visibleItems.map(item => {
          const childLinks =
            user && item.children?.length
              ? item.children.filter(child => child.roles.includes(user.role))
              : [];
          const isOpen = !!openSubmenus[item.label];

          const isParentActive = isTopNavActive(pathname, item.href);
          const hasChildren = childLinks.length > 0;

          return (
            <div key={item.href}>
              <div
                className={`ax-nav-item group ${isParentActive ? "ax-nav-item-active" : ""}`}
              >
                <Link
                  href={item.href}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex-1 flex items-center gap-3 pl-4 ${!isCollapsed && hasChildren ? "pr-2" : "pr-4"} py-2 rounded-l-md ${isCollapsed ? "justify-center px-0 rounded-md" : ""}`}
                >
                  <item.icon size={isCollapsed ? 20 : 16} />
                  {!isCollapsed && (
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate">{item.label}</span>
                      {item.href === "/action-items" && actionItemsBadge && actionItemsBadge.count > 0 && actionItemsBadge.tone && (
                        <span
                          className={`shrink-0 tabular-nums text-[13px] font-semibold ${SIDEBAR_BADGE_TONE_CLASS[actionItemsBadge.tone]}`}
                          title="Pending action items assigned to you"
                        >
                          ({actionItemsBadge.count})
                        </span>
                      )}
                      {item.href === "/my-tasks" && myTasksHubBadge.count > 0 && myTasksHubBadge.tone && (
                        <span
                          className={`shrink-0 tabular-nums text-[13px] font-semibold ${SIDEBAR_BADGE_TONE_CLASS[myTasksHubBadge.tone]}`}
                          title="Pending items across KPI and decision-tracker work assigned to you"
                        >
                          ({myTasksHubBadge.count})
                        </span>
                      )}
                    </span>
                  )}
                  {!isCollapsed && item.badge && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.3em] bg-[var(--ax-nav-active)] px-2 py-0.5 rounded-full ml-auto shrink-0 opacity-80">
                      {item.badge}
                    </span>
                  )}
                </Link>
                {!isCollapsed && hasChildren && (
                  <button
                    type="button"
                    title={isOpen ? "Collapse menu" : "Expand menu"}
                    className="p-1 rounded-r-md text-[var(--ax-muted)] hover:text-[var(--color-text)] transition-all flex items-center justify-center cursor-pointer pr-3 pl-1 py-2 select-none focus:outline-none"
                    onClick={() => toggleSubmenu(item.label)}
                  >
                    <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
              {!isCollapsed && childLinks.length > 0 && (
                <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 pointer-events-none"}`}>
                  <div className="overflow-hidden">
                    <ul
                      className="ml-3 flex list-none flex-col gap-0.5 border-l-2 border-[var(--ax-muted)]/30 py-0.5 pl-3"
                      aria-label={`${item.label} — related links`}
                    >
                      {childLinks.map(child => {
                        const active = pathname === child.href;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              /*
                               * The same primitives as the parent items. Gate A
                               * moved the top level onto `ax-nav-item` and left
                               * the children on the legacy bridge names, which
                               * held only because /profile — the one screen the
                               * Gate A audit loaded — never expands a submenu.
                               * On an admin page with one open, the active child
                               * measured 1.35:1. One nav, one set of classes.
                               */
                              className={[
                                "ax-nav-item flex min-h-8 w-full min-w-0 items-center gap-2 px-2 py-1.5 text-[13px] leading-snug",
                                active ? "ax-nav-item-active font-medium" : "",
                                child.emphasis ? "ax-nav-item-emphasis" : "",
                              ].join(" ")}
                            >
                              <span className="shrink-0 opacity-90" aria-hidden>
                                <child.icon size={14} />
                              </span>
                              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                <span className="truncate">{child.label}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-[var(--color-divider)] px-3 py-3">
        <div className="relative z-10" ref={userMenuRef}>
          <button
            className={[
              "group flex w-full items-center gap-2 overflow-hidden border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-1 text-left transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ax-muted)]/40",
              userMenuOpen ? "rounded-b-full rounded-t-none border-t-0" : "rounded-full",
              isCollapsed ? "justify-center p-1" : "px-2",
            ].join(" ")}
            type="button"
            aria-label="Open user menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((open) => !open)}
          >
            <div className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--color-divider)] group-hover:bg-[var(--ax-nav-hover)] ${isCollapsed ? "h-10 w-10" : "h-8 w-8"}`}>
              <User size={isCollapsed ? 20 : 16} className="text-[var(--ax-text-secondary)] group-hover:text-[var(--color-text)]" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1 pr-2">
                <p className="truncate text-xs font-semibold text-[var(--color-text)] group-hover:text-[var(--color-text)]">
                  {user?.name ?? roleLabel ?? "User"}
                </p>
              </div>
            )}
          </button>
          {userMenuOpen && (
            <div className={`absolute bottom-full z-40 rounded-t-xl rounded-b-none border border-b-0 border-[var(--color-divider)] bg-[var(--color-surface)] p-3 shadow-xl ${isCollapsed ? "left-0 w-64" : "left-0 w-full"}`}>
              <div className="space-y-1 border-b border-[var(--color-divider)] pb-3">
                <p className="text-sm font-semibold text-[var(--color-text)]">{user?.name ?? "Signed in user"}</p>
                <p className="text-xs text-[var(--ax-muted)]">{user?.email ?? "Email unavailable"}</p>
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--ax-muted)]">{roleLabel ?? "Member"}</p>
                <p className="text-xs text-[var(--ax-muted)]">{user?.department ?? "Housing & Urban Development Department"}</p>
              </div>
              <div className="pt-3 pb-3 border-b border-[var(--color-divider)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ax-muted)] mb-2">Preferences</p>
                <TextSizeToolbarControl vertical />
              </div>
              {user?.isPlatformOperator && (
                <div className="pt-3 pb-3 border-b border-[var(--color-divider)]">
                  <Link
                    href="/fleet"
                    className="block w-full rounded-md border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--ax-muted)] transition hover:bg-[var(--ax-nav-hover)] hover:text-[var(--color-text)]"
                  >
                    Fleet console
                  </Link>
                </div>
              )}
              <div className="pt-3">
                <LogoutButton />
              </div>
              <div>
                {!isCollapsed && version && (
                  <div className="text-center pt-1 border-t border-[var(--color-divider)]/20 mt-2">
                    <Link
                      href="/changelog"
                      className="text-[10px] font-semibold tracking-wider text-[var(--ax-muted)] hover:text-[var(--color-text)] transition-colors hover:underline"
                    >
                      System Version {version}
                    </Link>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>
    </aside>
  );
}
