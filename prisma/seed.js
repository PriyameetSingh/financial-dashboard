const { PrismaClient } = require("@prisma/client");

const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  datasourceUrl
    ? {
        datasources: {
          db: {
            url: datasourceUrl,
          },
        },
      }
    : undefined
);

const PERMISSIONS = [
  { code: "VIEW_ALL_DATA", name: "View all data" },
  { code: "VIEW_ASSIGNED_DATA", name: "View assigned data" },
  { code: "ENTER_FINANCIAL_DATA", name: "Enter financial data" },
  { code: "ENTER_KPI_DATA", name: "Enter KPI data" },
  { code: "CREATE_ACTION_ITEMS", name: "Create action items" },
  { code: "UPDATE_ACTION_ITEMS", name: "Update action items" },
  { code: "UPLOAD_PROOF", name: "Upload proof" },
  { code: "APPROVE_FINANCIAL", name: "Approve financial" },
  { code: "APPROVE_KPI", name: "Approve KPI" },
  { code: "APPROVE_ACTION_ITEMS", name: "Approve action items" },
  { code: "MANAGE_USERS", name: "Manage users" },
  { code: "MANAGE_SCHEMES", name: "Manage schemes" },
  { code: "EXPORT_REPORTS", name: "Export reports" },
  { code: "VIEW_COMMAND_CENTRE", name: "View command centre" },
  { code: "VIEW_ANALYTICS", name: "View analytics" },
  { code: "MANAGE_PERMISSIONS", name: "Manage permissions" },
];

const ROLES = [
  {
    code: "ACS",
    name: "Additional Chief Secretary",
    permissions: [
      "VIEW_ALL_DATA",
      "ENTER_FINANCIAL_DATA",
      "ENTER_KPI_DATA",
      "CREATE_ACTION_ITEMS",
      "UPDATE_ACTION_ITEMS",
      "UPLOAD_PROOF",
      "MANAGE_USERS",
      "MANAGE_SCHEMES",
      "MANAGE_PERMISSIONS",
      "EXPORT_REPORTS",
      "VIEW_COMMAND_CENTRE",
      "VIEW_ANALYTICS",
      "APPROVE_KPI",
      "APPROVE_ACTION_ITEMS",
    ],
  },
  {
    code: "PS_HUDD",
    name: "Principal Secretary HUDD",
    permissions: [
      "VIEW_ALL_DATA",
      "ENTER_FINANCIAL_DATA",
      "CREATE_ACTION_ITEMS",
      "UPDATE_ACTION_ITEMS",
      "MANAGE_PERMISSIONS",
      "MANAGE_USERS",
      "MANAGE_SCHEMES",
      "EXPORT_REPORTS",
      "VIEW_COMMAND_CENTRE",
      "VIEW_ANALYTICS",
      "APPROVE_KPI",
      "APPROVE_ACTION_ITEMS",
    ],
  },
  {
    code: "AS",
    name: "Additional Secretary",
    permissions: [
      "VIEW_ALL_DATA",
      "ENTER_FINANCIAL_DATA",
      "MANAGE_SCHEMES",
      "EXPORT_REPORTS",
      "VIEW_ANALYTICS",
      "APPROVE_KPI",
      "APPROVE_ACTION_ITEMS",
    ],
  },
  {
    code: "FA",
    name: "Finance Advisor",
    permissions: ["VIEW_ALL_DATA", "ENTER_FINANCIAL_DATA", "UPLOAD_PROOF"],
  },
  {
    code: "TASU",
    name: "TASU",
    permissions: [
      "VIEW_ASSIGNED_DATA",
      "CREATE_ACTION_ITEMS",
      "UPDATE_ACTION_ITEMS",
      "APPROVE_ACTION_ITEMS",
      "VIEW_ANALYTICS",
      "MANAGE_USERS",
      "MANAGE_PERMISSIONS",
    ],
  },
  {
    code: "NODAL_OFFICER",
    name: "Nodal Officer",
    permissions: ["VIEW_ASSIGNED_DATA", "ENTER_KPI_DATA", "UPLOAD_PROOF", "VIEW_ANALYTICS"],
  },
  {
    code: "DIRECTOR",
    name: "Director",
    permissions: ["VIEW_ALL_DATA", "VIEW_ANALYTICS", "EXPORT_REPORTS", "APPROVE_KPI"],
  },
  {
    code: "VIEWER",
    name: "Viewer",
    permissions: ["VIEW_ALL_DATA", "VIEW_COMMAND_CENTRE", "VIEW_ANALYTICS"],
  },
];

const USERS = [
  {
    code: "acs",
    name: "Smt. Anjali Sharma",
    email: "anjali.sharma@hudd.ori",
    department: "Housing & Urban Development Department",
    role: "ACS",
  },
  {
    code: "ps",
    name: "Shri Pradeep Jena",
    email: "pradeep.jena@hudd.ori",
    department: "Housing & Urban Development Department",
    role: "PS_HUDD",
  },
  {
    code: "as",
    name: "Shri Suvendu Das",
    email: "suvendu.das@hudd.ori",
    department: "Housing & Urban Development Department",
    role: "AS",
  },
  {
    code: "fa",
    name: "Shri Rakesh Mohanty",
    email: "rakesh.mohanty@hudd.ori",
    department: "Finance & Planning",
    role: "FA",
  },
  {
    code: "tasu",
    name: "Ms. Priya Nair",
    email: "priya.nair@hudd.ori",
    department: "Technical & Advisory Support Unit",
    role: "TASU",
  },
  {
    code: "nodal",
    name: "Shri Amit Kumar",
    email: "amit.kumar@hudd.ori",
    department: "HUDD Field Unit",
    role: "NODAL_OFFICER",
  },
  {
    code: "director",
    name: "Shri B.K. Mishra",
    email: "bk.mishra@hudd.ori",
    department: "Directorate of DMA",
    role: "DIRECTOR",
  },
  {
    code: "viewer",
    name: "Shri Ramesh Patnaik",
    email: "ramesh.patnaik@hudd.ori",
    department: "Audit & Compliance",
    role: "VIEWER",
  },
];

const VERTICALS = [
  { code: "HOUSING", name: "Housing" },
  { code: "WATER", name: "Water" },
  { code: "SBM", name: "SBM" },
  { code: "AMRUT", name: "AMRUT" },
  { code: "UFC", name: "UFC" },
  { code: "SFC", name: "SFC" },
  { code: "LED", name: "LED" },
  { code: "NULM", name: "NULM" },
  { code: "MSBY", name: "MSBY" },
  { code: "MOBILITY", name: "Mobility" },
  { code: "DMA", name: "DMA" },
  { code: "SUDA", name: "SUDA" },
  { code: "GRIEVANCE", name: "Grievance" },
];

const FINANCIAL_ENTRIES = [
  { scheme: "PMAY-U", verticalCode: "HOUSING", status: "submitted_pending", annualBudget: 820, so: 320.5, ifms: 83.5, lastUpdated: "2026-03-17", submitterName: "Shri Rakesh Mohanty" },
  { scheme: "SUJALA", verticalCode: "WATER", status: "submitted_pending", annualBudget: 360, so: 142.2, ifms: 136.8, lastUpdated: "2026-03-18", submitterName: "Shri Rakesh Mohanty" },
  { scheme: "GARIMA", verticalCode: "SBM", status: "submitted_this_week", annualBudget: 80, so: 35.0, ifms: 21.4, lastUpdated: "2026-03-20", submitterName: "Shri Rakesh Mohanty" },
  { scheme: "AMRUT 2.0 Water", verticalCode: "AMRUT", status: "draft", annualBudget: 680, so: 330.0, ifms: 320.0, lastUpdated: "2026-03-13", submitterName: "" },
  { scheme: "LED Brownfield", verticalCode: "LED", status: "draft", annualBudget: 100, so: 50.2, ifms: 48.7, lastUpdated: "2026-03-15", submitterName: "" },
  { scheme: "SBM Solid Waste", verticalCode: "SBM", status: "overdue", annualBudget: 220, so: 75.2, ifms: 60.0, lastUpdated: "2026-03-04", submitterName: "" },
  { scheme: "PMAY-U Sewerage", verticalCode: "HOUSING", status: "overdue", annualBudget: 240, so: 120.0, ifms: 110.4, lastUpdated: "2026-03-06", submitterName: "" },
  { scheme: "MSBY Infrastructure", verticalCode: "MSBY", status: "submitted_this_week", annualBudget: 340, so: 210.0, ifms: 198.0, lastUpdated: "2026-03-20", submitterName: "Shri Rakesh Mohanty" },
  { scheme: "SAHAJOG Profiling", verticalCode: "NULM", status: "submitted_pending", annualBudget: 120, so: 47.5, ifms: 45.0, lastUpdated: "2026-03-19", submitterName: "" },
  { scheme: "Capacity Building", verticalCode: "SUDA", status: "not_started", annualBudget: 88, so: 0, ifms: 0, lastUpdated: "2026-03-01", submitterName: "" },
];

const KPI_SUBMISSIONS = [
  { scheme: "PMAY-U", verticalCode: "HOUSING", category: "CENTRAL", description: "Houses with basic services delivered", type: "OUTCOME", unit: "households", numerator: 8200, denominator: 12000, status: "approved", lastUpdated: "2026-03-18", remarks: null },
  { scheme: "PMAY-U", verticalCode: "HOUSING", category: "CENTRAL", description: "Beneficiary satisfaction (post-handover)", type: "OUTPUT", unit: "%", numerator: 88, denominator: 100, status: "submitted_pending", lastUpdated: "2026-03-19", remarks: "Awaiting AS review" },
  { scheme: "PMAY-U", verticalCode: "HOUSING", category: "CENTRAL", description: "New shramik clusters certified", type: "OUTPUT", unit: "clusters", numerator: null, denominator: null, status: "not_submitted", lastUpdated: "2026-03-02", remarks: null },
  { scheme: "SUJALA", verticalCode: "WATER", category: "STATE", description: "Households reached by water quality testing", type: "OUTPUT", unit: "households", numerator: 4200, denominator: 5000, status: "submitted", lastUpdated: "2026-03-14", remarks: null },
  { scheme: "SUJALA", verticalCode: "WATER", category: "STATE", description: "Pipeline leakage incidents reduced", type: "OUTPUT", unit: "incidents", numerator: null, denominator: null, status: "not_submitted", lastUpdated: "2026-03-01", remarks: null },
  { scheme: "SUJALA", verticalCode: "WATER", category: "STATE", description: "Water quality index compliance", type: "OUTCOME", unit: "%", numerator: 94, denominator: 100, status: "submitted", lastUpdated: "2026-03-15", remarks: null },
  { scheme: "SUJALA", verticalCode: "WATER", category: "STATE", description: "Schools with clean drinking water", type: "OUTPUT", unit: "schools", numerator: null, denominator: null, status: "not_submitted", lastUpdated: "2026-02-25", remarks: null },
  { scheme: "GARIMA", verticalCode: "SBM", category: "STATE", description: "Doorstep waste collection contract signed", type: "OUTPUT", unit: "ULBs", numerator: null, denominator: null, status: "not_submitted", lastUpdated: "2026-03-05", remarks: null },
  { scheme: "GARIMA", verticalCode: "SBM", category: "STATE", description: "Waste processing facility reporting", type: "OUTCOME", unit: "tonnes", numerator: null, denominator: null, status: "not_submitted", lastUpdated: "2026-03-07", remarks: null },
];

const ACTION_ITEMS = [
  {
    title: "Release UFC tranches for Bhubaneswar sewerage works",
    description: "Unblock ₹280 Cr held due to compliance paperwork.",
    verticalCode: "UFC",
    priority: "Critical",
    dueDate: "2026-03-05",
    status: "OVERDUE",
    assignedTo: "Amit Kumar",
    reviewer: "Shri Suvendu Das",
    schemeId: "UFC-001",
    updates: [
      { timestamp: "2026-02-20", actor: "Amit Kumar", status: "IN_PROGRESS", note: "Field team following up" },
      { timestamp: "2026-02-28", actor: "Shri Suvendu Das", status: "UNDER_REVIEW", note: "Awaiting compliance review" },
    ],
    proofFiles: [{ name: "Compliance memo.pdf", link: "#" }],
  },
  {
    title: "Expedite PMAY fund release for high priority ULBs",
    description: "Cuttack, Berhampur, Rourkela, Sambalpur, Puri pending approvals.",
    verticalCode: "HOUSING",
    priority: "Critical",
    dueDate: "2026-03-10",
    status: "UNDER_REVIEW",
    assignedTo: "Ms. Priya Nair",
    reviewer: "Shri Suvendu Das",
    schemeId: "PMAY-U",
    updates: [{ timestamp: "2026-03-01", actor: "Ms. Priya Nair", status: "IN_PROGRESS", note: "District returns compiled" }],
    proofFiles: [],
  },
  {
    title: "Submit Q3 PMAY beneficiary data to MIS",
    description: "GoI reporting deadline approaching.",
    verticalCode: "HOUSING",
    priority: "High",
    dueDate: "2026-03-18",
    status: "PROOF_UPLOADED",
    assignedTo: "Ms. Priya Nair",
    reviewer: "Shri Amit Kumar",
    schemeId: "PMAY-U",
    updates: [{ timestamp: "2026-03-10", actor: "Ms. Priya Nair", status: "PROOF_UPLOADED", note: "Files uploaded" }],
    proofFiles: [{ name: "PMAY MIS upload.xlsx", link: "#" }],
  },
  {
    title: "Grievance audit — flag 30+ day pending cases",
    description: "242 cases reviewed, 198 resolved.",
    verticalCode: "GRIEVANCE",
    priority: "Low",
    dueDate: "2026-03-25",
    status: "COMPLETED",
    assignedTo: "Shri Amit Kumar",
    reviewer: "Shri Suvendu Das",
    schemeId: "GRI-01",
    updates: [{ timestamp: "2026-03-01", actor: "Shri Amit Kumar", status: "COMPLETED", note: "Audit closed" }],
    proofFiles: [{ name: "Audit report.pdf", link: "#" }],
  },
];

/** Matches prisma `FinanceYearBudgetCategory`; ensures FY allocation + seven zero lines exist. */
const FINANCE_YEAR_BUDGET_CATEGORIES = [
  "STATE_SCHEME",
  "CENTRALLY_SPONSORED_SCHEME",
  "CENTRAL_SECTOR_SCHEME",
  "STATE_FINANCE_COMMISSION",
  "UNION_FINANCE_COMMISSION",
  "OTHER_TRANSFER_STAMP_DUTY",
  "ADMIN_EXPENDITURE",
];

async function ensureFinanceYearBudgetAllocationForYear(financialYearId) {
  let allocation = await prisma.financeYearBudgetAllocation.findUnique({
    where: { financialYearId },
  });
  if (!allocation) {
    allocation = await prisma.financeYearBudgetAllocation.create({
      data: {
        financialYearId,
        totalBudgetCr: 0,
      },
    });
  }
  for (const category of FINANCE_YEAR_BUDGET_CATEGORIES) {
    await prisma.financeYearBudgetCategoryLine.upsert({
      where: {
        allocationId_category: { allocationId: allocation.id, category },
      },
      update: {},
      create: {
        allocationId: allocation.id,
        category,
        budgetEstimateCr: 0,
        soExpenditureCr: 0,
        ifmsExpenditureCr: 0,
      },
    });
  }
}

async function main() {
  const now = new Date();

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: { code: p.code, name: p.name },
    });
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: { code: r.code, name: r.name },
    });

    const permissionRows = await prisma.permission.findMany({ where: { code: { in: r.permissions } } });
    for (const perm of permissionRows) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  for (const v of VERTICALS) {
    await prisma.vertical.upsert({
      where: { code: v.code },
      update: { name: v.name },
      create: { code: v.code, name: v.name },
    });
  }

  await prisma.financialYear.upsert({
    where: { label: "2025-26" },
    update: {
      startDate: new Date("2025-04-01"),
      endDate: new Date("2026-03-31"),
    },
    create: {
      label: "2025-26",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2026-03-31"),
    },
  });

  const fy = await prisma.financialYear.findUnique({ where: { label: "2025-26" } });
  if (!fy) throw new Error("Financial year not found");

  const allFys = await prisma.financialYear.findMany({ select: { id: true } });
  for (const row of allFys) {
    await ensureFinanceYearBudgetAllocationForYear(row.id);
  }

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, department: u.department, code: u.code },
      create: { name: u.name, email: u.email, department: u.department, code: u.code },
    });

    const role = await prisma.role.findUnique({ where: { code: u.role } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
  }

  const usersByName = await prisma.user.findMany({ select: { id: true, name: true, code: true } });
  const findUserId = (name) => {
    const normalize = (value) => (value || "").toLowerCase().replace(/\s+/g, " ").trim();
    const target = normalize(name);
    const direct = usersByName.find((u) => normalize(u.name) === target);
    if (direct) return direct.id;
    const partial = usersByName.find((u) => normalize(u.name).includes(target) || target.includes(normalize(u.name)));
    return partial ? partial.id : null;
  };

  const ensureScheme = async (code, verticalCode) => {
    const vertical = await prisma.vertical.findUnique({ where: { code: verticalCode } });
    if (!vertical) throw new Error(`Vertical not found: ${verticalCode}`);
    return prisma.scheme.upsert({
      where: { code },
      update: { name: code, verticalId: vertical.id, sponsorshipType: "STATE" },
      create: { code, name: code, verticalId: vertical.id, sponsorshipType: "STATE" },
    });
  };

  for (const entry of FINANCIAL_ENTRIES) {
    const scheme = await ensureScheme(entry.scheme, entry.verticalCode);
    const createdById = entry.submitterName ? findUserId(entry.submitterName) : null;

    const existingBudget = await prisma.financeBudget.findFirst({
      where: { schemeId: scheme.id, subschemeId: null, financialYearId: fy.id },
      select: { id: true },
    });

    if (existingBudget) {
      await prisma.financeBudget.update({
        where: { id: existingBudget.id },
        data: {
          budgetEstimateCr: entry.annualBudget,
          locked: false,
          createdById,
        },
      });
    } else {
      await prisma.financeBudget.create({
        data: {
          schemeId: scheme.id,
          subschemeId: null,
          financialYearId: fy.id,
          budgetEstimateCr: entry.annualBudget,
          locked: false,
          createdById,
        },
      });
    }

    const asOfDate = new Date(`${entry.lastUpdated}T00:00:00.000Z`);
    const existingSnapshot = await prisma.financeExpenditureSnapshot.findFirst({
      where: { schemeId: scheme.id, financialYearId: fy.id, asOfDate },
      select: { id: true },
    });

    if (existingSnapshot) {
      await prisma.financeExpenditureSnapshot.update({
        where: { id: existingSnapshot.id },
        data: {
          soExpenditureCr: entry.so,
          ifmsExpenditureCr: entry.ifms,
          remarks: entry.status,
          createdById,
        },
      });
    } else {
      await prisma.financeExpenditureSnapshot.create({
        data: {
          schemeId: scheme.id,
          subschemeId: null,
          financialYearId: fy.id,
          asOfDate,
          soExpenditureCr: entry.so,
          ifmsExpenditureCr: entry.ifms,
          remarks: entry.status,
          createdById,
        },
      });
    }
  }

  for (const row of KPI_SUBMISSIONS) {
    const scheme = await ensureScheme(row.scheme, row.verticalCode);
    const existingDefinition = await prisma.kpiDefinition.findFirst({
      where: { schemeId: scheme.id, description: row.description },
      select: { id: true },
    });

    const definition = existingDefinition
      ? await prisma.kpiDefinition.update({
          where: { id: existingDefinition.id },
          data: {
            category: row.category,
            kpiType: row.type,
            numeratorUnit: row.unit,
            denominatorUnit: row.unit,
          },
        })
      : await prisma.kpiDefinition.create({
          data: {
            schemeId: scheme.id,
            category: row.category,
            description: row.description,
            kpiType: row.type,
            numeratorUnit: row.unit,
            denominatorUnit: row.unit,
          },
        });

    const target = await prisma.kpiTarget.upsert({
      where: { kpiDefinitionId_financialYearId: { kpiDefinitionId: definition.id, financialYearId: fy.id } },
      update: { denominatorValue: row.denominator },
      create: { kpiDefinitionId: definition.id, financialYearId: fy.id, denominatorValue: row.denominator },
    });

    if (row.status !== "not_submitted") {
      const workflowStatus = row.status === "approved" ? "reviewed" : row.status === "submitted_pending" ? "submitted" : row.status;
      const measuredAt = new Date(`${row.lastUpdated}T00:00:00.000Z`);
      const existingMeasurement = await prisma.kpiMeasurement.findFirst({
        where: { kpiTargetId: target.id, measuredAt },
        select: { id: true },
      });

      if (existingMeasurement) {
        await prisma.kpiMeasurement.update({
          where: { id: existingMeasurement.id },
          data: {
            numeratorValue: row.numerator,
            yesValue: null,
            progressStatus: "on_track",
            workflowStatus,
            remarks: row.remarks,
          },
        });
      } else {
        await prisma.kpiMeasurement.create({
          data: {
            kpiTargetId: target.id,
            measuredAt,
            numeratorValue: row.numerator,
            yesValue: null,
            progressStatus: "on_track",
            workflowStatus,
            remarks: row.remarks,
            createdAt: now,
          },
        });
      }
    }
  }

  const meetingDate = new Date("2026-03-20T00:00:00.000Z");
  const existingMeeting = await prisma.dashboardMeeting.findFirst({
    where: { meetingDate, title: "Monthly Dashboard Meeting" },
    select: { id: true },
  });

  const meeting = existingMeeting
    ? await prisma.dashboardMeeting.update({
        where: { id: existingMeeting.id },
        data: { meetingDate, title: "Monthly Dashboard Meeting" },
      })
    : await prisma.dashboardMeeting.create({
        data: { meetingDate, title: "Monthly Dashboard Meeting" },
      });

  for (const item of ACTION_ITEMS) {
    const scheme = await ensureScheme(item.schemeId, item.verticalCode);
    const vertical = await prisma.vertical.findUnique({ where: { code: item.verticalCode } });
    const assignedToId = findUserId(item.assignedTo);
    const reviewerId = findUserId(item.reviewer);
    const dueDate = new Date(`${item.dueDate}T00:00:00.000Z`);
    const existingActionItem = await prisma.actionItem.findFirst({
      where: {
        meetingId: meeting.id,
        schemeId: scheme.id,
        title: item.title,
      },
      select: { id: true },
    });

    const actionItem = existingActionItem
      ? await prisma.actionItem.update({
          where: { id: existingActionItem.id },
          data: {
            subschemeId: null,
            verticalId: vertical?.id ?? null,
            itemType: "action_item",
            description: item.description,
            priority: item.priority,
            dueDate,
            status: item.status,
            assignedToId,
            reviewerId,
          },
        })
      : await prisma.actionItem.create({
          data: {
            meetingId: meeting.id,
            schemeId: scheme.id,
            subschemeId: null,
            verticalId: vertical?.id ?? null,
            itemType: "action_item",
            title: item.title,
            description: item.description,
            priority: item.priority,
            dueDate,
            status: item.status,
            assignedToId,
            reviewerId,
          },
        });

    for (const u of item.updates) {
      const actorId = findUserId(u.actor);
      const timestamp = new Date(`${u.timestamp}T00:00:00.000Z`);
      const existingUpdate = await prisma.actionItemUpdate.findFirst({
        where: {
          actionItemId: actionItem.id,
          timestamp,
          note: u.note,
        },
        select: { id: true },
      });

      if (existingUpdate) {
        await prisma.actionItemUpdate.update({
          where: { id: existingUpdate.id },
          data: {
            status: u.status,
            createdById: actorId,
          },
        });
      } else {
        await prisma.actionItemUpdate.create({
          data: {
            actionItemId: actionItem.id,
            timestamp,
            status: u.status,
            note: u.note,
            createdById: actorId,
          },
        });
      }
    }

    for (const proof of item.proofFiles) {
      const existingProof = await prisma.actionItemProof.findFirst({
        where: {
          actionItemId: actionItem.id,
          file: {
            name: proof.name,
            url: proof.link,
          },
        },
        include: { file: true },
      });

      if (existingProof) {
        await prisma.file.update({
          where: { id: existingProof.file.id },
          data: { uploadedById: assignedToId },
        });
      } else {
        const file = await prisma.file.create({
          data: {
            name: proof.name,
            url: proof.link,
            uploadedById: assignedToId,
          },
        });
        await prisma.actionItemProof.create({
          data: {
            actionItemId: actionItem.id,
            fileId: file.id,
            uploadedById: assignedToId,
          },
        });
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
