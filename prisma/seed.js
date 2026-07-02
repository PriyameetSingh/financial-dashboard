const { PrismaClient } = require("@prisma/client");
const { seedRolesAndPermissions } = require("./seed_roles_core.cjs");

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

const SECTIONS = [
  "Accounts",
  "PHE",
  "Municipal- II",
  "Co-Ordination",
  "Housing",
  "Relief & Rehabilitation",
  "Finance",
  "Budget",
  "Municipal - I",
  "UPA",
  "Sanitation",
  "Water Supply & Sewerage",
  "Town Planning",
  "O.E. Section",
  "e-Abhijoga Cell",
  "e-governance Cell",
  "Project",
  "Reforms",
  "Urban Mobility",
  "Directorate",
  "Election",
  "Legislation",
  "Legal Cell",
  "Audit",
  "Funds",
  "Pension",
  "Diary",
];

const ORGANISATIONS = [
  "DIRECTORATE OF TOWN PLANNING",
  "DEVELOPMENT AUTHORYTY",
  "DUDA",
  "ODISHA URBAN ACADEMY",
  "ORERA",
  "OUHM",
  "OUIDF",
  "OWSSB",
  "PHEO",
  "SUDA",
  // ULBs that are organisational entities are seeded separately into ULBS
  "WATCO",
];

const DESIGNATIONS = [
  "A.F.A CUM-DEPUTY SECRETARY",
  "A.F.A CUM-UNDER SECRETARY",
  "ADDITIONAL CHIEF ENGINEER",
  "ADDITIONAL CHIEF SECRETARY",
  "ADDITIONAL SECRETARY",
  "AFA-CUM-DEPUTY SECRETARY",
  "ASSISTANT AUDIT OFFICER",
  "ASSISTANT DIRECTOR (LAW)",
  "ASSISTANT MANAGER WATCO",
  "ASSISTANT SECTION OFFICER",
  "ASSITANT ENGINEER",
  "ASSITANT EXECUTIVE ENGINEER",
  "ASSITANT TOWN PLANNER",
  "ASSOCIATE TOWN PLANNER",
  "AUDIT OFFICER",
  "AUDITOR",
  "CEO-BMRCL",
  "CHIEF ENGINEER",
  "CHIEF ENGINEER AND EX-OFFICIO ADDITIONAL SECRETARY",
  "CHIEF TOWN PLANNER",
  "COMMISSIONER CUM SECRETARY",
  "DEPUTY  SECRETARY",
  "DESK OFFICER",
  "DIRECTOR -OUA",
  "DIRECTOR TOWN PLANNING",
  "DIRECTOR WATCO",
  "DMA & EX-OFFICIO ADDITIONAL SECRETARY",
  "EIC- OWSSB",
  "EIC-PHEO",
  "EXECUTIVE ENGINEER",
  "EXECUTIVE OFFICER",
  "F.A. -CUM ADDITIONAL SECRETARY",
  "GM-WATCO",
  "IAO-CUM-UNDER SECRETARY",
  "JOINT SECRETARY",
  "JUNIOR ENGINEER",
  "JUNIOR TOWN PLANNER",
  "MANAGER WATCO",
  "MD- WATCO",
  "MD-CRUT",
  "MD-OSHB",
  "MUNICIPAL COMMISSIONER",
  "OSD",
  "PLANNING MEMBER- DEVELOPMENT AUTORITY",
  "PRINCIPAL SECRETARY",
  "PROJECT DIRECTOR",
  "PROJECT DIRECTOR- SUDA",
  "SECRETARY- DEVELOPMENT AUTHORITY",
  "SECRETARY-OSHB",
  "SECTION OFFICER",
  "SPECIAL SECRETARY",
  "SUPERINTENDING ENGINEER",
  "TOWN PLANNER",
  "UNDER SECRETARY",
  "VC - DEVELOPMENT AUTHORITY",
];

const ULBS = [
  "Berhampur (MC)",
  "Bubaneswar (MC)",
  "Cuttack (MC)",
  "Puri (MC)",
  "Rourkela (MC)",
  "Sambalpur (MC)",
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
  await seedRolesAndPermissions(prisma);

  for (const v of VERTICALS) {
    await prisma.vertical.upsert({
      where: { code: v.code },
      update: { name: v.name },
      create: { code: v.code, name: v.name },
    });
  }

  // Seed reference tables: sections, organisations, designations, ulbs
  for (const name of SECTIONS) {
    await prisma.section.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of ORGANISATIONS) {
    await prisma.organisation.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of DESIGNATIONS) {
    await prisma.designation.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of ULBS) {
    await prisma.ulb.upsert({
      where: { name },
      update: {},
      create: { name },
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

  console.log("Seeding releases & changelog entries...");

  // Clear existing releases to avoid duplicate key issues during seeding
  await prisma.release.deleteMany({});

  await prisma.release.create({
    data: {
      version: "1.1.0",
      isCurrent: false,
      createdAt: new Date("2026-05-15T00:00:00Z"),
      entries: {
        create: [
          {
            type: "NEW_FEATURE",
            title: "Vertical Head <-> Nodal Officer task visibility linkage",
            description: "Each task has both a Vertical Head and a Nodal Officer assigned. A Vertical Head must be able to see all pending tasks of Nodal Officers who report to them. Requires a hierarchical relationship mapping between these roles. - Vertical head goes to my task and a pendance report table is visible",
          },
          {
            type: "NEW_FEATURE",
            title: "KPI Archive",
            description: "Ability to archive KPIs rather than permanently deleting them. Archived KPIs should be retrievable and excluded from active dashboards.",
          },
          {
            type: "BREAKING_CHANGE",
            title: "Nodal Officer to not have access to IFMS data",
            description: "Nodal Officers should not have visibility into IFMS (financial) data. Role-based access control must be updated immediately to restrict this permission.",
          },
          {
            type: "NEW_FEATURE",
            title: "Archive for decision items",
            description: "Completed decision items should support archiving similar to schemes and KPIs, allowing retrieval without cluttering active views.",
          },
        ]
      }
    }
  });

  await prisma.release.create({
    data: {
      version: "1.2.0",
      isCurrent: false,
      createdAt: new Date("2026-06-10T00:00:00Z"),
      entries: {
        create: [
          {
            type: "IMPROVEMENT",
            title: "Colour-coded pending / approved items in reports and dashboard",
            description: "Pending and approved items should be visually differentiated using a consistent colour scheme across all report views and the main dashboard.",
          },
          {
            type: "NEW_FEATURE",
            title: "Re-ordering schemes",
            description: "Add feature to rearrange and save preset for schemes list view",
          },
          {
            type: "NEW_FEATURE",
            title: "Separate FA role for Nodal Officers (financial data entry)",
            description: "A distinct Financial Assistant (FA) role should be creatable and assignable to Nodal Officers specifically for financial data entry, separate from their standard Nodal Officer permissions.",
          },
          {
            type: "IMPROVEMENT",
            title: "Schemes list view expand state",
            description: "add an expand state in List view similar to kahnban board view with scheme components",
          },
          {
            type: "IMPROVEMENT",
            title: "Scheme List view Filters",
            description: "Add filters for State sector, central sector and central sponsor in Schemes",
          },
          {
            type: "IMPROVEMENT",
            title: "Decision items — optional reviewer (auto-approval if action = reviewer)",
            description: "The reviewer field on decision items should be optional. If the action person and reviewer are the same individual, the item should be automatically marked as approved without a separate review step.",
          },
        ]
      }
    }
  });

  await prisma.release.create({
    data: {
      version: "1.3.0",
      isCurrent: false,
      createdAt: new Date("2026-06-25T00:00:00Z"),
      entries: {
        create: [
          {
            type: "IMPROVEMENT",
            title: "UI — logo repositioning, colour changes, and header update",
            description: "Reposition logo as per design spec, apply colour updates, and rename the header field from Source Date to Meeting Date.",
          },
          {
            type: "NEW_FEATURE",
            title: "System settings — CRUD for master data",
            description: "Admin interface to create, read, update, and delete master data entities: Organisations, Verticals, Sections, ULBs, and Designations.",
          },
          {
            type: "NEW_FEATURE",
            title: "User profile page — change password and reset password",
            description: "Users should be able to change their own password from their profile page. Admins should have a reset password option for other users.",
          },
          {
            type: "IMPROVEMENT",
            title: "Report download filters",
            description: "When downloading reports, users should be able to apply filters including: monitoring level (CM / CS / ACS), priority, and status (in-progress / completed).",
          },
          {
            type: "IMPROVEMENT",
            title: "Proposed presentations to appear under Topics for Discussion in reports",
            description: "In report views, proposed presentations should be grouped under the Topics for Discussion section rather than displayed as a separate standalone section.",
          },
          {
            type: "NEW_FEATURE",
            title: "multiple owners for same task",
            description: "If multiple owners are assigned to a task, system should moniter which user is adding what update, same to be shown on reports",
          },
          {
            type: "NEW_FEATURE",
            title: "Past task owner",
            description: "System should remember is someone was assigned to a task before, and show his work in reports too",
          },
        ]
      }
    }
  });

  await prisma.release.create({
    data: {
      version: "1.4.0",
      isCurrent: true,
      createdAt: new Date("2026-07-02T00:00:00Z"),
      entries: {
        create: [
          {
            type: "NEW_FEATURE",
            title: "Version and Changelog System",
            description: "Tracks discrete releases and highlights new updates to TASU officers on login.",
          },
          {
            type: "IMPROVEMENT",
            title: "Sidebar styling enhancements",
            description: "Polished look with more compact layout alignment.",
          },
          {
            type: "FIX",
            title: "Resolved layout overlap on mobile viewports",
            description: "Fixed mobile navigation menu display.",
          },
        ]
      }
    }
  });
  console.log("Releases seeded successfully!");
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
