"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { UserRole, hasPermission, Permission } from "@/lib/auth";
import { HUDD_LOGO_PUBLIC_PATH } from "@/lib/hudd-logo";
import { withNextBasePath } from "@/lib/next-base-path";
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
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";

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
    roles: [ UserRole.ACS, UserRole.VERTICAL_HEAD, UserRole.TASU],
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

const badgeColors: Record<UserRole, string> = {
  [UserRole.ACS]: "bg-[#1f3a93]",
  [UserRole.VERTICAL_HEAD]: "bg-[#5b4fcf]",
  [UserRole.FA]: "bg-[#1abc9c]",
  [UserRole.TASU]: "bg-[#1abc9c]",
  [UserRole.NODAL_OFFICER]: "bg-[#2ecc71]",
};

/** Dashboard merged from legacy `/command-centre`; keep both paths highlighting the same nav item. */
function isTopNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/command-centre";
  }
  return pathname === href;
}

function formatMeetingSidebarLabel(m: MeetingListItem) {
  const d = new Date(`${m.meetingDate}T12:00:00`);
  const label = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(d);
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
      <div className="mx-3 mb-3 h-[72px] animate-pulse rounded-lg bg-[var(--sidebar-border)]/25" aria-hidden />
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-dashed border-[var(--sidebar-border)] px-2.5 py-2 text-[10px] leading-snug text-[var(--sidebar-text-muted)]">
        No meetings yet. Schedule one under Meetings to scope the dashboard.
      </div>
    );
  }

  return (
    <div className="mx-3 mb-3 flex flex-col gap-1.5">
      {/* Financial year selector */}
      <select
        className="w-full rounded-md border border-(--sidebar-border) bg-(--bg-surface) px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--sidebar-text-muted)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--sidebar-active-bg)]/40"
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
        className="w-full rounded-md border border-(--sidebar-border) bg-(--bg-surface) px-2 py-1.5 text-[12px] font-medium text-[var(--sidebar-text-primary)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--sidebar-active-bg)]/40"
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
      fallback={<div className="mx-3 mb-3 h-[72px] animate-pulse rounded-lg bg-[var(--sidebar-border)]/25" aria-hidden />}
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
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [kpiSubmissions, setKpiSubmissions] = useState<KPISubmission[]>([]);
  const [latestKpiMeeting, setLatestKpiMeeting] = useState<KpiLatestMeeting | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLatestKpiMeeting(null);
      setKpiSubmissions([]);
      setActionItems([]);
      return;
    }
    void (async () => {
      try {
        const data = await fetchActionItems();
        if (active) setActionItems(data);
      } catch {
        if (active) setActionItems([]);
      }
    })();
    if (hasPermission(user, Permission.ENTER_KPI_DATA)) {
      void (async () => {
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
      })();
    } else {
      setLatestKpiMeeting(null);
      setKpiSubmissions([]);
    }
    return () => {
      active = false;
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
    return pendingAssignedBadgeState(actionItems, user);
  }, [actionItems, user]);

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
      <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white rounded-full ${badgeColors[user.role]}`}>
        {user.role.replace("_", " ")}
      </span>
    );
  }, [user]);

  const visibleItems = user
    ? items.filter(
        (item) =>
          item.roles.includes(user.role) && (!item.myTasksHubGate || canSeeMyTasksNav(user, actionItems)),
      )
    : [];
  const roleLabel = user?.role.replaceAll("_", " ");

  return (
    <aside className={`${isCollapsed ? "w-20" : "w-64"} h-full bg-(--bg-surface) border-r border-(--sidebar-border) flex flex-col sticky top-0 transition-all duration-300`}>
      <div className={`px-4 py-5 border-b border-(--sidebar-border) items-center justify-center flex ${isCollapsed ? "px-2" : "px-6"}`}>
        <div className={`flex shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5 transition-all ${isCollapsed ? "size-12" : "size-24"}`}>
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

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                title={isCollapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-4 py-2 rounded-md transition-colors text-sm font-medium ${isTopNavActive(pathname, item.href) ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-text-primary)]" : "text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-primary)]"} ${isCollapsed ? "justify-center px-0" : ""}`}
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
                {!isCollapsed && item.badge && <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white bg-[var(--sidebar-active-bg)] px-2 py-0.5 rounded-full ml-auto shrink-0 opacity-80">{item.badge}</span>}
              </Link>
              {!isCollapsed && childLinks.length > 0 && (
                <ul
                  className="mt-2 ml-3 flex list-none flex-col gap-0.5 border-l-2 border-[var(--sidebar-text-muted)]/30 py-0.5 pl-3"
                  aria-label={`${item.label} — related links`}
                >
                  {childLinks.map(child => {
                    const active = pathname === child.href;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={[
                            "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] leading-snug transition-colors",
                            active
                              ? "bg-[var(--sidebar-active-bg)] font-medium text-[var(--sidebar-text-primary)]"
                              : child.emphasis
                                ? "bg-[var(--sidebar-hover-bg)]/70 text-[var(--sidebar-text-primary)] hover:bg-[var(--sidebar-hover-bg)]"
                                : "text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-hover-bg)]/50 hover:text-[var(--sidebar-text-primary)]",
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
              )}
            </div>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-[var(--sidebar-border)] px-3 py-3">
        <div className="relative z-10" ref={userMenuRef}>
          <button
            className={[
              "group flex w-full items-center gap-2 overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-left transition hover:bg-[var(--bg-surface)] hover:text-[var(--sidebar-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-text-muted)]/40",
              userMenuOpen ? "rounded-b-full rounded-t-none border-t-0" : "rounded-full",
              isCollapsed ? "justify-center p-1" : "px-2",
            ].join(" ")}
            type="button"
            aria-label="Open user menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((open) => !open)}
          >
            <div className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--border)] group-hover:bg-[var(--sidebar-hover-bg)] ${isCollapsed ? "h-10 w-10" : "h-8 w-8"}`}>
              <User size={isCollapsed ? 20 : 16} className="text-[var(--text-secondary)] group-hover:text-[var(--sidebar-text-primary)]" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1 pr-2">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--sidebar-text-primary)]">
                  {user?.name ?? roleLabel ?? "User"}
                </p>
              </div>
            )}
          </button>
          {userMenuOpen && (
            <div className={`absolute bottom-full z-40 rounded-t-xl rounded-b-none border border-b-0 border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-xl ${isCollapsed ? "left-0 w-64" : "left-0 w-full"}`}>
              <div className="space-y-1 border-b border-[var(--border)] pb-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{user?.name ?? "Signed in user"}</p>
                <p className="text-xs text-[var(--text-muted)]">{user?.email ?? "Email unavailable"}</p>
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">{roleLabel ?? "Member"}</p>
                <p className="text-xs text-[var(--text-muted)]">{user?.department ?? "Housing & Urban Development Department"}</p>
              </div>
              <div className="pt-3">
                <LogoutButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
