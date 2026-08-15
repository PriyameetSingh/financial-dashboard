/**
 * The capability catalogue — what each module actually contains.
 *
 * Carried verbatim from the Menu Card design (`design-reference/Menu Card.dc.html`),
 * which is the source of truth for this content. Ids, names, descriptions and
 * lifecycle status are the designer's, not invented here.
 *
 * PRESENTATIONAL, DELIBERATELY. Entitlement in this product is granted per
 * MODULE, not per capability: `TenantEntitlement` has one row per module and
 * the request-time guard resolves a route to a module. These rows say what a
 * module gets you, so an administrator deciding whether to switch one on is
 * looking at its contents rather than at a name. They are not toggles and the
 * status dots are lifecycle information, not switches.
 *
 * The mockup's fourteen groups reconcile to twelve catalog modules, following
 * exactly the reconciliation recorded in `lib/entitlements/catalog.ts`: `TASK`
 * folds into the core shell (it aggregates over whatever else is enabled) and
 * `EXP` folds into Reports (an export is a report format, not a purchase).
 * `tests/menu-card.test.ts` asserts every group still names a real module.
 */
import { moduleByCode } from "@/lib/entitlements/catalog";

/**
 * Where a capability is in its life. Shown as a legend, never as a control —
 * a tenant cannot buy their way to something that is not built.
 */
export type CapabilityStatus = "live" | "dev" | "plan";

export type Capability = {
  /** The design's own id, e.g. "FIN-03". Shown so support and sales can point at it. */
  id: string;
  name: string;
  description: string;
  status: CapabilityStatus;
};

export type CapabilityGroup = {
  /** The design's group code, e.g. "FIN". */
  code: string;
  /** The catalog module this group's capabilities are granted by. */
  moduleCode: string;
  name: string;
  summary: string;
  capabilities: readonly Capability[];
};

/**
 * The platform standard — what every workspace has, whatever it bought.
 *
 * Separate from the groups below because it is not a purchase: these are the
 * core modules' contents, and the menu card shows them as included rather than
 * as choices.
 */
export const PLATFORM_STANDARD: readonly Capability[] = [
  { id: "PS-01", name: "Keycloak SSO sign-in", description: "Officials sign in via Keycloak OIDC; federated logout ends the IdP session too.", status: "live" },
  { id: "PS-02", name: "Role-based access (RBAC)", description: "Role catalog, role-permission matrix, and per-user overrides with server-side resolution.", status: "live" },
  { id: "PS-03", name: "User administration", description: "Create, update, and soft-delete officers with Keycloak sync and temporary password reset.", status: "live" },
  { id: "PS-04", name: "Audit logging", description: "Structured audit rows for every sensitive admin and workflow mutation.", status: "live" },
  { id: "PS-05", name: "App shell & branding", description: "Role-filtered sidebar, mobile drawer, department branding, clock, and logout.", status: "live" },
  { id: "PS-06", name: "Master data", description: "Organisations, designations, sections, ULBs, and verticals administration.", status: "live" },
  { id: "PS-07", name: "Officer profile", description: "Profile view with self-service password change and release notes.", status: "live" },
  { id: "PS-08", name: "Route & permission guards", description: "Proxy auth middleware, client guards, and a read-only watermark for view-only users.", status: "live" },
];

export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  {
    code: "CC",
    moduleCode: "MOD-CC",
    name: "Command Centre",
    summary: "Leadership landing dashboard",
    capabilities: [
      { id: "CC-01", name: "Command Centre / Overview Dashboard", description: "Utilisation, IFMS trend, lapse risk, meeting summary, pending approvals, AI alerts, and scheme drill-down.", status: "live" },
      { id: "CC-02", name: "Dashboard Quick Filters", description: "One-tap This Month / Quarter / FY filters across the landing dashboard.", status: "plan" },
      { id: "CC-03", name: "Dashboard Advanced Filters", description: "Filter by date range, scheme, department, officer, and status.", status: "plan" },
    ],
  },
  {
    code: "FIN",
    moduleCode: "MOD-FIN",
    name: "Financial Progress",
    summary: "Budget, SO, IFMS and utilisation",
    capabilities: [
      { id: "FIN-01", name: "Financial Overview Dashboard", description: "FY totals, funding-source chart, IFMS timeseries, period comparison, per-scheme utilisation table.", status: "live" },
      { id: "FIN-02", name: "Scheme-wise Financial Entry", description: "Enter scheme/subscheme SO and IFMS expenditure as dated snapshots linked to a meeting.", status: "live" },
      { id: "FIN-03", name: "Bulk Financial Entry", description: "Spreadsheet-style grid to post SO/IFMS deltas across many schemes in one pass.", status: "live" },
      { id: "FIN-04", name: "Budget Revision & Supplements", description: "Revise annual estimates with reason history; post signed top-up or cut supplements.", status: "live" },
      { id: "FIN-05", name: "FY Summary / Category Allocation", description: "Edit manual FY category lines; scheme buckets derived from scheme data.", status: "live" },
      { id: "FIN-06", name: "Budget vs Expense Board", description: "Kanban board bucketing schemes by IFMS utilisation against quarterly targets.", status: "live" },
      { id: "FIN-07", name: "Execution Efficiency Dashboard", description: "Financial vs physical progress comparison per scheme.", status: "plan" },
    ],
  },
  {
    code: "KPI",
    moduleCode: "MOD-KPI",
    name: "KPIs",
    summary: "Definition, entry, review, monitoring",
    capabilities: [
      { id: "KPI-01", name: "KPI Definition Create & Edit", description: "Define KPIs on a scheme with type, units, monitoring level, performers and reviewers.", status: "live" },
      { id: "KPI-02", name: "KPI Measurement Entry", description: "Assignees enter numerators, remarks, or yes/no for the selected meeting and submit for review.", status: "live" },
      { id: "KPI-03", name: "KPI Review & Approval", description: "Designated reviewers approve or reject submissions with notes.", status: "live" },
      { id: "KPI-04", name: "KPI Monitoring Dashboard", description: "List and filter KPIs by workflow status with staleness and escalation signals.", status: "live" },
      { id: "KPI-05", name: "KPI Target Denominator (FY)", description: "Set the financial-year target; locked after first set unless a manager overrides.", status: "live" },
      { id: "KPI-06", name: "KPI Owner Reassignment", description: "Reassign performers and reviewers for an existing KPI, including self-approved mode.", status: "live" },
      { id: "KPI-07", name: "KPI Escalation Flags", description: "Bottleneck reasons and needs-decision flags surfaced in monitoring.", status: "dev" },
    ],
  },
  {
    code: "SR",
    moduleCode: "MOD-SR",
    name: "Scheme Registry",
    summary: "Schemes, subschemes, ownership",
    capabilities: [
      { id: "SR-01", name: "Scheme Registry List & Overview", description: "Browse schemes with budget/SO/IFMS summary, KPI counts, and Active/Archived filters.", status: "live" },
      { id: "SR-02", name: "Scheme Create & Edit", description: "Create or edit a scheme with default owner assignments and optional subschemes.", status: "live" },
      { id: "SR-03", name: "Scheme Progress & Analytics", description: "Drill-down with FY financials, IFMS trend, subscheme breakdown, and KPI progress.", status: "live" },
      { id: "SR-04", name: "Subscheme Management", description: "Add subschemes at creation or later; reorder via admin.", status: "live" },
      { id: "SR-05", name: "Scheme Ownership Assignments", description: "Per-scheme default owners for priority, KPI fallbacks, and action-item templates.", status: "live" },
      { id: "SR-06", name: "Scheme Archive & Delete", description: "Soft-archive for day-to-day lists, or permanent delete with cascade.", status: "live" },
      { id: "SR-07", name: "Display Order Administration", description: "Set the global display order of schemes and subschemes for all users.", status: "live" },
      { id: "SR-08", name: "Scheme Workflow Config", description: "Per-scheme workflow configuration.", status: "plan" },
    ],
  },
  {
    code: "ACT",
    moduleCode: "MOD-ACT",
    name: "Decision Tracker",
    summary: "Action items and decisions (TASU)",
    capabilities: [
      { id: "ACT-01", name: "Action Item List & Tracker", description: "Searchable master list with status, priority, assignee, and vertical filters.", status: "live" },
      { id: "ACT-02", name: "Action Item Create", description: "Create form with scheme, priority, due date, performers, reviewers, and meeting link.", status: "live" },
      { id: "ACT-03", name: "Lifecycle & Review", description: "Status workflow, meeting-attributed progress notes, reassignment, archive.", status: "live" },
      { id: "ACT-04", name: "Proof Upload", description: "Register proof of completion against an action item.", status: "dev" },
      { id: "ACT-05", name: "Meeting Decision Type", description: "Distinguish decisions from action items in tracking and reports.", status: "plan" },
    ],
  },
  {
    code: "MTG",
    moduleCode: "MOD-MTG",
    name: "Meeting Organizer",
    summary: "Review meetings and live mode",
    capabilities: [
      { id: "MTG-01", name: "Meeting Calendar & CRUD", description: "Schedule and manage dashboard meetings with topics and financial year.", status: "live" },
      { id: "MTG-02", name: "Materials & Presentations", description: "Upload, preview, and manage meeting presentation files.", status: "live" },
      { id: "MTG-03", name: "Active Meeting Mode", description: "Full-screen live overlay with timer, agenda, finance/KPI/action panels, and assistant.", status: "live" },
      { id: "MTG-04", name: "Create Action Item from Meeting", description: "Raise an action item pre-linked to the running meeting.", status: "live" },
      { id: "MTG-05", name: "Data-Entry Window & Closure", description: "Admin-set closure time locks entry after the meeting; override permission for backdating.", status: "live" },
    ],
  },
  {
    code: "TASK",
    moduleCode: "MOD-SHELL",
    name: "My Tasks",
    summary: "Personal work hub",
    capabilities: [
      { id: "TASK-01", name: "My Tasks Hub", description: "Personal landing with pending KPI entry/review, tracker work, and entry shortcuts.", status: "live" },
      { id: "TASK-02", name: "Inline Pendance (Vertical Head)", description: "Embedded meeting-scoped task table for working pending reviews.", status: "live" },
    ],
  },
  {
    code: "RPT",
    moduleCode: "MOD-RPT",
    name: "Reports",
    summary: "Packs and adoption reporting",
    capabilities: [
      { id: "RPT-01", name: "Meeting Report Pack (Web + PDF)", description: "Printable briefing pack with topics, finance, schemes, KPIs, and decisions.", status: "live" },
      { id: "RPT-02", name: "Pendance / Adoption Report", description: "Per-meeting officer completion and update activity, web and PDF.", status: "live" },
      { id: "RPT-03", name: "Reports Hub", description: "Pick a meeting and open its pack or pendance report.", status: "live" },
      { id: "RPT-04", name: "Scheduled ACS Reports", description: "Monthly/quarterly cross-module leadership summaries, auto-dispatched.", status: "plan" },
      { id: "RPT-05", name: "On-Demand Date-Range Reports", description: "Ad-hoc reports over any date range.", status: "plan" },
    ],
  },
  {
    code: "AI",
    moduleCode: "MOD-AI",
    name: "AI Insights",
    summary: "Assistant and progress agents",
    capabilities: [
      { id: "AI-01", name: "Conversational Urban Assistant", description: "In-app Q&A answering from live financial, KPI, action-item, and meeting data.", status: "live" },
      { id: "AI-02", name: "AI Alerts / Progress Monitor", description: "Latest agent insights surfaced on the Command Centre as administrative alerts.", status: "live" },
      { id: "AI-03", name: "Meeting-Wise Progress Agent", description: "Configurable rule/LLM agent generating progress insights since the last meeting.", status: "live" },
    ],
  },
  {
    code: "ANOM",
    moduleCode: "MOD-ANOM",
    name: "Anomaly Detection",
    summary: "Rule-based and AI checks",
    capabilities: [
      { id: "ANOM-01", name: "Rule-Based Anomaly Checks", description: "Duplicate entries, 2× average deviation, and window-violation checks.", status: "plan" },
      { id: "ANOM-02", name: "Nightly Batch Job", description: "Scheduled nightly run of rule-based and AI-augmented anomaly checks.", status: "plan" },
      { id: "ANOM-03", name: "Anomaly Dashboard", description: "Severity, module, and trend view with click-through to the source record.", status: "plan" },
    ],
  },
  {
    code: "LAPSE",
    moduleCode: "MOD-LAPSE",
    name: "Lapse Risk",
    summary: "Year-end fund lapse prevention",
    capabilities: [
      { id: "LAPSE-01", name: "Lapse-Risk Alert Generation", description: "Threshold-based lapse detection across financial, KPI, and task data.", status: "plan" },
      { id: "LAPSE-02", name: "Grace-Period Escalation", description: "Escalates unresolved lapse-risk items to the next authority after a grace period.", status: "plan" },
      { id: "LAPSE-03", name: "Lapse-Risk Dashboard", description: "Heatmap, trend, and officer-wise view of lapse risk.", status: "plan" },
    ],
  },
  {
    code: "NOTIF",
    moduleCode: "MOD-NOTIF",
    name: "Notifications",
    summary: "Event-based alerting",
    capabilities: [
      { id: "NOTIF-01", name: "Event-Based Triggers", description: "Notification engine firing on overdue tasks, flags, and pending approvals.", status: "dev" },
      { id: "NOTIF-02", name: "User Notification Preferences", description: "Per-officer channel and frequency preferences.", status: "plan" },
    ],
  },
  {
    code: "EXP",
    moduleCode: "MOD-RPT",
    name: "Data Export",
    summary: "Structured outputs",
    capabilities: [
      { id: "EXP-01", name: "CSV / XLSX Export", description: "Export tables and charts in structured formats across modules.", status: "dev" },
      { id: "EXP-02", name: "Dashboard PDF Export", description: "One-click PDF of any dashboard view.", status: "plan" },
    ],
  },
  {
    code: "APR",
    moduleCode: "MOD-APR",
    name: "Approval Workflows",
    summary: "Configurable approval chains",
    capabilities: [
      { id: "APR-01", name: "Configurable Approval Chains", description: "Per-module and per-scheme chains — who approves what, in what order.", status: "plan" },
      { id: "APR-02", name: "Sequential Enforcement", description: "Approvers act in defined order; skipping is blocked.", status: "plan" },
      { id: "APR-03", name: "Approval Delegation", description: "Time-bound delegation of approval authority.", status: "plan" },
    ],
  },
];

/** Groups whose module a tenant can actually toggle, in catalog order. */
export function gatedGroups(): readonly CapabilityGroup[] {
  return CAPABILITY_GROUPS.filter((group) => moduleByCode(group.moduleCode)?.enforcement === "gated");
}

/** Every group granted by one module. Two of them share Reports. */
export function groupsForModule(moduleCode: string): readonly CapabilityGroup[] {
  return CAPABILITY_GROUPS.filter((group) => group.moduleCode === moduleCode);
}

export const CAPABILITY_COUNT = CAPABILITY_GROUPS.reduce(
  (sum, group) => sum + group.capabilities.length,
  PLATFORM_STANDARD.length,
);
