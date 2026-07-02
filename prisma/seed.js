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
  await prisma.release.upsert({
    where: { version: "1.3.0" },
    update: {},
    create: {
      version: "1.3.0",
      isCurrent: false,
      entries: {
        create: [
          {
            type: "NEW_FEATURE",
            title: "Scheme priority re-ordering for TASU users",
            description: "Allows TASU administrators to change the list order of schemes in the side panel.",
          },
          {
            type: "IMPROVEMENT",
            title: "Performance improvements on KPI dashboard pages",
            description: "Faster query loading time on major tables.",
          },
        ]
      }
    }
  });

  await prisma.release.upsert({
    where: { version: "1.4.0" },
    update: {
      isCurrent: true,
    },
    create: {
      version: "1.4.0",
      isCurrent: true,
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
