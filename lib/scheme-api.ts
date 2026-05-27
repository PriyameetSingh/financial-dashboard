import { SponsorshipType } from "@/src/types";

type SchemeWithRelations = {
  id: string;
  code: string;
  name: string;
  verticalName: string;
  sponsorshipType: string;
  archived?: boolean;
  subschemes: Array<{ id: string; schemeId: string; code: string; name: string }>;
  assignments: Array<{
    id: string;
    assignmentKind: "dashboard_owner" | "kpi_owner_1" | "kpi_owner_2" | "action_item_owner_1" | "action_item_owner_2";
    sortOrder: number;
    subschemeId: string | null;
    userId: string | null;
    roleId: string | null;
    user: { name: string } | null;
    role: { code: string } | null;
  }>;
};

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function normalizeSponsorshipType(value: unknown): SponsorshipType {
  if (value === "STATE") return "STATE";
  if (value === "CENTRAL_SECTOR") return "CENTRAL_SECTOR";
  if (value === "NON_FINANCIAL") return "NON_FINANCIAL";
  return "CENTRAL";
}

export function parseSponsorshipType(value: unknown): SponsorshipType | null {
  if (value === "STATE") return "STATE";
  if (value === "CENTRAL") return "CENTRAL";
  if (value === "CENTRAL_SECTOR") return "CENTRAL_SECTOR";
  if (value === "NON_FINANCIAL") return "NON_FINANCIAL";
  return null;
}

export function mapSchemeView(scheme: SchemeWithRelations) {
  return {
    id: scheme.id,
    code: scheme.code,
    name: scheme.name,
    verticalName: scheme.verticalName,
    sponsorshipType: normalizeSponsorshipType(scheme.sponsorshipType),
    archived: scheme.archived ?? false,
    subschemes: scheme.subschemes.map((subscheme) => ({
      id: subscheme.id,
      schemeId: subscheme.schemeId,
      code: subscheme.code,
      name: subscheme.name,
    })),
    assignments: scheme.assignments.map((assignment) => ({
      id: assignment.id,
      assignmentKind: assignment.assignmentKind,
      sortOrder: assignment.sortOrder,
      subschemeId: assignment.subschemeId,
      userId: assignment.userId,
      userName: assignment.user?.name ?? null,
      roleId: assignment.roleId,
      roleCode: assignment.role?.code ?? null,
    })),
  };
}

export function isValidAssignment(input: { userId?: string | null; roleId?: string | null }) {
  return Boolean(input.userId || input.roleId);
}
