import { prisma } from "@/lib/prisma";
import {
  ActionItemStatus,
  FinancialWorkflowStatus,
  KPIWorkflowStatus,
} from "@prisma/client";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatPendanceReportDate(iso: string): string {
  const [y, m, day] = iso.split("-");
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export type UserTaskRow = {
  userName: string;
  userDepartment: string;
  assignedKpiCount: number;
  submittedKpiCount: number;
  pendingKpiCount: number;
  assignedActionItemCount: number;
  completedActionItemCount: number;
  pendingActionItemCount: number;
  kpiDetails: Array<{
    description: string;
    schemeName: string;
    hasData: boolean;
    lastUpdated: string | null;
  }>;
  actionItemDetails: Array<{
    title: string;
    status: string;
    dueDate: string;
  }>;
};

export type FinancialDataUpdateRow = {
  schemeName: string;
  schemeType: string;
  subschemes: Array<{
    subschemeId: string | null;
    subschemeName: string | null;
    hasDataThisWeek: boolean;
    lastUpdated: string | null;
    updatedBy: string | null;
  }>;
};

export type PendanceReportPayload = {
  meeting: {
    id: string;
    meetingDate: string;
    title: string | null;
    financialYearLabel: string | null;
  };
  reportGeneratedDate: string;
  weekStartDate: string;
  weekEndDate: string;
  userTasks: UserTaskRow[];
  financialDataUpdates: FinancialDataUpdateRow[];
};

async function resolveFinancialYear(meeting: {
  financialYearId: string | null;
  meetingDate: Date;
}) {
  if (meeting.financialYearId) {
    const fy = await prisma.financialYear.findUnique({ where: { id: meeting.financialYearId } });
    if (fy) return fy;
  }
  const md = meeting.meetingDate;
  const ranged =
    (await prisma.financialYear.findFirst({
      where: { startDate: { lte: md }, endDate: { gte: md } },
    })) ?? (await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" } }));
  return ranged;
}

function getWeekDateRange(meetingDate: Date): { start: Date; end: Date } {
  const end = new Date(meetingDate);
  const start = new Date(meetingDate);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

export async function buildPendanceReport(meetingId: string): Promise<PendanceReportPayload | null> {
  const meetingRow = await prisma.dashboardMeeting.findUnique({
    where: { id: meetingId },
  });

  if (!meetingRow) return null;

  const fy = await resolveFinancialYear(meetingRow);
  const fyLabel = fy?.label ?? null;
  const meetingDate = meetingRow.meetingDate;
  const { start: weekStart, end: weekEnd } = getWeekDateRange(meetingDate);

  // Get all active users with their schemes and tasks
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      kpiDefinitionPerformers: {
        include: {
          kpiDefinition: {
            include: {
              scheme: { select: { name: true } },
              targets: {
                where: fy ? { financialYearId: fy.id } : {},
                include: {
                  measurements: {
                    where: {
                      meetingId: meetingId,
                      workflowStatus: { in: [KPIWorkflowStatus.submitted, KPIWorkflowStatus.reviewed] },
                    },
                    orderBy: { measuredAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
      actionItemPerformers: {
        include: {
          actionItem: {
            include: {
              scheme: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ department: "asc" }, { name: "asc" }],
  });

  const userTasks: UserTaskRow[] = [];

  for (const user of users) {
    const assignedKpis = user.kpiDefinitionPerformers.map((p) => p.kpiDefinition);
    const assignedActionItems = user.actionItemPerformers.map((p) => p.actionItem);

    // Filter relevant KPIs for this FY
    const relevantKpis = assignedKpis.filter(
      (k) => k.targets.length > 0
    );

    const submittedKpis = relevantKpis.filter((k) => {
      const target = k.targets[0];
      return target && target.measurements.length > 0;
    });

    const pendingKpis = relevantKpis.filter((k) => {
      const target = k.targets[0];
      return !target || target.measurements.length === 0;
    });

    const kpiDetails = relevantKpis.map((k) => {
      const target = k.targets[0];
      const measurement = target?.measurements[0];
      return {
        description: k.description,
        schemeName: k.scheme.name,
        hasData: !!measurement,
        lastUpdated: measurement ? isoDate(measurement.measuredAt) : null,
      };
    });

    // Filter action items by due date near meeting date
    const relevantActionItems = assignedActionItems.filter(
      (a) => a.dueDate <= meetingDate
    );

    const completedActionItems = relevantActionItems.filter((a) =>
      a.status === ActionItemStatus.COMPLETED
    );

    const pendingActionItems = relevantActionItems.filter((a) =>
      a.status !== ActionItemStatus.COMPLETED
    );

    const actionItemDetails = relevantActionItems.map((a) => ({
      title: a.title,
      status: a.status,
      dueDate: isoDate(a.dueDate),
    }));

    // Only include users who have assigned tasks
    if (relevantKpis.length > 0 || relevantActionItems.length > 0) {
      userTasks.push({
        userName: user.name,
        userDepartment: user.department ?? "—",
        assignedKpiCount: relevantKpis.length,
        submittedKpiCount: submittedKpis.length,
        pendingKpiCount: pendingKpis.length,
        assignedActionItemCount: relevantActionItems.length,
        completedActionItemCount: completedActionItems.length,
        pendingActionItemCount: pendingActionItems.length,
        kpiDetails,
        actionItemDetails,
      });
    }
  }

  // Get financial data updates for the week
  const financialUpdates = await prisma.financeExpenditureSnapshot.findMany({
    where: {
      financialYearId: fy?.id,
      workflowStatus: FinancialWorkflowStatus.submitted,
      createdAt: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    include: {
      scheme: {
        select: {
          id: true,
          name: true,
          sponsorshipType: true,
        },
      },
      subscheme: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { scheme: { sponsorshipType: "asc" } },
      { scheme: { name: "asc" } },
      { subscheme: { name: "asc" } },
    ],
  });

  // Get all schemes to show which ones had no updates
  const allSchemes = await prisma.scheme.findMany({
    where: { 
      archived: false,
      sponsorshipType: { not: "NON_FINANCIAL" }
    },
    include: {
      subschemes: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: [{ sponsorshipType: "asc" }, { name: "asc" }],
  });

  const financialDataUpdates: FinancialDataUpdateRow[] = [];

  for (const scheme of allSchemes) {
    const schemeType =
      scheme.sponsorshipType === "STATE"
        ? "State Scheme"
        : scheme.sponsorshipType === "CENTRAL"
          ? "Centrally Sponsored Scheme"
          : scheme.sponsorshipType === "CENTRAL_SECTOR"
            ? "Central Sector Scheme"
            : "Non-Financial Scheme";

    const subschemeRows: FinancialDataUpdateRow["subschemes"] = [];

    // Check main scheme level
    const mainSchemeUpdate = financialUpdates.find(
      (u) => u.schemeId === scheme.id && !u.subschemeId
    );

    if (scheme.subschemes.length === 0) {
      // No subschemes, just add main scheme
      subschemeRows.push({
        subschemeId: null,
        subschemeName: null,
        hasDataThisWeek: !!mainSchemeUpdate,
        lastUpdated: mainSchemeUpdate ? isoDate(mainSchemeUpdate.createdAt) : null,
        updatedBy: mainSchemeUpdate?.createdBy?.name ?? null,
      });
    } else {
      // Has subschemes
      for (const sub of scheme.subschemes) {
        const subUpdate = financialUpdates.find(
          (u) => u.schemeId === scheme.id && u.subschemeId === sub.id
        );

        subschemeRows.push({
          subschemeId: sub.id,
          subschemeName: sub.name,
          hasDataThisWeek: !!subUpdate,
          lastUpdated: subUpdate ? isoDate(subUpdate.createdAt) : null,
          updatedBy: subUpdate?.createdBy?.name ?? null,
        });
      }
    }

    financialDataUpdates.push({
      schemeName: scheme.name,
      schemeType,
      subschemes: subschemeRows,
    });
  }

  return {
    meeting: {
      id: meetingRow.id,
      meetingDate: isoDate(meetingRow.meetingDate),
      title: meetingRow.title,
      financialYearLabel: fyLabel,
    },
    reportGeneratedDate: isoDate(new Date()),
    weekStartDate: isoDate(weekStart),
    weekEndDate: isoDate(weekEnd),
    userTasks,
    financialDataUpdates,
  };
}
