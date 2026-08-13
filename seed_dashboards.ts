/**
 * Seed script for 52nd and 61st HUDD Dashboard data
 *
 * 52nd Dashboard  → meeting date: 2025-12-26 (expenditure data is "as on 26.12.2025")
 * 61st Dashboard  → meeting date: 2026-03-20 (expenditure data is "as on 20.03.2026")
 *
 * Run: npx ts-node seed_dashboards.ts
 * (or tsx seed_dashboards.ts if you have tsx installed)
 *
 * UIDs:
 *   Nodal Officer (assignedToId for action items & KPI assignee): 6bc4de32-decf-4af1-90c1-0ce7813ac362
 *   ACS (reviewerId / reviewer for action items & KPIs):           7eb9971e-7b21-4624-a6a1-052e923d2658
 */

import { ActionItemStatus, ActionItemPriority, ActionItemType, KPIProgressStatus, KPIWorkflowStatus, KPIType, KPICategory, FinancialWorkflowStatus, SponsorshipType } from "@prisma/client";

import { prisma } from "./lib/prisma";
import { ODISHA_TENANT_ID } from "./lib/tenant-config";
import { enterTenantScope } from "./lib/tenant-context";

/**
 * Phase 2 tenancy: this seed runs outside any request, so it enters an explicit
 * tenant scope (default: the Odisha tenant, override with SEED_TENANT_ID). Every
 * write then flows through the same tenant chokepoint the app uses and is
 * stamped automatically.
 */
const SEED_TENANT_ID = process.env.SEED_TENANT_ID || ODISHA_TENANT_ID;

// ── User IDs ──────────────────────────────────────────────────────────────────
const NODAL_OFFICER_ID = "6bc4de32-decf-4af1-90c1-0ce7813ac362";
const ACS_ID = "7eb9971e-7b21-4624-a6a1-052e923d2658";

// ── Helpers ───────────────────────────────────────────────────────────────────
function d(dateStr: string): Date {
  return new Date(dateStr);
}

function parseStatus(raw: string | null | undefined): ActionItemStatus {
  if (!raw) return ActionItemStatus.OPEN;
  const s = raw.trim().toLowerCase();
  if (s.includes("completed")) return ActionItemStatus.COMPLETED;
  if (s.includes("overdue")) return ActionItemStatus.OVERDUE;
  if (s.includes("in progress")) return ActionItemStatus.IN_PROGRESS;
  return ActionItemStatus.OPEN; // "Pending" → OPEN
}

function parseDueDate(raw: string | null | undefined): Date {
  if (!raw) return new Date("2026-03-31");
  const trimmed = String(raw).trim();
  // already a parseable date string
  const attempt = new Date(trimmed);
  if (!isNaN(attempt.getTime())) return attempt;
  // try "DD-MM-YYYY" or "DD-MM-YY"
  const ddmm = trimmed.match(/(\d{2})-(\d{2})-(\d{2,4})/);
  if (ddmm) {
    const [, dd, mm, yy] = ddmm;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return new Date(`${year}-${mm}-${dd}`);
  }
  return new Date("2026-03-31");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await enterTenantScope(SEED_TENANT_ID);
  console.log("🌱  Seeding HUDD Dashboard data…\n");

  // ── Financial Year 2025-26 ─────────────────────────────────────────────────
  const fy2526 = await prisma.financialYear.upsert({
    where: { tenantId_label: { tenantId: SEED_TENANT_ID, label: "2025-26" } },
    update: {},
    create: {
      label: "2025-26",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2026-03-31"),
    },
  });
  console.log(`✅  Financial year: ${fy2526.label}`);

  // ── Vertical ──────────────────────────────────────────────────────────────
  const vertical = await prisma.vertical.upsert({
    where: { tenantId_code: { tenantId: SEED_TENANT_ID, code: "HUDD" } },
    update: {},
    create: { code: "HUDD", name: "Housing & Urban Development Department" },
  });
  console.log(`✅  Vertical: ${vertical.name}`);

  // ──────────────────────────────────────────────────────────────────────────
  //  SCHEMES (derived from Pg-2 / scheme-wise budget sheets)
  // ──────────────────────────────────────────────────────────────────────────
  const schemeData: {
    code: string;
    name: string;
    sponsorshipType: SponsorshipType;
  }[] = [
    // State Sector
    { code: "SUJALA", name: "SUJALA (Water Supply)", sponsorshipType: "STATE" },
    { code: "SWACHHA_ODISHA", name: "Swachha Odisha", sponsorshipType: "STATE" },
    { code: "MSBY", name: "Mukhyamantri Sahari Bikash Yojana (MSBY)", sponsorshipType: "STATE" },
    { code: "CB_RM", name: "Capacity Building & Resource Management", sponsorshipType: "STATE" },
    { code: "URBAN_MOBILITY", name: "Urban Mobility (CRUT)", sponsorshipType: "STATE" },
    { code: "SAMRUDDHA_SAHARA", name: "Samruddha Sahara", sponsorshipType: "STATE" },
    { code: "AAHAAR", name: "AAHAAR", sponsorshipType: "STATE" },
    { code: "RURAL_URBAN", name: "Rural Urban Transition", sponsorshipType: "STATE" },
    { code: "GARIMA", name: "GARIMA (Sanitation Workers Safety)", sponsorshipType: "STATE" },
    // Centrally Sponsored
    { code: "SBM_U", name: "Swachha Bharat Mission - Urban (SBM-U)", sponsorshipType: "CENTRAL" },
    { code: "PMAY_U", name: "Pradhan Mantri Awas Yojana - Urban (PMAY-U)", sponsorshipType: "CENTRAL" },
    { code: "AMRUT", name: "AMRUT 2.0", sponsorshipType: "CENTRAL" },
    { code: "NULM", name: "National Urban Livelihoods Mission (NULM)", sponsorshipType: "CENTRAL" },
    { code: "PM_EBUS", name: "PM e-Bus Sewa", sponsorshipType: "CENTRAL" },
    { code: "D_JAY", name: "D-JAY (S)", sponsorshipType: "CENTRAL" },
  ];

  const schemes: Record<string, string> = {};
  for (const s of schemeData) {
    const scheme = await prisma.scheme.upsert({
      where: { tenantId_code: { tenantId: SEED_TENANT_ID, code: s.code } },
      update: {},
      create: {
        code: s.code,
        name: s.name,
        verticalName: vertical.name,
        sponsorshipType: s.sponsorshipType,
      },
    });
    schemes[s.code] = scheme.id;
  }
  console.log(`✅  Upserted ${schemeData.length} schemes`);

  // ──────────────────────────────────────────────────────────────────────────
  //  FINANCE YEAR BUDGET ALLOCATION  (top-level totals – both dashboards)
  //  Using 61st (latest) as the source of truth for BE; 52nd for earlier snapshot
  // ──────────────────────────────────────────────────────────────────────────
  const allocation = await prisma.financeYearBudgetAllocation.upsert({
    where: { financialYearId: fy2526.id },
    update: { totalBudgetCr: 9907.56 },
    create: {
      financialYearId: fy2526.id,
      totalBudgetCr: 9907.56,
      createdById: NODAL_OFFICER_ID,
    },
  });

  const categoryLines = [
    { category: "STATE_SCHEME" as const,                budgetEstimateCr: 4365,    soExpenditureCr: 4327.37, ifmsExpenditureCr: 3810.23 },
    { category: "CENTRALLY_SPONSORED_SCHEME" as const,  budgetEstimateCr: 2164,    soExpenditureCr: 1301.78, ifmsExpenditureCr: 1034.86 },
    { category: "CENTRAL_SECTOR_SCHEME" as const,       budgetEstimateCr: 0,       soExpenditureCr: 0,       ifmsExpenditureCr: 0 },
    { category: "STATE_FINANCE_COMMISSION" as const,    budgetEstimateCr: 1489.78, soExpenditureCr: 1488.52, ifmsExpenditureCr: 1484.34 },
    { category: "UNION_FINANCE_COMMISSION" as const,    budgetEstimateCr: 1069.66, soExpenditureCr: 469.53,  ifmsExpenditureCr: 469.52 },
    { category: "OTHER_TRANSFER_STAMP_DUTY" as const,   budgetEstimateCr: 130.19,  soExpenditureCr: 130.19,  ifmsExpenditureCr: 125.65 },
    { category: "ADMIN_EXPENDITURE" as const,           budgetEstimateCr: 688.93,  soExpenditureCr: 0,       ifmsExpenditureCr: 540.92 },
  ];

  for (const line of categoryLines) {
    await prisma.financeYearBudgetCategoryLine.upsert({
      where: { allocationId_category: { allocationId: allocation.id, category: line.category } },
      update: { budgetEstimateCr: line.budgetEstimateCr, soExpenditureCr: line.soExpenditureCr, ifmsExpenditureCr: line.ifmsExpenditureCr },
      create: { allocationId: allocation.id, ...line },
    });
  }
  console.log(`✅  Finance year budget allocation (61st data, as of 20-Mar-2026)`);

  // ──────────────────────────────────────────────────────────────────────────
  //  SCHEME-LEVEL BUDGETS  (state sector – from 61st Pg-2)
  // ──────────────────────────────────────────────────────────────────────────
  const schemeBudgets: { code: string; budgetCr: number }[] = [
    { code: "SUJALA",         budgetCr: 808 },
    { code: "SWACHHA_ODISHA", budgetCr: 311 },
    { code: "MSBY",           budgetCr: 1200 },
    { code: "CB_RM",          budgetCr: 50 },
    { code: "URBAN_MOBILITY", budgetCr: 335 },
    { code: "SAMRUDDHA_SAHARA", budgetCr: 408.29 },
    { code: "AAHAAR",         budgetCr: 65 },
    { code: "RURAL_URBAN",    budgetCr: 100 },
    { code: "GARIMA",         budgetCr: 0.0001 },
    { code: "SBM_U",          budgetCr: 362 },
    { code: "PMAY_U",         budgetCr: 795.59 },
    { code: "AMRUT",          budgetCr: 949.31 },
    { code: "NULM",           budgetCr: 6 },
    { code: "PM_EBUS",        budgetCr: 39.05 },
    { code: "D_JAY",          budgetCr: 4.0015 },
  ];

  for (const sb of schemeBudgets) {
    if (!schemes[sb.code]) continue;
    await prisma.financeBudget.upsert({
      where: { schemeId_subschemeId_financialYearId: { schemeId: schemes[sb.code], subschemeId: null as any, financialYearId: fy2526.id } },
      update: { budgetEstimateCr: sb.budgetCr },
      create: {
        schemeId: schemes[sb.code],
        financialYearId: fy2526.id,
        budgetEstimateCr: sb.budgetCr,
        createdById: NODAL_OFFICER_ID,
      },
    });
  }
  console.log(`✅  Scheme budget estimates upserted`);

  // ──────────────────────────────────────────────────────────────────────────
  //  EXPENDITURE SNAPSHOTS
  //  52nd → asOfDate 2025-12-26
  //  61st → asOfDate 2026-03-20
  // ──────────────────────────────────────────────────────────────────────────
  const snapshots: {
    code: string;
    asOfDate: string;
    soExp: number;
    ifmsExp: number;
  }[] = [
    // ── 52nd (26-Dec-2025) ─────────────────────────────────────
    { code: "SBM_U",     asOfDate: "2025-12-26", soExp: 101.81, ifmsExp: 36.49 },
    { code: "PMAY_U",    asOfDate: "2025-12-26", soExp: 304.56, ifmsExp: 81.06 },
    { code: "AMRUT",     asOfDate: "2025-12-26", soExp: 765.95, ifmsExp: 620.65 },
    { code: "PM_EBUS",   asOfDate: "2025-12-26", soExp: 20.25,  ifmsExp: 10.12 },
    { code: "D_JAY",     asOfDate: "2025-12-26", soExp: 4,      ifmsExp: 4 },
    { code: "SWACHHA_ODISHA", asOfDate: "2025-12-26", soExp: 148.25 + 73.05, ifmsExp: 148.25 + 73.05 },
    { code: "MSBY",      asOfDate: "2025-12-26", soExp: 553.44 + 123.31 + 45 + 65.46 + 273.96, ifmsExp: 447.52 + 123.31 + 45 + 65.46 + 273.96 },
    { code: "URBAN_MOBILITY", asOfDate: "2025-12-26", soExp: 189.08, ifmsExp: 189.08 },
    // ── 61st (20-Mar-2026) ────────────────────────────────────
    { code: "SUJALA",    asOfDate: "2026-03-20", soExp: 4327.37, ifmsExp: 3810.23 }, // state sector total as proxy; replace with scheme-level if available
    { code: "SBM_U",     asOfDate: "2026-03-20", soExp: 115.14, ifmsExp: 75.01 },
    { code: "PMAY_U",    asOfDate: "2026-03-20", soExp: 311.2,  ifmsExp: 175.7 },
    { code: "AMRUT",     asOfDate: "2026-03-20", soExp: 844.92, ifmsExp: 763.93 },
    { code: "PM_EBUS",   asOfDate: "2026-03-20", soExp: 26.52,  ifmsExp: 15.98 },
    { code: "D_JAY",     asOfDate: "2026-03-20", soExp: 4,      ifmsExp: 4 },
    { code: "MSBY",      asOfDate: "2026-03-20", soExp: 1200,   ifmsExp: 1138.09 },
    { code: "URBAN_MOBILITY", asOfDate: "2026-03-20", soExp: 331.25, ifmsExp: 236.33 },
    { code: "SAMRUDDHA_SAHARA", asOfDate: "2026-03-20", soExp: 407.5, ifmsExp: 308.3 },
    { code: "AAHAAR",    asOfDate: "2026-03-20", soExp: 65, ifmsExp: 65 },
  ];

  for (const snap of snapshots) {
    if (!schemes[snap.code]) continue;
    // Use createMany-style; no unique constraint on scheme+date, so just create
    await prisma.financeExpenditureSnapshot.create({
      data: {
        schemeId: schemes[snap.code],
        financialYearId: fy2526.id,
        asOfDate: new Date(snap.asOfDate),
        soExpenditureCr: snap.soExp,
        ifmsExpenditureCr: snap.ifmsExp,
        workflowStatus: FinancialWorkflowStatus.submitted,
        createdById: NODAL_OFFICER_ID,
      },
    }).catch(() => {/* ignore duplicates on rerun */});
  }
  console.log(`✅  Expenditure snapshots inserted (52nd & 61st)`);

  // ──────────────────────────────────────────────────────────────────────────
  //  52nd DASHBOARD MEETING  (December 2025)
  // ──────────────────────────────────────────────────────────────────────────
  const meeting52 = await prisma.dashboardMeeting.create({
    data: {
      meetingDate: new Date("2025-12-26"),
      title: "52nd HUDD Dashboard Meeting",
      notes: "Monthly review meeting. Financial data as on 26-Dec-2025.",
      createdById: NODAL_OFFICER_ID,
    },
  });
  console.log(`✅  Created 52nd Dashboard meeting (${meeting52.id})`);

  // ──────────────────────────────────────────────────────────────────────────
  //  61st DASHBOARD MEETING  (March 2026)
  // ──────────────────────────────────────────────────────────────────────────
  const meeting61 = await prisma.dashboardMeeting.create({
    data: {
      meetingDate: new Date("2026-03-20"),
      title: "61st HUDD Dashboard Meeting",
      notes: "Monthly review meeting. Financial data as on 20-Mar-2026.",
      createdById: NODAL_OFFICER_ID,
    },
  });
  console.log(`✅  Created 61st Dashboard meeting (${meeting61.id})`);

  // Meeting topics – Pg-1 of 61st
  const topics61 = [
    "Proposed Presentations by Verticals",
    "Monthly Achievement to P&C Department – every month by 28/30th",
    "Odisha Gas Distribution Policy by 1st April 2026",
    "EFC and Cabinet Proposals for approval – Timelines Mandated (FA-SB)",
    "District Visit of officials",
    "Reform Agenda",
    "New Big Ticket Items",
  ];
  for (const topic of topics61) {
    await prisma.meetingTopic.create({ data: { meetingId: meeting61.id, topic, createdById: NODAL_OFFICER_ID } });
  }
  console.log(`✅  Meeting topics for 61st (${topics61.length})`);

  // ──────────────────────────────────────────────────────────────────────────
  //  ACTION ITEMS  (from 61st Pg-3 – "Key Decisions from last dashboard Meetings")
  //  assignedTo → Nodal Officer,  reviewer → ACS
  // ──────────────────────────────────────────────────────────────────────────
  interface AIRow {
    title: string;
    description: string;
    dueDate: string;
    status: ActionItemStatus;
    update: string;
  }

  const actionItems61: AIRow[] = [
    {
      title: "OUA Road Upgrade – Director OUA",
      description: "The road connecting to Odisha Urban Academy (OUA) is to be upgraded with the expert support of WRI in urban space designing.",
      dueDate: "2025-07-31",
      status: ActionItemStatus.OVERDUE,
      update: "It is assigned to Bhubaneswar Development Authority. Tender floated, 3 bids received. Technical evaluation is under progress.",
    },
    {
      title: "OUA Road Upgrade – EIC-OWSSB",
      description: "The road connecting to Odisha Urban Academy (OUA) is to be upgraded with the expert support of WRI in urban space designing.",
      dueDate: "2025-07-31",
      status: ActionItemStatus.OVERDUE,
      update: "It is assigned to Bhubaneswar Development Authority. Tender floated, 3 bids received. Technical evaluation is under progress.",
    },
    {
      title: "Restructuring of DUDA – AS-RKS",
      description: "Restructuring of DUDA to be finalised.",
      dueDate: "2025-08-04",
      status: ActionItemStatus.OVERDUE,
      update: "FD had returned file the 2nd time with some observations on Finance Commission recommendation. The same will be submitted this week.",
    },
    {
      title: "Water Front Development – AS-SK",
      description: "Water front Development: DPR already made to be reviewed. Work for key components to be taken up on priority. Tender to be floated on priority for Mahanadi Riverfront Development. Similarly for Budhabalang at Mayurbhanj, proposal to be obtained, reviewed and tender to be floated.",
      dueDate: "2025-08-12",
      status: ActionItemStatus.OVERDUE,
      update: "EFC meeting held under chairmanship of Principal Secretary, Finance Department. Minutes forwarded through FA for kind signature.",
    },
    {
      title: "Cuttack Drainage Master Plan – AS-cum-CE",
      description: "Cuttack Drainage Master Plan issues to be resolved. Proposal to be submitted by CMC.",
      dueDate: "2025-11-10",
      status: ActionItemStatus.OPEN,
      update: "All estimates, designs received from Commissioner CMC Cuttack by H&UD Deptt. handed over to WATCO. Balance estimates, design & documents to be supplied by City Engineer CMC directly to MD WATCO.",
    },
    {
      title: "River-front Development CMC Handholding – AS-SK",
      description: "River-front Development: Handholding support to be provided to CMC, Cuttack for expediting the activities.",
      dueDate: "2025-11-10",
      status: ActionItemStatus.COMPLETED,
      update: "File has been processed for fixing of a date for meeting on Mahanadi waterfront development.",
    },
    {
      title: "PM Awas Bandhu & ULB Governance Cabinet – AS-SM",
      description: "All the relevant documents of PM Awas Bandhu and ULB Governance ready for the next Cabinet meeting.",
      dueDate: "2025-11-16",
      status: ActionItemStatus.COMPLETED,
      update: "Approval given by HCM for 3 components under PMAY Urban BANDHU. Rs 51 crore released to ULBs against Labour Contribution Component and Rs 49 crore released under ARH component.",
    },
    {
      title: "Encroachment Issues Meeting – AS-RKS",
      description: "Organise a separate meeting on encroachment issues with all Municipal Commissioners. Actionable strategies to be finalised by senior officers.",
      dueDate: "2025-12-31",
      status: ActionItemStatus.OPEN,
      update: "Scheduled to be held this week.",
    },
    {
      title: "PMAY – Land Identification for 5 Corporations and Puri – AS-SM",
      description: "PMAY: 5 Corporations and Puri – Land Identification to be ensured for taking forward housing activities.",
      dueDate: "2025-12-31",
      status: ActionItemStatus.OVERDUE,
      update: "Necessary steps are being taken by Corporations and Puri for identification of land. Cuttack MC has already identified land at multiple locations. Post feasibility analysis these land parcels will be demarcated for housing.",
    },
    {
      title: "Transgender Hostel Inauguration – MD-WATCO",
      description: "Transgender Hostel Inauguration: A coordination meeting to be convened with SSEPD Department and stakeholders to finalise the SoP. A detailed inauguration plan to be prepared.",
      dueDate: "2025-12-31",
      status: ActionItemStatus.COMPLETED,
      update: "Meeting conducted with Special Secretary SSEPD, Joint Secretary H&UD, and MD WATCO. Hostel jointly visited. Draft Standard Operating Procedure prepared for management, operation, and maintenance.",
    },
    {
      title: "Rourkela Street Light Retrofitting – AO-OUIDF",
      description: "MC Rourkela – Street Light Retrofitting: The additional retrofitting streetlight proposal to be submitted by RMC, Rourkela to be examined and considered for loan assistance from OUIDF.",
      dueDate: "2026-01-01",
      status: ActionItemStatus.OVERDUE,
      update: "Proposal from RMC is yet to be received at OUIDF for examination and consideration of Loan assistance.",
    },
    {
      title: "Cabinet Approval – Metro Note – FA-SB",
      description: "Cabinet Approvals: Metro Note – 9th Jan 2026.",
      dueDate: "2026-01-09",
      status: ActionItemStatus.OVERDUE,
      update: "Submitted to Finance department on 18.1.2026. Finance concurrence received on 9.2.2026. Under process.",
    },
    {
      title: "Rural Urban Transition Policy Finalisation – AS-RKS",
      description: "Rural Urban Transition Policy (RUTP) – Guidelines and Modalities to be finalized.",
      dueDate: "2026-01-12",
      status: ActionItemStatus.OPEN,
      update: "Finalized. Resubmitted for approval.",
    },
    {
      title: "Construction of Office Buildings – O&M Guidelines – AS-cum-CE",
      description: "Construction of Office Buildings – O&M part to be ensured while approving and sanctioning. A Model Guidelines to be issued. Training programmes for JEs to be organised along with the contractors.",
      dueDate: "2026-01-27",
      status: ActionItemStatus.OPEN,
      update: "Odisha Urban academy requested to prepare a draft syllabus on the topic of training so as to finalise and thereafter impart training.",
    },
    {
      title: "PHEO Cadre Restructuring Presentation – EIC-PHEO",
      description: "Restructuring of PHEO Cadre – a Presentation to be made before the Principal Secretary H&UD.",
      dueDate: "2026-01-27",
      status: ActionItemStatus.OPEN,
      update: "Re-structuring proposal has been prepared and under scrutiny with GA Deptt. The final proposal will be presented by 25th Mar 2026.",
    },
    {
      title: "FSTP 2.0 Gap Assessment – AS-BKD",
      description: "FSTP 2.0 – Gaps to be assessed and action to be taken.",
      dueDate: "2026-01-30",
      status: ActionItemStatus.OPEN,
      update: "Gaps in implementation of FSTP 2.0 have been assessed. Completed in 49 FSTPs and at different stages of execution in rest 70 FSTPs.",
    },
    {
      title: "RMC Rourkela Land Review for PPP – AS-SK",
      description: "RMC Rourkela – The land identified for taken of projects under PPP to be reviewed and taken forward.",
      dueDate: "2026-03-15",
      status: ActionItemStatus.OPEN,
      update: "OUDH Team has visited the site. After land verification tender will be floated.",
    },
    {
      title: "EFC Approvals – Water Front/ULB Governance/LHM – FA-SB",
      description: "EFC Approvals: (i) Water Front Development – 30th Jan 2026; (ii) ULB Governance – 20th Jan 2026; (iii) Liveable Habitat Mission – 30th Jan 2026.",
      dueDate: "2026-01-31",
      status: ActionItemStatus.OPEN,
      update: "File moved to Finance Department.",
    },
    {
      title: "Tarva Bus Stand Deviation – JS MRN",
      description: "Tarva Bus Stand Deviation proposal Issue: To be coordinated with Works Department and closely pursued.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "EO Tarva and Superintendent Engineer (R&B) have been requested to appraise the matter on deviation proposal to FA in person.",
    },
    {
      title: "OUIDF Loan for Berhampur Formalities – AO-OUIDF",
      description: "All formalities for the release of the OUIDF loan for Berhampur are to be completed within one week.",
      dueDate: "2026-02-07",
      status: ActionItemStatus.COMPLETED,
      update: "Formalities like Administrative Approval and permission to avail loan by BeMC completed. In-principle Approval granted. Under process at OUIDF for sanction of loan by the Loan Committee.",
    },
    {
      title: "Cabinet Approval – Water Front Development – FA-SB",
      description: "Cabinet Approvals: Water Front Development – 13th Feb 2026.",
      dueDate: "2026-02-13",
      status: ActionItemStatus.OVERDUE,
      update: "EFC proposal pending at FD.",
    },
    {
      title: "Cabinet Approval – ULB Governance – FA-SB",
      description: "Cabinet Approvals: ULB Governance – 13th Feb 2026.",
      dueDate: "2026-02-13",
      status: ActionItemStatus.OVERDUE,
      update: "EFC proposal pending – returned by FD.",
    },
    {
      title: "Cabinet Approval – Liveable Habitat Mission – FA-SB",
      description: "Cabinet Approvals: Liveable Habitat Mission – 13th Feb 2026.",
      dueDate: "2026-02-13",
      status: ActionItemStatus.OVERDUE,
      update: "",
    },
    {
      title: "Legacy Finance Commission & MSBY Data Update – AS-RKS/FA-SB",
      description: "Updating legacy data of the Finance Commission and MSBY to be completed by the end of February 2026.",
      dueDate: "2026-02-28",
      status: ActionItemStatus.OVERDUE,
      update: "In progress.",
    },
    {
      title: "WATCO/PHEO Shelf of Projects for Next 3 Years",
      description: "WATCO/PHEO are to create a shelf of projects for the next three years to ensure timely expenditure.",
      dueDate: "2026-02-20",
      status: ActionItemStatus.OPEN,
      update: "PHEO – List of water supply projects for FY 2026-27 and 2027-28 prepared and submitted. WATCO – List of projects under review. Final project list will be submitted by 25th Mar 2026.",
    },
    {
      title: "BMRCL Metro Rail Note Finance Clearance – CEO-BMRCL/AFA-HUDD",
      description: "BMRCL shall pursue clearance of the Metro rail note with the Finance Department and ensure it is placed in the upcoming Cabinet Meeting.",
      dueDate: "2026-02-16",
      status: ActionItemStatus.COMPLETED,
      update: "Finance concurrence received on 9.2.2026. Under process.",
    },
    {
      title: "BeMC OUIDF Loan Proposal – AO-OUIDF/JS-SD",
      description: "BeMC, Berhampur – OUIDF proposal. An interim letter to go from OUIDF on taking forward. May be processed to be placed before the Loan Committee.",
      dueDate: "2026-02-20",
      status: ActionItemStatus.OPEN,
      update: "In-principle Approval granted to expedite project work by BeMC. Under process at OUIDF for sanction of loan by the Loan Committee.",
    },
    {
      title: "BMC Drainage Works near ISKON – AS-cum-CE-BM",
      description: "The proposal for BMC drainage works near ISKON shall be finalized in consultation with BMC and cleared within one week.",
      dueDate: "2026-02-20",
      status: ActionItemStatus.OVERDUE,
      update: "The proposal for BMC drainage works near ISKON has been recommended for administrative approval for an amount of Rs 29.07 cr.",
    },
    {
      title: "Water Park & Water Bodies – Pradeep Municipality – AS-SK",
      description: "The proposal for development of a Water Park and development of water bodies in Pradeep Municipality shall be pursued. The availability of 5 acres of land with DUDA shall be examined.",
      dueDate: "2026-02-22",
      status: ActionItemStatus.OPEN,
      update: "Proposal for development of a Water Park and development of water bodies in Pradeep Municipality has been processed.",
    },
    {
      title: "Urban Land Bank – Convergence with Revenue Dept – AS-BKD",
      description: "A note shall be prepared regarding convergence of land with the Revenue Department for creation of a land bank at the ULB level.",
      dueDate: "2026-02-22",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Transgender Cell – SoP Preparation – JS-MRN",
      description: "Transgender Cell – A SoP with their job description to be prepared. The Cell will be operating from Unnati Bhawan.",
      dueDate: "2026-02-22",
      status: ActionItemStatus.OPEN,
      update: "SOP for the TG cell is in process.",
    },
    {
      title: "Drainage CMC – WATCO Handover – AS-cum-CE-BM",
      description: "Drainage Proposal of CMC: The Chief Engineer shall write to CMC informing that the agency for DPR preparation is to be disengaged and all activities shall henceforth be undertaken by WATCO.",
      dueDate: "2026-02-18",
      status: ActionItemStatus.COMPLETED,
      update: "Necessary instruction issued vide letter No-(Funds)-4906 dt 17.2.2026.",
    },
    {
      title: "New City Development – BDA Fund Release Proposal – VC-BDA",
      description: "New City Development – BDA to submit a proposal for release of fund.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Samruddha Sahar – Cities as Growth Hub Big Ticket Projects – AS-SK",
      description: "Samruddha Sahar – Cities as Growth Hub: The Municipal Corporation to send Big Ticket infra projects.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "PMAY Bandhu Concept Note – AS-SM",
      description: "PMAY Bandhu: In case Detailed Project Report is getting delayed, a concept note to be submitted by Municipal Corporations.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Waterfront Development – Mahanadi CDA Coordination – AS-SK",
      description: "Waterfront Development Mahanadi: CDA to take up the projects with Water Resource Department in the line of the DPR prepared.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Rourkela AHP & ARH DPR by 27th Feb – AS-SM",
      description: "Rourkela to submit the AHP and ARH DPR by 27th Feb 2026.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Berhampur AHP & ARH DPR – AS-SM",
      description: "Berhampur – AHP project DPR to be prepared. ARH proposal to be submitted by 27th Feb 2026.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "BMC – ARH Tender, SASCI, Creative Re-Development – AS-SM/AS-SK",
      description: "Bhubaneswar Municipal Corporation: ARH – To be tendered this week. SASCI – Big ticket proposal from BDA/BMC. Creative Re-Development – Proposal submitted.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Sambalpur – ARH, Multi-Level Parking, Street Light, SASCI, Waterfront – Multiple",
      description: "Sambalpur: ARH proposal to be submitted by 27th Feb. Multi-Level Car Parking under Cities as Growth Hub. Street Lighting tender to be finalised. Water Front Development – Durgapalli pond proposal within three days.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "Street Light: Independent Engineer for ongoing street light project (M/s PTC India Ltd.) can be engaged on nomination basis for preparation of DPR.",
    },
    {
      title: "Cuttack – AHP/ARC, Auditorium Convention Centre, SASCI – AS-SM/AS-SK",
      description: "Cuttack: AHP/ARC proposal to be submitted. Cities as Growth Hub: DPR to be submitted for the proposed Auditorium-cum-Convention Centre. SASCI – Major project if any to be submitted.",
      dueDate: "2026-02-03",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "GARIMA CSW – PMAY Linkage – JS-MRN",
      description: "Eligible core sanitation workers under the GARIMA scheme shall be linked with PMAY, and priority shall be given for providing housing under PMAY 2.0.",
      dueDate: "2026-03-05",
      status: ActionItemStatus.COMPLETED,
      update: "Instruction issued to all ULBs to submit details of beneficiaries applied for PMAY(U) by 25th Feb 2026.",
    },
    {
      title: "AMRUT Expenditure of Balance Funds – DMA",
      description: "AMRUT: Expenditure of the balance funds to be expedited.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.OPEN,
      update: "Expenditure status under AMRUT 2.0 as on 07.03.2026: Total aggregate project fund Rs 826.53 crore. Expenditure of Rs 737.90 crore has been incurred.",
    },
    {
      title: "BMC & CMC Drainage Bills – MD WATCO",
      description: "BMC & CMC to clear their Drainage bills, if any, with the help of WATCO.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.OPEN,
      update: "Virtual Meeting done. Till date no bill have been received.",
    },
    {
      title: "Drainage DPR BMC – AS-cum-CE-BM",
      description: "Drainage proposal: DPR received from Bhubaneswar Municipal Corporation (BMC). AS cum CE to assist BMC in addressing all observations for finalization and approval.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.COMPLETED,
      update: "The proposal for BMC drainage works near ISKON has been recommended for administrative approval for an amount of Rs 29.07 cr.",
    },
    {
      title: "VC with Municipal Corporations on Pending Bills – DMA/FA-SB",
      description: "VC to be conducted with Municipal Corporations and major Municipalities on settlement of any pending bills at their end.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Samruddha Sahara – Elaborate Proposals with Justification – AS-SK",
      description: "The proposals submitted by Municipal Commissioners under Samruddha Sahara are to be elaborated with detailed justification and resubmitted.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "MSBY: 100 Cr to be Released – AS-RKS",
      description: "MSBY: 100 Cr to be released.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Liquid Waste Management Expenditure Booking – AS-BKD/EIC-OWSSB",
      description: "Liquid Waste Management: An exercise to book eligible expenditure. Process of finalizing agency for Rairangpur and other ULBs to be expedited.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Jaga Mission – Expenditure Plan – AS-SR",
      description: "Jaga Mission – Expenditure plan for balance amount. Balance 2 Cr to be released.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.COMPLETED,
      update: "Rs 10 Crores have already been surrendered. Not required to prepare the Exp. Plan.",
    },
    {
      title: "CRUT Expenditure – FA-SB",
      description: "Process for expenditure related to CRUT to be completed.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.COMPLETED,
      update: "File processed to CRUT.",
    },
    {
      title: "OSWAS IT Infrastructure Letter to OCAC – OE",
      description: "A letter to be issued to OCAC to strengthen IT infrastructure with specific bandwidth and technical requirements for seamless use of OSWAS.",
      dueDate: "2026-03-07",
      status: ActionItemStatus.COMPLETED,
      update: "Letter issued.",
    },
    {
      title: "RD Dept Meeting for Multi-Purpose Hall – AS-RKS",
      description: "A meeting shall be convened with the RD Department to obtain clarity on utilisation of unspent amount for the Multi-Purpose Hall during current financial year.",
      dueDate: "2026-03-17",
      status: ActionItemStatus.COMPLETED,
      update: "Meeting conducted.",
    },
    {
      title: "Files Pending with Finance Dept – Follow Up – FA-SB",
      description: "All files pending with the Finance Department shall be followed up on priority. A separate list to be prepared and processed immediately.",
      dueDate: "2026-03-17",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Garima Gruha – Design and Structural Framework – JS-MRN",
      description: "A meeting shall be held to finalise the design and structural framework of Garima Gruha.",
      dueDate: "2026-03-23",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "PM Gati Shakti Module – iGOT Karmayogi – All Vertical Heads",
      description: "All senior officers shall complete the PM Gati Shakti module on iGOT Karmayogi on priority.",
      dueDate: "2026-03-31",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Knowledge Sharing Tutorial – Every Wednesday – DMA/AS-SR",
      description: "A Knowledge Sharing Tutorial to be organised every Wednesday at the 8th Floor Conference Hall. A list of eminent speakers to be finalised.",
      dueDate: "2026-03-31",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Sambalpur Streetlight – Extension Proposal – AO-OUIDF/Commissioner-SMC",
      description: "Sambalpur streetlight work, extension proposal to be processed.",
      dueDate: "2026-03-31",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Street Light Model RFP – Inputs from Commissioners – AO-OUIDF",
      description: "Commissioners shall furnish inputs on the Street Light Model RFP within the stipulated time so that the final RFP may be issued.",
      dueDate: "2026-03-19",
      status: ActionItemStatus.OPEN,
      update: "",
    },
    {
      title: "Puri MC – Signboard and Logo Design – DMA/Communication Team",
      description: "For Puri Municipal Corporation, the signboard and logo design shall be finalised through a crowdsourcing process and approved thereafter.",
      dueDate: "2026-03-31",
      status: ActionItemStatus.OPEN,
      update: "",
    },
  ];

  let aiCount = 0;
  for (const ai of actionItems61) {
    const item = await prisma.actionItem.create({
      data: {
        meetingId: meeting61.id,
        verticalId: vertical.id,
        itemType: ActionItemType.meeting_decision,
        title: ai.title,
        description: ai.description,
        priority: ActionItemPriority.Medium,
        dueDate: new Date(ai.dueDate),
        status: ai.status,
        createdById: NODAL_OFFICER_ID,
        performers: { create: [{ userId: NODAL_OFFICER_ID, sortOrder: 0 }] },
        reviewerUsers: { create: [{ userId: ACS_ID, sortOrder: 0 }] },
      },
    });
    if (ai.update) {
      await prisma.actionItemUpdate.create({
        data: {
          actionItemId: item.id,
          timestamp: new Date("2026-03-20"),
          status: ai.status,
          note: ai.update,
          createdById: NODAL_OFFICER_ID,
        },
      });
    }
    aiCount++;
  }
  console.log(`✅  Created ${aiCount} action items for 61st dashboard`);

  // ──────────────────────────────────────────────────────────────────────────
  //  KPI DEFINITIONS + MEASUREMENTS  (from 61st Pg-4)
  //  assignedTo → Nodal Officer,  reviewer → ACS
  // ──────────────────────────────────────────────────────────────────────────
  interface KPIRow {
    schemeCode: string;
    description: string;
    kpiType: KPIType;
    numeratorUnit?: string;
    denominatorUnit?: string;
    numeratorValue?: number | null;
    denominatorValue?: number | null;
    yesValue?: boolean | null;
    progressStatus: KPIProgressStatus;
    remarks?: string;
  }

  const kpiRows61: KPIRow[] = [
    // ── A: BCPPER ─────────────────────────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Onboarding of experts to build a comprehensive economic plan (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: true, progressStatus: "on_track", remarks: "Done." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Preparation and finalization of the BCPPER Vision Plan (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: true, progressStatus: "on_track", remarks: "Done. The same is being finalized." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Publication of the Vision Plan (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Work in progress." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Statutory Framework Enacted (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Work in Progress." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Governance Framework Draft Prepared (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Work in Progress." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Roles and Responsibilities Defined (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Work in Progress." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Governance Framework Approved (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "No." },
    // ── B: Ring Road ─────────────────────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of land identification completed – Ring Road (CS- Viksit Odisha)", kpiType: "OUTCOME", numeratorUnit: "Acre of land identified", denominatorUnit: "Acre of land required", numeratorValue: 137.88, denominatorValue: 585.62, progressStatus: "delayed", remarks: "Out of 39.50 KM (585.62 Acres), land required for 9.30 KM (137.88 Acres) already identified through TP Schemes." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of land Demarcation completed – Ring Road (CS- Viksit Odisha)", kpiType: "OUTCOME", numeratorUnit: "Acre of land demarcated", denominatorUnit: "Acre of land required", numeratorValue: 6.81, denominatorValue: 585.62, progressStatus: "delayed", remarks: "Out of 39.50 KM (585.62 Acres), land required for 6.81 KM (100.96 Acres) demarcated through TP Schemes." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of tenders awarded for ring road (CS- Viksit Odisha)", kpiType: "OUTCOME", numeratorUnit: "Number of project tenders awarded", denominatorUnit: "Total number of projects", numeratorValue: 2, denominatorValue: 2, progressStatus: "on_track", remarks: "6.538 KM, total 2 tenders awarded." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of land acquired – Ring Road (CS- Viksit Odisha)", kpiType: "OUTCOME", numeratorUnit: "Area of land acquired km²", denominatorUnit: "Total area required", numeratorValue: null, denominatorValue: null, progressStatus: "delayed" },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of road completed – Ring Road (CS- Viksit Odisha)", kpiType: "OUTCOME", numeratorUnit: "Length of road completed (km)", denominatorUnit: "Total planned road length (km)", numeratorValue: 6.538, denominatorValue: 39.50, progressStatus: "delayed", remarks: "Out of 39.50 KM, land required for 9.30 KM identified through TP Schemes." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of Amount Utilized so far – Ring Road", kpiType: "OUTCOME", numeratorUnit: "Amount spent in Cr.", denominatorUnit: "Total project cost in Cr.", numeratorValue: 37.50, denominatorValue: 116.10, progressStatus: "delayed", remarks: "For development of 9.41 KM road project cost is 116.10 Cr." },
    // ── C: River Front Development ───────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "SPV or ULB-led authority for long-term riverfront management (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed" },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Agency on boarded for preparing DPR – Riverfront (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "OUDH Team to facilitate." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Detailed project designs completed – Riverfront (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed" },
    // ── D: Brownfield Cities ─────────────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of ULBs covered with SPV for brown field cities – Keonjhar and Rayagada (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "The SPV formation file is being initiated from Reforms Section." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Agency on boarded for preparation of Economic Plans – Brownfield (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "The same is being finalized." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Economic Plans for Keonjhar and Rayagada prepared (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Taskforce Team after its onboarding will be assigned the work." },
    // ── E: Liveable Cities Mission ───────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Form State Mission Cell & Empowered Group – Liveable Cities (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "At Consultation stage." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "District / ULB Cells – Liveable Cities (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "After Restructuring of DUDA proposal. It will be aligned." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Draft institutional & operational frameworks – Liveable Cities (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "At Consultation stage." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Define roles / reporting systems – Liveable Cities (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "At Consultation stage." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Design Liveability Index parameters (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed" },
    // ── F: Task Force ────────────────────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Formation of Investment Task Force Committee (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Consultation Stage." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Onboard core team & secretariat – Task Force (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Onboarding of Taskforce Team is being finalised." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Prepare State Investment Plan (CS- Viksit Odisha)", kpiType: "BINARY", yesValue: false, progressStatus: "delayed", remarks: "Action Plan will be sought from the Taskforce Team after its onboarding." },
    // ── G: SUJOG ─────────────────────────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Grievances resolved (%) – SUJOG (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Number of grievances resolved", denominatorUnit: "Total grievances registered", numeratorValue: 2588, denominatorValue: 4953, progressStatus: "delayed" },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Service delivery request resolved (%) – SUJOG (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Service applications resolved", denominatorUnit: "Service applications received", numeratorValue: 713263, denominatorValue: 767119, progressStatus: "on_track", remarks: "Backlog applications of previous FY included." },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "Percentage of service delivery request resolved within timeline – SUJOG", kpiType: "OUTCOME", numeratorUnit: "Applications resolved within timeline", denominatorUnit: "Applications received", numeratorValue: 201173, denominatorValue: 210452, progressStatus: "on_track", remarks: "2,26,359 Unique applications received for services under ORTPS Act." },
    // ── H: PMAY-U ────────────────────────────────────────────
    { schemeCode: "PMAY_U", description: "Houses sanctioned against application received (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Total houses sanctioned under PMAY-U 2.0", denominatorUnit: "Total applications received", numeratorValue: 27361, denominatorValue: 147726, progressStatus: "on_track" },
    { schemeCode: "PMAY_U", description: "Houses Completed under PMAY-U (OCAC-HCM)", kpiType: "OUTPUT", numeratorUnit: "Total houses completed", denominatorUnit: "Total houses grounded", numeratorValue: 975, denominatorValue: 9620, progressStatus: "delayed" },
    { schemeCode: "PMAY_U", description: "Fund Utilization (%) under PMAY-U (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Funds utilized (Rs Crore)", denominatorUnit: "Total funds received by Govt. (Rs Crore)", numeratorValue: 111.35, denominatorValue: 99.97, progressStatus: "on_track" },
    // ── I: SUJALA / Water Supply ─────────────────────────────
    { schemeCode: "SUJALA", description: "Household water Supply coverage (%) (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Households with functional tap connections", denominatorUnit: "Total households in project area", numeratorValue: 1126027, denominatorValue: 1142977, progressStatus: "on_track" },
    { schemeCode: "SUJALA", description: "% of Household Water Meters installed", kpiType: "OUTCOME", numeratorUnit: "Number of household water meters installed", denominatorUnit: "Total household water meters sanctioned", numeratorValue: 906655, denominatorValue: 1111389, progressStatus: "on_track" },
    { schemeCode: "SUJALA", description: "Number of Cities covered with DFT facilities", kpiType: "OUTPUT", numeratorUnit: "Cities with functional DFT facilities", denominatorUnit: "Cities covered for DFT facilities", numeratorValue: 26, denominatorValue: 28, progressStatus: "on_track" },
    { schemeCode: "SUJALA", description: "Quality Compliance (%) – Water (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Water quality tests meeting standards", denominatorUnit: "Total water quality tests conducted", numeratorValue: 1015603, denominatorValue: 1056782, progressStatus: "on_track" },
    { schemeCode: "SUJALA", description: "Grievance Redressal Efficiency (%) – Water (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Water grievances resolved", denominatorUnit: "Total grievances registered", numeratorValue: 470, denominatorValue: 574, progressStatus: "on_track" },
    // ── J: GARIMA ────────────────────────────────────────────
    { schemeCode: "GARIMA", description: "Core Sanitation Workers Covered (%) (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Core sanitation workers covered under GARIMA ID", denominatorUnit: "Total identified core sanitation workers", numeratorValue: 9075, denominatorValue: 9363, progressStatus: "on_track" },
    { schemeCode: "GARIMA", description: "Housing facility provided in convergence with PMAY-U (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Core sanitation workers with housing facilities", denominatorUnit: "Total core sanitation workers identified for housing", numeratorValue: 627, denominatorValue: 9363, progressStatus: "delayed" },
    { schemeCode: "GARIMA", description: "Procurement of PPE for ULBs", kpiType: "OUTCOME", numeratorUnit: "Number of ULBs equipped with PPE", denominatorUnit: "Total ULBs to be equipped with PPE", numeratorValue: 105, denominatorValue: 115, progressStatus: "on_track" },
    { schemeCode: "GARIMA", description: "Procurement of Safety devices for ERSUs", kpiType: "OUTCOME", numeratorUnit: "ERSUs equipped with safety devices", denominatorUnit: "Total ERSUs to be equipped", numeratorValue: 105, denominatorValue: 116, progressStatus: "on_track" },
    { schemeCode: "GARIMA", description: "Distribution of mobile phone to CSWs (Grade-I)", kpiType: "OUTCOME", numeratorUnit: "CSWs provided with mobile phone", denominatorUnit: "Total CSWs (Grade-I) to be provided mobile phone", numeratorValue: 610, denominatorValue: 893, progressStatus: "delayed", remarks: "Distribution pending in BMC." },
    // ── K: SBM ───────────────────────────────────────────────
    { schemeCode: "SBM_U", description: "Sanitation Facility Coverage (%) (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Population using improved sanitation facility", denominatorUnit: "Total projected population", numeratorValue: 4648811, denominatorValue: 8023521, progressStatus: "delayed" },
    { schemeCode: "SBM_U", description: "Open Defecation Free (ODF) status (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "ULBs declared as ODF city", denominatorUnit: "Total number of ULBs", numeratorValue: 114, denominatorValue: 115, progressStatus: "on_track" },
    { schemeCode: "SBM_U", description: "% of IIHHL Constructed", kpiType: "OUTPUT", numeratorUnit: "Number of IHHLs constructed", denominatorUnit: "Total IHHLs sanctioned / targeted", numeratorValue: 26950, denominatorValue: 84587, progressStatus: "delayed" },
    { schemeCode: "SBM_U", description: "% of Community Toilets (seats) constructed", kpiType: "OUTPUT", numeratorUnit: "Community toilet seats constructed", denominatorUnit: "Total community toilet seats sanctioned", numeratorValue: 936, denominatorValue: 3701, progressStatus: "delayed" },
    { schemeCode: "SBM_U", description: "% of Public Toilets (Ordinary seats) constructed", kpiType: "OUTPUT", numeratorUnit: "Public toilet (ordinary) seats constructed", denominatorUnit: "Total sanctioned", numeratorValue: 634, denominatorValue: 4716, progressStatus: "delayed" },
    { schemeCode: "SBM_U", description: "% of Public Toilets (Aspirational seats) constructed", kpiType: "OUTPUT", numeratorUnit: "Public toilet (aspirational) seats constructed", denominatorUnit: "Total sanctioned", numeratorValue: 680, denominatorValue: 1664, progressStatus: "delayed" },
    { schemeCode: "SBM_U", description: "% of new Wealth Centres work started (MCC & MRF)", kpiType: "OUTPUT", numeratorUnit: "New MCC and MRF work started", denominatorUnit: "Total targeted", numeratorValue: 13, denominatorValue: 13, progressStatus: "on_track" },
    { schemeCode: "SBM_U", description: "% of new Wealth Centres completed (MCC & MRF)", kpiType: "OUTPUT", numeratorUnit: "New MCC and MRF completed", denominatorUnit: "Total work started", numeratorValue: 40, denominatorValue: 56, progressStatus: "on_track" },
    { schemeCode: "SBM_U", description: "% of wards covered by 100% door-to-door solid waste collection (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Wards with 100% door-to-door collection", denominatorUnit: "Total wards in ULBs", numeratorValue: 2037, denominatorValue: 2055, progressStatus: "on_track" },
    { schemeCode: "SBM_U", description: "% of wards with 100% segregation at source (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Wards with 100% segregation at source", denominatorUnit: "Total wards in ULBs", numeratorValue: 2030, denominatorValue: 2055, progressStatus: "on_track" },
    { schemeCode: "SBM_U", description: "% of waste processed out of total collected in ULBs (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Waste Processed (MT/day)", denominatorUnit: "Waste Generated (MT/day)", numeratorValue: 1660.48, denominatorValue: 1721.71, progressStatus: "on_track" },
    // ── L: FSTP ──────────────────────────────────────────────
    { schemeCode: "SBM_U", description: "Installed capacity of FSTP as % of total faecal sludge / sewage generated", kpiType: "OUTCOME", numeratorUnit: "Total Installed FSTP capacity (MLD)", denominatorUnit: "Total faecal sludge/sewage generated (MLD)", numeratorValue: 2.087, denominatorValue: 1.268, progressStatus: "on_track", remarks: "Total installed capacity is more than total generation." },
    { schemeCode: "SBM_U", description: "% of treated wastewater from FSTP that is reused/recycled", kpiType: "OUTCOME", numeratorUnit: "Treated wastewater reused/recycled (MLD)", denominatorUnit: "Total wastewater from STP/FSTP (MLD)", numeratorValue: 0.61, denominatorValue: 0.61, progressStatus: "on_track" },
    { schemeCode: "SBM_U", description: "% of functional cesspool vehicles in ULBs", kpiType: "OUTCOME", numeratorUnit: "Functional cesspool vehicles in ULBs", denominatorUnit: "Total cesspool vehicles available in ULBs", numeratorValue: 381, denominatorValue: 428, progressStatus: "delayed" },
    { schemeCode: "SBM_U", description: "% of FSTP managed by MSG/TSG", kpiType: "OUTCOME", numeratorUnit: "FSTP managed by MSG/TSG", denominatorUnit: "FSTP plans across state", numeratorValue: 119, denominatorValue: 120, progressStatus: "on_track" },
    // ── M: Sewerage ──────────────────────────────────────────
    { schemeCode: "AMRUT", description: "% of Sewerage project started", kpiType: "OUTPUT", numeratorUnit: "Sewerage projects started", denominatorUnit: "Sewerage projects taken", numeratorValue: 1, denominatorValue: 1, progressStatus: "on_track" },
    { schemeCode: "AMRUT", description: "% of Sewerage line Completed in KM", kpiType: "OUTPUT", numeratorUnit: "KM sewerage line completed", denominatorUnit: "KM sewerage line to be taken up", numeratorValue: 0, denominatorValue: 0, progressStatus: "delayed" },
    // ── N: Storm Water Drainage ──────────────────────────────
    { schemeCode: "MSBY", description: "% of ULBs engaged agency to prepare DPR – Storm Water Drainage", kpiType: "OUTCOME", numeratorUnit: "ULBs engaged agency to prepare DPR", denominatorUnit: "Total number of ULBs", numeratorValue: 92, denominatorValue: 115, progressStatus: "on_track" },
    { schemeCode: "MSBY", description: "% of ULBs finalized their DPR – Storm Water Drainage", kpiType: "OUTCOME", numeratorUnit: "ULBs finalized DPRs", denominatorUnit: "Total ULBs", numeratorValue: 0, denominatorValue: 115, progressStatus: "delayed" },
    { schemeCode: "MSBY", description: "% of ULBs whose DPR is approved – Storm Water Drainage", kpiType: "OUTCOME", numeratorUnit: "ULBs with approved DPRs", denominatorUnit: "Total ULBs", numeratorValue: 0, denominatorValue: 115, progressStatus: "delayed" },
    { schemeCode: "MSBY", description: "% of ULBs that started work – Storm Water Drainage", kpiType: "OUTCOME", numeratorUnit: "ULBs started work", denominatorUnit: "Total ULBs", numeratorValue: 92, denominatorValue: 115, progressStatus: "on_track" },
    { schemeCode: "MSBY", description: "% Drainage Completed in KM", kpiType: "OUTPUT", numeratorUnit: "Drainage length constructed (km)", denominatorUnit: "Drainage length planned (km)", numeratorValue: 0, denominatorValue: 0, progressStatus: "delayed", remarks: "DPR under preparation." },
    // ── O: Urban Mobility ────────────────────────────────────
    { schemeCode: "URBAN_MOBILITY", description: "Sustainable transportation (%) – Electric Buses (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Total Electric Buses", denominatorUnit: "Total Bus Fleet Size", numeratorValue: 340, denominatorValue: 720, progressStatus: "on_track" },
    { schemeCode: "URBAN_MOBILITY", description: "Ama Bus Ridership (Increase average daily ridership by 10% each year)", kpiType: "OUTCOME", numeratorUnit: "Average Daily Ridership Jan 2026", denominatorUnit: "Average Daily Ridership Jan 2025", numeratorValue: 301052, denominatorValue: 284892, progressStatus: "on_track" },
    { schemeCode: "URBAN_MOBILITY", description: "% Electric Bus Depot Construction completed", kpiType: "OUTPUT", numeratorUnit: "Electric Bus Depots completed", denominatorUnit: "Electric Bus Depots started", numeratorValue: 5, denominatorValue: 11, progressStatus: "delayed" },
    { schemeCode: "URBAN_MOBILITY", description: "% of Buses delivered under PM eBus Seva", kpiType: "OUTPUT", numeratorUnit: "Buses delivered under PM e Bus Seva", denominatorUnit: "Total buses to be delivered", numeratorValue: null, denominatorValue: 400, progressStatus: "delayed", remarks: "LOA issued, PBG received, Agreement to be executed." },
    { schemeCode: "URBAN_MOBILITY", description: "Digital Transaction ratio – CRUT", kpiType: "OUTCOME", numeratorUnit: "Digital Transactions (Rs)", denominatorUnit: "Total Transactions (Rs)", numeratorValue: 13307443, denominatorValue: 30476169, progressStatus: "on_track", remarks: "13 March – 19 March." },
    { schemeCode: "URBAN_MOBILITY", description: "Grievance Redressal Efficiency (%) – CRUT (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Complaints resolved Feb 26", denominatorUnit: "Total complaints received Feb 26", numeratorValue: 5077, denominatorValue: 5077, progressStatus: "on_track" },
    { schemeCode: "URBAN_MOBILITY", description: "Odisha Yatri Ridership (5K Daily rides by 2026)", kpiType: "OUTCOME", numeratorUnit: "Current Daily Avg Ride Count", denominatorUnit: "Target Daily Avg Ride Count", numeratorValue: 1945, denominatorValue: 5000, progressStatus: "delayed" },
    { schemeCode: "URBAN_MOBILITY", description: "Average kilometers operated per bus per day – CRUT", kpiType: "OUTPUT", numeratorUnit: "Total km operated by all buses in a day", denominatorUnit: "Total buses operated on that day", numeratorValue: 129920, denominatorValue: 600, progressStatus: "on_track" },
    { schemeCode: "URBAN_MOBILITY", description: "% of Women Guides & Captains Engaged in CRUT", kpiType: "OUTCOME", numeratorUnit: "Women Guides & Captains engaged", denominatorUnit: "Total Guides & Captains engaged", numeratorValue: 539, denominatorValue: 2804, progressStatus: "delayed", remarks: "Feb 2026." },
    // ── P: MSBY ──────────────────────────────────────────────
    { schemeCode: "MSBY", description: "% of Project completed under MSBY (OCAC-HCM)", kpiType: "OUTCOME", numeratorUnit: "Projects completed under MSBY", denominatorUnit: "Projects started under MSBY", numeratorValue: 611, denominatorValue: 1806, progressStatus: "delayed" },
    { schemeCode: "MSBY", description: "% of Infrastructure Development Projects Completed under MSBY", kpiType: "OUTPUT", numeratorUnit: "Infrastructure development projects completed", denominatorUnit: "Total infrastructure development projects started", numeratorValue: 439, denominatorValue: 1234, progressStatus: "delayed" },
    { schemeCode: "MSBY", description: "% of Urban Wage Employment Projects Completed under MSBY", kpiType: "OUTPUT", numeratorUnit: "Urban Wage Employment projects completed", denominatorUnit: "Total UWE projects started", numeratorValue: 157, denominatorValue: 461, progressStatus: "delayed" },
    { schemeCode: "MSBY", description: "% of Development of Water Bodies Projects Completed under MSBY", kpiType: "OUTPUT", numeratorUnit: "Water Bodies projects completed", denominatorUnit: "Total Water Bodies projects started", numeratorValue: 11, denominatorValue: 82, progressStatus: "delayed" },
    { schemeCode: "MSBY", description: "% of Animal Welfare Projects Completed under MSBY", kpiType: "OUTPUT", numeratorUnit: "Animal Welfare projects completed", denominatorUnit: "Total Animal Welfare projects started", numeratorValue: 4, denominatorValue: 29, progressStatus: "delayed" },
    { schemeCode: "MSBY", description: "% of Expenditure incurred so far under MSBY", kpiType: "OUTCOME", numeratorUnit: "Total expenditure incurred to date (Cr)", denominatorUnit: "Total approved/budgeted expenditure (Cr)", numeratorValue: 1025.37, denominatorValue: 1200, progressStatus: "on_track" },
    // ── Q: LED Street Light ──────────────────────────────────
    { schemeCode: "SWACHHA_ODISHA", description: "% Brownfield Retrofitting Completed (110 ULBs)", kpiType: "OUTPUT", numeratorUnit: "Existing streetlights retrofitted", denominatorUnit: "Total streetlights planned for retrofitting", numeratorValue: 134257, denominatorValue: 153794, progressStatus: "on_track" },
    { schemeCode: "SWACHHA_ODISHA", description: "% New Streetlights Installed (Green Field) 110 ULBs", kpiType: "OUTPUT", numeratorUnit: "New streetlights installed", denominatorUnit: "Total new streetlights planned", numeratorValue: 32455, denominatorValue: 55041, progressStatus: "delayed" },
    { schemeCode: "SWACHHA_ODISHA", description: "% Functional Street Light across ULBs", kpiType: "OUTCOME", numeratorUnit: "Functional street lights in ULBs", denominatorUnit: "Total existing street lights installed", numeratorValue: 252696, denominatorValue: 265521, progressStatus: "on_track" },
    // ── R: SAHAJOG ───────────────────────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of Household Profiling Completed under SAHAJOG", kpiType: "OUTPUT", numeratorUnit: "Households profiled through door-to-door survey", denominatorUnit: "Total households targeted for profiling", numeratorValue: 564399, denominatorValue: 1517073, progressStatus: "delayed" },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of eligible beneficiaries whose applications are made under SAHAJOG", kpiType: "OUTCOME", numeratorUnit: "Eligible beneficiaries who submitted applications", denominatorUnit: "Total eligible beneficiaries", numeratorValue: 90325, denominatorValue: 1549815, progressStatus: "delayed" },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of eligible beneficiaries linked with government schemes – SAHAJOG", kpiType: "OUTCOME", numeratorUnit: "Eligible beneficiaries linked with government schemes", denominatorUnit: "Beneficiaries who submitted applications", numeratorValue: 89526, denominatorValue: 90325, progressStatus: "on_track" },
    // ── S: Capacity Building ─────────────────────────────────
    { schemeCode: "CB_RM", description: "Annual Action Plan Approved – Capacity Building", kpiType: "BINARY", yesValue: true, progressStatus: "on_track" },
    { schemeCode: "CB_RM", description: "% of Training Programme completed – Capacity Building", kpiType: "OUTCOME", numeratorUnit: "Training sessions conducted", denominatorUnit: "Total training sessions planned", numeratorValue: 18, denominatorValue: 66, progressStatus: "delayed" },
    { schemeCode: "CB_RM", description: "% of Personnel Obtained Training – Capacity Building", kpiType: "OUTCOME", numeratorUnit: "Personnel attended/completed training", denominatorUnit: "Total personnel planned to receive training", numeratorValue: 2014, denominatorValue: 5340, progressStatus: "delayed" },
    { schemeCode: "CB_RM", description: "% of TULIUP Interns Engaged", kpiType: "OUTCOME", numeratorUnit: "TULIUP interns currently engaged", denominatorUnit: "Target TULIUP interns to be engaged", numeratorValue: 86, denominatorValue: 500, progressStatus: "delayed" },
    // ── T: Grievances ────────────────────────────────────────
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of grievances resolved – H&UD", kpiType: "OUTCOME", numeratorUnit: "Grievances resolved", denominatorUnit: "Grievances received", numeratorValue: 409, denominatorValue: 418, progressStatus: "on_track" },
    { schemeCode: "SAMRUDDHA_SAHARA", description: "% of Grievances pending – H&UD", kpiType: "OUTCOME", numeratorUnit: "Grievances pending", denominatorUnit: "Grievances received", numeratorValue: 9, denominatorValue: 418, progressStatus: "on_track" },
  ];

  let kpiCount = 0;
  for (const row of kpiRows61) {
    if (!schemes[row.schemeCode]) continue;

    const kpiDef = await prisma.kpiDefinition.create({
      data: {
        schemeId: schemes[row.schemeCode],
        category: "STATE" as KPICategory,
        description: row.description,
        kpiType: row.kpiType,
        numeratorUnit: row.numeratorUnit,
        denominatorUnit: row.denominatorUnit,
        createdById: NODAL_OFFICER_ID,
        performers: { create: [{ userId: NODAL_OFFICER_ID, sortOrder: 0 }] },
        reviewerUsers: { create: [{ userId: ACS_ID, sortOrder: 0 }] },
      },
    });

    const target = await prisma.kpiTarget.create({
      data: {
        kpiDefinitionId: kpiDef.id,
        financialYearId: fy2526.id,
        denominatorValue: row.denominatorValue ?? undefined,
      },
    });

    await prisma.kpiMeasurement.create({
      data: {
        kpiTargetId: target.id,
        measuredAt: new Date("2026-03-20"),
        numeratorValue: (row.kpiType !== "BINARY" && row.numeratorValue != null) ? row.numeratorValue : undefined,
        yesValue: row.kpiType === "BINARY" ? (row.yesValue ?? false) : undefined,
        progressStatus: row.progressStatus as KPIProgressStatus,
        workflowStatus: KPIWorkflowStatus.submitted,
        remarks: row.remarks ?? null,
        createdById: NODAL_OFFICER_ID,
      },
    });

    kpiCount++;
  }
  console.log(`✅  Created ${kpiCount} KPI definitions + targets + measurements (61st)`);

  console.log("\n🎉  Seeding complete!");
  console.log(`\n📋  Summary:`);
  console.log(`    - Financial Year: 2025-26`);
  console.log(`    - Vertical: HUDD`);
  console.log(`    - Schemes: ${schemeData.length}`);
  console.log(`    - Finance Year Budget Allocation: 61st data (₹ 9907.56 Cr total)`);
  console.log(`    - Expenditure Snapshots: 52nd (Dec-2025) + 61st (Mar-2026)`);
  console.log(`    - 52nd Meeting: 2025-12-26 (financial data only)`);
  console.log(`    - 61st Meeting: 2026-03-20 (full data: topics, action items, KPIs)`);
  console.log(`    - Action Items (61st): ${aiCount}`);
  console.log(`    - KPIs (61st): ${kpiCount}`);
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
