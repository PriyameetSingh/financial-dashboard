export enum UserRole {
  ACS = "ACS",
  /** Former AS / Principal Secretary–class desk roles; permission profile aligned with Nodal Officer. */
  VERTICAL_HEAD = "VERTICAL_HEAD",
  FA = "FA",
  TASU = "TASU",
  NODAL_OFFICER = "NODAL_OFFICER",
}

/** Stored on `User.officerType`; matches Prisma `OfficerType`. */
export type OfficerType = "GOVERNMENT" | "PMU";

/** Signed-in client profile from `/api/v1/rbac/me` (and directory rows for pickers). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  /** UUID foreign key to Designation table */
  designationId?: string | null;
  /** Designation name from relation */
  designationName?: string | null;
  /** UUID foreign key to Organisation table */
  organisationId?: string | null;
  /** Organisation name from relation */
  organisationName?: string | null;
  /** UUID foreign key to Ulb table */
  ulbId?: string | null;
  /** ULB name from relation */
  ulbName?: string | null;
  /** Sections the user belongs to */
  sections?: Array<{ id: string; name: string }>;
  officerType?: OfficerType | null;
  assignedSchemes: string[];
  permissions?: Permission[];
}

export enum Permission {
  VIEW_ALL_DATA = "VIEW_ALL_DATA",
  VIEW_ASSIGNED_DATA = "VIEW_ASSIGNED_DATA",
  ENTER_FINANCIAL_DATA = "ENTER_FINANCIAL_DATA",
  /** Bulk spreadsheet-style financial entry (all schemes at once). */
  MANAGE_FINANCIAL_DATA = "MANAGE_FINANCIAL_DATA",
  ENTER_KPI_DATA = "ENTER_KPI_DATA",
  CREATE_ACTION_ITEMS = "CREATE_ACTION_ITEMS",
  UPDATE_ACTION_ITEMS = "UPDATE_ACTION_ITEMS",
  UPLOAD_PROOF = "UPLOAD_PROOF",
  APPROVE_FINANCIAL = "APPROVE_FINANCIAL",
  APPROVE_KPI = "APPROVE_KPI",
  APPROVE_ACTION_ITEMS = "APPROVE_ACTION_ITEMS",
  MANAGE_USERS = "MANAGE_USERS",
  MANAGE_SCHEMES = "MANAGE_SCHEMES",
  EXPORT_REPORTS = "EXPORT_REPORTS",
  VIEW_COMMAND_CENTRE = "VIEW_COMMAND_CENTRE",
  VIEW_ANALYTICS = "VIEW_ANALYTICS",
  MANAGE_PERMISSIONS = "MANAGE_PERMISSIONS",
  /** Create/update FY rows; TASU / administration — see seed role grants. */
  MANAGE_FINANCIAL_YEARS = "MANAGE_FINANCIAL_YEARS",
  /** Set bottleneck reason and ACS escalation flag on KPI measurements. */
  FLAG_KPI_ESCALATION = "FLAG_KPI_ESCALATION",
  REORDER_SCHEMES = "REORDER_SCHEMES",
}

export type ActionItemPriority = "Critical" | "High" | "Medium" | "Low";
export type ActionItemStatus = "OPEN" | "IN_PROGRESS" | "PROOF_UPLOADED" | "UNDER_REVIEW" | "COMPLETED" | "OVERDUE";

export interface ActionItemUpdate {
  /** Stable id from DB; omit in legacy mocks */
  id?: string;
  timestamp: string;
  actor: string;
  status: ActionItemStatus;
  note: string;
  meetingId?: string | null;
  createdById?: string;
}

export interface PerformerAssignmentLog {
  userId: string;
  userName: string;
  userCode: string | null;
  assignedAt: string;
  unassignedAt: string | null;
  isActive: boolean;
}

export interface ActionItemProof {
  name: string;
  link: string;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  vertical: string;
  priority: ActionItemPriority;
  dueDate: string;
  createdAt: string;
  status: ActionItemStatus;
  /** Comma-separated display names of performers. */
  assignedTo: string;
  /** Comma-separated display names of reviewers. */
  reviewer: string;
  performers?: Array<{ id: string; name: string; code: string | null; designation?: string }>;
  reviewers?: Array<{ id: string; name: string; code: string | null; designation?: string }>;
  assignedToUserIds?: string[];
  reviewerUserIds?: string[];
  /** User `code` when loaded from API; first performer / reviewer for legacy single-code flows. */
  assignedToUserCode?: string | null;
  reviewerUserCode?: string | null;
  assignedToUserId?: string;
  reviewerUserId?: string;
  isSelfApproved?: boolean;
  schemeId: string;
  /** Source meeting when the action item was created from a meeting; used to default progress attribution. */
  meetingId?: string | null;
  meetingDate?: string | null;
  meetingTitle?: string | null;
  daysOverdue?: number;
  /** Whether there is at least one progress update linked to the latest dashboard meeting. */
  hasUpdateForLatestMeeting?: boolean;
  archived?: boolean;
  updates: ActionItemUpdate[];
  proofFiles: ActionItemProof[];
  assignmentHistory?: PerformerAssignmentLog[];
}

type KPICategory = "STATE" | "CENTRAL";
export type KPIType = "OUTPUT" | "OUTCOME" | "BINARY";
export type KPIStatus = "not_submitted" | "draft" | "submitted" | "submitted_pending" | "approved";

/** Latest measurement progress (on_track / delayed / overdue); null if no measurement yet. */
export type KPIMeasurementProgressStatus = "on_track" | "delayed" | "overdue";

export type KpiEscalationFlag = "on_track" | "needs_coordination" | "needs_acs_decision";

export interface KPISubmission {
  id: string;
  kpiTargetId?: string | null;
  latestMeasurementId?: string | null;
  scheme: string;
  vertical: string;
  category: KPICategory;
  description: string;
  type: KPIType;
  unit: string;
  numeratorUnit?: string | null;
  denominatorUnit?: string | null;
  numerator?: number | null;
  denominator?: number | null;
  yes?: boolean | null;
  status: KPIStatus;
  /** Latest measurement KPI progress (for urgency / sidebar badge). */
  measurementProgressStatus?: KPIMeasurementProgressStatus | null;
  lastUpdated: string;
  remarks?: string;
  /** Present when KPI has named action owners (comma-separated in assignedToName). */
  assignedToName?: string | null;
  reviewerName?: string | null;
  assignedToUserId?: string | null;
  reviewerUserId?: string | null;
  performerUserIds?: string[];
  reviewerUserIds?: string[];
  isSelfApproved?: boolean;
  /** Server-computed for the current session (ENTER_KPI_DATA + assignment). */
  currentUserCanEnter?: boolean;
  /** Server-computed for the current session (APPROVE_KPI + assignment). */
  currentUserCanReview?: boolean;
  /** Server-computed: MANAGE_SCHEMES — may change action owner and reviewer. */
  currentUserCanReassignOwners?: boolean;
  /** Bottleneck reason from latest measurement. */
  bottleneckReason?: string | null;
  /** ACS escalation flag from latest measurement. */
  escalationFlag?: KpiEscalationFlag | null;
  velocityTrail?: Array<{
    id: string;
    meetingId: string | null;
    measuredAt: string;
    numeratorValue: number | null;
    yesValue: boolean | null;
    workflowStatus: string;
    remarks?: string | null;
    createdById?: string | null;
    createdBy?: { id: string; name: string } | null;
  }>;
  /** Days since last measurement update; null if never updated. */
  staleDays?: number | null;
  /** Whether a measurement exists for the latest dashboard meeting (weekly cycle). */
  hasEntryForLatestMeeting?: boolean;
  /** Server-computed: user has FLAG_KPI_ESCALATION permission. */
  canFlagEscalation?: boolean;
  /** Monitoring level for this KPI: CS, ACS, or CM. */
  monitoringLevel?: "CS" | "ACS" | "CM" | null;
  archived?: boolean;
  assignmentHistory?: PerformerAssignmentLog[];
}

export type FinancialEntryStatus =
  | "submitted_this_week"
  | "submitted_pending"
  | "draft"
  | "overdue"
  | "not_started";

export interface FinancialEntryUpdate {
  timestamp: string;
  actor: string;
  status: FinancialEntryStatus;
  note?: string;
  so?: number;
  ifms?: number;
}

export interface FinancialEntryMetadata {
  riskLevel?: "low" | "medium" | "high";
  needsAttention?: boolean;
  tags?: string[];
  aiInsights?: string;
  [key: string]: unknown;
}

export interface FinancialEntry {
  id: string;
  scheme: string;
  vertical: string;
  status: FinancialEntryStatus;
  annualBudget: number;
  so: number;
  ifms: number;
  lastUpdated: string;
  locked: boolean;
  submitter: string;
  updates: FinancialEntryUpdate[];
  metadata?: FinancialEntryMetadata;
  /** Internal id for ordering and APIs */
  schemeId?: string;
  dashboardPriority?: boolean;
  sortOrder?: number;
  totalSupplementCr: number;
  effectiveBudgetCr: number;
  supplements: Array<{
    id: string;
    amountCr: number;
    reason: string;
    referenceNo?: string;
    createdAt: string;
    createdByName: string;
  }>;
  history?: Array<{
    asOfDate: string;
    ifms: number;
    so: number;
  }>;
  subschemes?: Array<{
    id: string;
    code: string;
    name: string;
    sortOrder?: number;
    /** Latest snapshot SO expenditure for this subscheme (₹ Cr) */
    so?: number;
    /** Latest snapshot IFMS expenditure for this subscheme (₹ Cr) */
    ifms?: number;
    /** Budget estimate for this subscheme (₹ Cr) */
    annualBudget?: number;
    totalSupplementCr?: number;
    effectiveBudgetCr?: number;
    supplements?: Array<{
      id: string;
      amountCr: number;
      reason: string;
      referenceNo?: string;
      createdAt: string;
      createdByName: string;
    }>;
    history?: Array<{
      asOfDate: string;
      ifms: number;
      so: number;
    }>;
  }>;
}

export interface FinanceSummaryRow {
  headCode: string;
  label: string;
  budgetEstimateCr: number;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
}

/** Per–FY budget buckets (matches Prisma `FinanceYearBudgetCategory`). */
export type FinanceYearBudgetCategory =
  | "STATE_SCHEME"
  | "CENTRALLY_SPONSORED_SCHEME"
  | "CENTRAL_SECTOR_SCHEME"
  | "STATE_FINANCE_COMMISSION"
  | "UNION_FINANCE_COMMISSION"
  | "OTHER_TRANSFER_STAMP_DUTY"
  | "ADMIN_EXPENDITURE";

export interface FinanceYearBudgetAllocationLineRow {
  category: FinanceYearBudgetCategory;
  label: string;
  budgetEstimateCr: number;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
}

export interface PendingApprovalSummary {
  role: UserRole;
  financial: number;
  kpi: number;
  actionItems: number;
}

export type SponsorshipType = "STATE" | "CENTRAL" | "CENTRAL_SECTOR" | "NON_FINANCIAL";

export type SchemeAssignmentKind = "dashboard_owner" | "kpi_owner_1" | "kpi_owner_2" | "action_item_owner_1" | "action_item_owner_2";

export interface SchemeAssignmentView {
  id: string;
  assignmentKind: SchemeAssignmentKind;
  sortOrder: number;
  subschemeId: string | null;
  userId: string | null;
  userName: string | null;
  roleId: string | null;
  roleCode: string | null;
}

export interface SubschemeView {
  id: string;
  schemeId: string;
  code: string;
  name: string;
  sortOrder?: number;
}

export interface SchemeView {
  id: string;
  code: string;
  name: string;
  verticalName: string;
  sponsorshipType: SponsorshipType;
  archived: boolean;
  subschemes: SubschemeView[];
  assignments: SchemeAssignmentView[];
  sortOrder?: number;
}

export interface SchemeReferenceData {
  roles: Array<{ id: string; code: string; name: string }>;
  users: Array<{ id: string; code: string | null; name: string; email: string }>;
}

export interface SchemeKpiSummary {
  id: string;
  description: string;
  kpiType: string;
  category: string;
  monitoringLevel: "CS" | "ACS" | "CM" | null;
  subschemeCode: string | null;
  subschemeName: string | null;
  numeratorUnit?: string | null;
  denominatorUnit?: string | null;
  denominatorValue?: number | null;
  archived?: boolean;
}

export interface SchemeExpenditureSummary {
  financialYearLabel: string | null;
  annualBudgetCr: number;
  soExpenditureCr: number;
  ifmsExpenditureCr: number;
  asOfDate: string | null;
}

export interface SchemeOverview extends SchemeView {
  kpis: SchemeKpiSummary[];
  expenditure: SchemeExpenditureSummary | null;
}
