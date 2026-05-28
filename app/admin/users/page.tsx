"use client";

import AppShell from "@/components/AppShell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRequireAnyPermission } from "@/src/lib/route-guards";
import { Permission, UserRole, hasPermission } from "@/lib/auth";
import type { OfficerType } from "@/types";
import RoleBadge from "@/src/components/ui/RoleBadge";
import { withNextBasePath } from "@/lib/next-base-path";

type OverrideEffect = "allow" | "deny";

type PermissionRow = {
  code: string;
  name: string;
};

type DbUserPermissionOverride = {
  code: Permission;
  effect: OverrideEffect;
};

type DbUserRow = {
  code: string | null;
  name: string;
  email: string;
  department: string | null;
  designationId: string | null;
  designationName: string | null;
  organisationId: string | null;
  organisationName: string | null;
  organisations: Array<{ id: string; name: string }>;
  ulbId: string | null;
  ulbName: string | null;
  sections: Array<{ id: string; name: string }>;
  officerType: OfficerType | null;
  roles: UserRole[];
  overrides: DbUserPermissionOverride[];
  effectivePermissions: Permission[];
  assignedSchemes: string[];
};

type CreateUserFormState = {
  name: string;
  email: string;
  phone: string;
  department: string;
  designationId: string;
  organisationIds: string[];
  ulbId: string;
  sectionIds: string[];
  officerType: OfficerType | "";
  defaultPassword: string;
  roleCode: UserRole;
};

type EditProfileFormState = {
  name: string;
  email: string;
  department: string;
  designationId: string;
  organisationIds: string[];
  ulbId: string;
  sectionIds: string[];
  officerType: OfficerType;
};

type ReferenceOption = {
  id: string;
  name: string;
};

type RoleFilterValue = UserRole | "ALL";

type SeedDraftRow = {
  name: string;
  department: string;
  email: string;
  phone: string;
  defaultPassword: string;
  designationRaw: string;
  organisationRaw: string;
  sectionRaw: string;
  ulbRaw: string;
  officerTypeRaw: string;
  roleRaw: string;
};

const INITIAL_CREATE_USER_FORM: CreateUserFormState = {
  name: "",
  email: "",
  phone: "",
  department: "",
  designationId: "",
  organisationIds: [],
  ulbId: "",
  sectionIds: [],
  officerType: "",
  defaultPassword: "",
  roleCode: UserRole.NODAL_OFFICER,
};

/** Digits from phone — matches API / Keycloak username. */
function usernameDigitsFromPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function formatRoleLabel(role: UserRole): string {
  if (role === UserRole.VERTICAL_HEAD) return "Vertical Head";
  return role.replace(/_/g, " ");
}

function formatOfficerTypeLabel(value: OfficerType | null): string {
  if (value === "PMU") return "PMU";
  if (value === "GOVERNMENT") return "Government";
  return "—";
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^,+$/.test(line))
    .map(splitCsvLine);
}

function headerIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeText);
  return headers.findIndex((h) => normalizedAliases.includes(normalizeText(h)));
}

function fuzzyMatchOptionId(rawValue: string, options: ReferenceOption[]): string {
  const normalizedRaw = normalizeText(rawValue);
  if (!normalizedRaw) return "";
  const exact = options.find((option) => normalizeText(option.name) === normalizedRaw);
  if (exact) return exact.id;
  const partial = options.find((option) => {
    const name = normalizeText(option.name);
    return name.includes(normalizedRaw) || normalizedRaw.includes(name);
  });
  return partial?.id ?? "";
}

function fuzzyMatchManyOptionIds(rawValue: string, options: ReferenceOption[]): string[] {
  const chunks = rawValue.split(/[,/;]+/).map((v) => v.trim()).filter(Boolean);
  const ids = chunks.map((chunk) => fuzzyMatchOptionId(chunk, options)).filter(Boolean);
  return Array.from(new Set(ids));
}

function parseOfficerType(rawValue: string): OfficerType | "" {
  const normalized = normalizeText(rawValue);
  if (normalized === "government") return "GOVERNMENT";
  if (normalized === "pmu") return "PMU";
  return "";
}

function parseRole(rawValue: string): UserRole {
  const normalized = normalizeText(rawValue);
  if (normalized.includes("vertical head")) return UserRole.VERTICAL_HEAD;
  return UserRole.NODAL_OFFICER;
}

// ─── Combobox Component ───────────────────────────────────────────────────────

interface ComboboxProps {
  label: string;
  options: ReferenceOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

function Combobox({ label, options, value, onChange, placeholder, disabled, required }: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const boundary = dropdownRef.current.closest("[data-dropdown-boundary]") as HTMLElement | null;
    const boundaryRect = boundary?.getBoundingClientRect();
    const estimatedMenuHeight = 280;
    const spaceBelow = boundaryRect ? boundaryRect.bottom - rect.bottom : window.innerHeight - rect.bottom;
    const spaceAbove = boundaryRect ? rect.top - boundaryRect.top : rect.top;
    setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.id === value);
  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
      {label}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 pr-8 text-left text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {selectedOption ? selectedOption.name : placeholder || "Select..."}
        </button>
        <svg 
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          width="16" 
          height="16" 
          viewBox="0 0 16 16" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {isOpen && (
          <div
            className={`absolute z-50 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg ${
              openUpward ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            <div className="p-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {!required && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                >
                  (None)
                </button>
              )}
              {filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] ${
                    option.id === value ? "bg-[var(--bg-accent)] font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {option.name}
                </button>
              ))}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No results</div>
              )}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

// ─── Multi-Select Combobox Component ──────────────────────────────────────────

interface MultiComboboxProps {
  label: string;
  options: ReferenceOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function MultiCombobox({ label, options, values, onChange, placeholder, disabled }: MultiComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const boundary = dropdownRef.current.closest("[data-dropdown-boundary]") as HTMLElement | null;
    const boundaryRect = boundary?.getBoundingClientRect();
    const estimatedMenuHeight = 320;
    const spaceBelow = boundaryRect ? boundaryRect.bottom - rect.bottom : window.innerHeight - rect.bottom;
    const spaceAbove = boundaryRect ? rect.top - boundaryRect.top : rect.top;
    setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
  }, [isOpen]);

  const selectedOptions = options.filter((opt) => values.includes(opt.id));
  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (id: string) => {
    if (values.includes(id)) {
      onChange(values.filter((v) => v !== id));
    } else {
      onChange([...values, id]);
    }
  };

  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
      {label}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 pr-8 text-left text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {selectedOptions.length > 0
            ? selectedOptions.map((opt) => opt.name).join(", ")
            : placeholder || "Select..."}
        </button>
        <svg 
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          width="16" 
          height="16" 
          viewBox="0 0 16 16" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {isOpen && (
          <div
            className={`absolute z-50 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg ${
              openUpward ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            <div className="p-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleOption(option.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] ${
                    values.includes(option.id) ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={values.includes(option.id)}
                    onChange={() => {}}
                    className="pointer-events-none"
                  />
                  {option.name}
                </button>
              ))}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No results</div>
              )}
            </div>
            <div className="border-t border-[var(--border)] p-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearch("");
                }}
                className="w-full rounded border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

// ─── Permissions Modal ────────────────────────────────────────────────────────

interface PermissionsModalProps {
  user: DbUserRow;
  permissionCatalog: PermissionRow[];
  onToggle: (userCode: string, permissionCode: string) => Promise<void>;
  onClose: () => void;
  alert: string;
}

function PermissionsModal({ user, permissionCatalog, onToggle, onClose, alert }: PermissionsModalProps) {
  const overrideCount = user.overrides.length;
  const grantedCount = user.effectivePermissions.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Permissions</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">{user.name}</h2>
            <div className="mt-1 flex items-center gap-3">
              <RoleBadge role={user.roles[0] ?? UserRole.NODAL_OFFICER} />
              <span className="text-xs text-[var(--text-muted)]">
                {grantedCount} granted
                {overrideCount > 0 && (
                  <> · <span className="text-[var(--alert-warning)]">{overrideCount} override{overrideCount > 1 ? "s" : ""}</span></>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 border-b border-[var(--border)] px-6 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--text-primary)] bg-[var(--text-primary)]" />
            Granted
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.12)]" />
            Denied (override)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-transparent" />
            Not granted
          </span>
        </div>

        {/* Permission toggles */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {permissionCatalog.map((permission) => {
              const override = user.overrides.find((entry) => entry.code === permission.code) ?? null;
              const granted = user.effectivePermissions.includes(permission.code as Permission);
              return (
                <button
                  key={`modal-${user.code ?? user.email}-${permission.code}`}
                  onClick={() => onToggle(user.code ?? "", permission.code)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${override?.effect === "deny"
                    ? "border-[var(--alert-critical)] bg-[rgba(255,59,59,0.12)] text-[var(--alert-critical)]"
                    : granted
                      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                    }`}
                  title={
                    override
                      ? `Override active — click to unset (${override.effect})`
                      : granted
                        ? "Click to deny (override)"
                        : "Click to grant (override)"
                  }
                >
                  {permission.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alert */}
        {alert && (
          <div className="border-t border-[var(--border)] px-6 py-3">
            <p className="text-xs text-[var(--alert-critical)]">{alert}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface CreateUserModalProps {
  isOpen: boolean;
  form: CreateUserFormState;
  roleOptions: UserRole[];
  phoneUsernamePreview: string;
  isCreatingUser: boolean;
  alert: string;
  designations: ReferenceOption[];
  organisations: ReferenceOption[];
  ulbs: ReferenceOption[];
  sections: ReferenceOption[];
  onChange: (key: Exclude<keyof CreateUserFormState, "roleCode" | "sectionIds" | "organisationIds">, value: string) => void;
  onOrganisationsChange: (organisationIds: string[]) => void;
  onSectionsChange: (sectionIds: string[]) => void;
  onRoleChange: (roleCode: UserRole) => void;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

function CreateUserModal({
  isOpen,
  form,
  roleOptions,
  phoneUsernamePreview,
  isCreatingUser,
  alert,
  designations,
  organisations,
  ulbs,
  sections,
  onChange,
  onOrganisationsChange,
  onSectionsChange,
  onRoleChange,
  onSubmit,
  onClose,
}: CreateUserModalProps) {
  if (!isOpen) return null;

  const officerTypeOptions: ReferenceOption[] = [
    { id: "GOVERNMENT", name: "Government" },
    { id: "PMU", name: "PMU" },
  ];
  const roleComboboxOptions: ReferenceOption[] = roleOptions.map((role) => ({
    id: role,
    name: formatRoleLabel(role),
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-5 sticky top-0 bg-[var(--bg-primary)] z-10">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Administration</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">Create User</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Creates the user in Keycloak and syncs local RBAC in one action.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label="Close create user dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 pb-28" data-dropdown-boundary>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Name
              <input
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="Officer name"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => onChange("email", e.target.value)}
                placeholder="name@example.org"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Phone number
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => onChange("phone", e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
              <span className="text-[10px] text-[var(--text-muted)]">
                {phoneUsernamePreview.length >= 10
                  ? `Login username (digits): ${phoneUsernamePreview}`
                  : "Enter at least 10 digits; spaces and symbols are stripped for the username."}
              </span>
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Department (optional)
              <input
                value={form.department}
                onChange={(e) => onChange("department", e.target.value)}
                placeholder="Department"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <Combobox
              label="Designation (required)"
              options={designations}
              value={form.designationId}
              onChange={(value) => onChange("designationId", value)}
              placeholder="Select designation"
              required
            />

            <MultiCombobox
              label="Organisation (optional, multi-select)"
              options={organisations}
              values={form.organisationIds}
              onChange={onOrganisationsChange}
              placeholder="Select organisations"
            />

            <Combobox
              label="ULB (optional)"
              options={ulbs}
              value={form.ulbId}
              onChange={(value) => onChange("ulbId", value)}
              placeholder="Select ULB"
            />

            <MultiCombobox
              label="Sections (optional, multi-select)"
              options={sections}
              values={form.sectionIds}
              onChange={onSectionsChange}
              placeholder="Select sections"
            />

            <Combobox
              label="Officer type"
              options={officerTypeOptions}
              value={form.officerType}
              onChange={(value) => onChange("officerType", value as OfficerType)}
              placeholder="Select officer type"
              required
            />

            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Default Password
              <input
                type="password"
                value={form.defaultPassword}
                onChange={(e) => onChange("defaultPassword", e.target.value)}
                placeholder="Temporary password"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>

            <Combobox
              label="Role"
              options={roleComboboxOptions}
              value={form.roleCode}
              onChange={(value) => onRoleChange(value as UserRole)}
              placeholder="Select role"
              required
            />
          </div>
        </div>

        {alert && (
          <div className="border-t border-[var(--border)] px-6 py-3">
            <p className="text-xs text-[var(--text-muted)]">{alert}</p>
          </div>
        )}

        <div className="flex gap-3 border-t border-[var(--border)] px-6 py-4 sticky bottom-0 bg-[var(--bg-primary)]">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)]"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isCreatingUser}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingUser ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditUserProfileModalProps {
  user: DbUserRow;
  form: EditProfileFormState;
  isSaving: boolean;
  alert: string;
  designations: ReferenceOption[];
  organisations: ReferenceOption[];
  ulbs: ReferenceOption[];
  sections: ReferenceOption[];
  onChange: (key: Exclude<keyof EditProfileFormState, "sectionIds" | "organisationIds">, value: string) => void;
  onOrganisationsChange: (organisationIds: string[]) => void;
  onSectionsChange: (sectionIds: string[]) => void;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

function editProfileFormFromUser(user: DbUserRow): EditProfileFormState {
  return {
    name: user.name,
    email: user.email,
    department: user.department ?? "",
    designationId: user.designationId ?? "",
    organisationIds: user.organisations.map((o) => o.id),
    ulbId: user.ulbId ?? "",
    sectionIds: user.sections.map((s) => s.id),
    officerType: user.officerType ?? "GOVERNMENT",
  };
}

function EditUserProfileModal({
  user,
  form,
  isSaving,
  alert,
  designations,
  organisations,
  ulbs,
  sections,
  onChange,
  onOrganisationsChange,
  onSectionsChange,
  onSubmit,
  onClose,
}: EditUserProfileModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-5 sticky top-0 bg-[var(--bg-primary)] z-10">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Administration</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">Edit profile</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Update directory fields for {user.name}. Login username (phone code) is unchanged here.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="ml-4 mt-0.5 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            aria-label="Close edit profile dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 pb-28" data-dropdown-boundary>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Name
              <input
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => onChange("email", e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Department
              <input
                value={form.department}
                onChange={(e) => onChange("department", e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>
            <Combobox
              label="Designation"
              options={designations}
              value={form.designationId}
              onChange={(value) => onChange("designationId", value)}
              placeholder="Select designation"
            />
            <MultiCombobox
              label="Organisation (multi-select)"
              options={organisations}
              values={form.organisationIds}
              onChange={onOrganisationsChange}
              placeholder="Select organisations"
            />
            <Combobox
              label="ULB"
              options={ulbs}
              value={form.ulbId}
              onChange={(value) => onChange("ulbId", value)}
              placeholder="Select ULB"
            />
            <MultiCombobox
              label="Sections (multi-select)"
              options={sections}
              values={form.sectionIds}
              onChange={onSectionsChange}
              placeholder="Select sections"
            />
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              Officer type
              <div className="relative">
                <select
                  value={form.officerType}
                  onChange={(e) => onChange("officerType", e.target.value as OfficerType)}
                  className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
                >
                  <option value="GOVERNMENT">Government</option>
                  <option value="PMU">PMU</option>
                </select>
                <svg 
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  width="16" 
                  height="16" 
                  viewBox="0 0 16 16" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </label>
          </div>
        </div>

        {alert && (
          <div className="border-t border-[var(--border)] px-6 py-3">
            <p className="text-xs text-[var(--alert-critical)]">{alert}</p>
          </div>
        )}

        <div className="flex gap-3 border-t border-[var(--border)] px-6 py-4 sticky bottom-0 bg-[var(--bg-primary)]">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => void onSubmit()}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const sessionUser = useRequireAnyPermission(
    [Permission.MANAGE_PERMISSIONS, Permission.MANAGE_USERS],
    "/dashboard",
  );

  const canManagePermissions = useMemo(
    () => hasPermission(sessionUser, Permission.MANAGE_PERMISSIONS),
    [sessionUser],
  );

  const canMutateUsers = useMemo(
    () => hasPermission(sessionUser, Permission.MANAGE_USERS) || canManagePermissions,
    [sessionUser, canManagePermissions],
  );

  const [users, setUsers] = useState<DbUserRow[]>([]);
  const [alert, setAlert] = useState("");
  const [selectedUser, setSelectedUser] = useState<DbUserRow | null>(null);
  const [createUserAlert, setCreateUserAlert] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>(INITIAL_CREATE_USER_FORM);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>("ALL");
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Record<string, UserRole>>({});
  const [roleUpdateLoadingCodes, setRoleUpdateLoadingCodes] = useState<Record<string, boolean>>({});
  const [deleteLoadingCodes, setDeleteLoadingCodes] = useState<Record<string, boolean>>({});
  const [openDropdownCode, setOpenDropdownCode] = useState<string | null>(null);

  const [profileEditUser, setProfileEditUser] = useState<DbUserRow | null>(null);
  const [profileEditForm, setProfileEditForm] = useState<EditProfileFormState | null>(null);
  const [profileEditAlert, setProfileEditAlert] = useState("");
  const [profileSaveLoadingCodes, setProfileSaveLoadingCodes] = useState<Record<string, boolean>>({});
  const [seedDraftRows, setSeedDraftRows] = useState<SeedDraftRow[]>([]);
  const [seedAlert, setSeedAlert] = useState("");
  const [isSeedingUsers, setIsSeedingUsers] = useState(false);

  const [rolePermissions, setRolePermissions] = useState<Record<UserRole, Permission[]>>(() =>
    Object.fromEntries(Object.values(UserRole).map((role) => [role, [] as Permission[]])) as Record<UserRole, Permission[]>,
  );
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionRow[]>([]);
  
  const [designations, setDesignations] = useState<ReferenceOption[]>([]);
  const [organisations, setOrganisations] = useState<ReferenceOption[]>([]);
  const [ulbs, setUlbs] = useState<ReferenceOption[]>([]);
  const [sections, setSections] = useState<ReferenceOption[]>([]);

  const mapCsvRowToSeedDraft = useCallback((headers: string[], row: string[]): SeedDraftRow | null => {
    const get = (aliases: string[]) => {
      const idx = headerIndex(headers, aliases);
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    };

    const nodalName = get(["Nodal Officer/ Nodal Person Name", "Nodal Officer Nodal Person Name"]);
    const verticalName = get(["Name of the Vertical Head"]);
    const name = nodalName || verticalName;
    const department = get(["Department", "Deapratment"]);
    const email = get(["Personal Email Id"]);
    const phone = get(["Phone No. (Whatsapp)", "Phone No Whatsapp"]);
    const defaultPassword = get(["Temporary Passwords", "Temporary passwords"]);
    const designationRaw = get(["Designation"]);
    const organisationRaw = get(["Organaisation", "Organisation", "Name of the Scheme"]);
    const sectionRaw = get(["Concerned Section"]);
    const ulbRaw = get(["ULB"]);
    const officerTypeRaw = get(["Officer Type"]);
    const roleRaw = get(["Role"]);

    if (!name || !department || !email || !phone || !defaultPassword) {
      return null;
    }

    return {
      name,
      department,
      email,
      phone,
      defaultPassword,
      designationRaw,
      organisationRaw,
      sectionRaw,
      ulbRaw,
      officerTypeRaw,
      roleRaw,
    };
  }, []);

  const handleSeedCsvFiles = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setSeedAlert("");
    const nextRows: SeedDraftRow[] = [];
    for (const file of files) {
      const text = await file.text();
      const parsedRows = parseCsvRows(text);
      if (parsedRows.length < 2) continue;
      const headers = parsedRows[0];
      for (const row of parsedRows.slice(1)) {
        const mapped = mapCsvRowToSeedDraft(headers, row);
        if (mapped) nextRows.push(mapped);
      }
    }

    setSeedDraftRows(nextRows);
    setSeedAlert(nextRows.length > 0 ? `Loaded ${nextRows.length} users from CSV.` : "No valid users found in selected CSV files.");
    event.target.value = "";
  }, [mapCsvRowToSeedDraft]);

  const handleSeedUsers = useCallback(async () => {
    if (isSeedingUsers || seedDraftRows.length === 0) return;
    setIsSeedingUsers(true);
    setSeedAlert("");

    let successCount = 0;
    let failedCount = 0;

    for (const row of seedDraftRows) {
      const designationId = fuzzyMatchOptionId(row.designationRaw, designations);
      const organisationIds = fuzzyMatchManyOptionIds(row.organisationRaw, organisations);
      const sectionIds = fuzzyMatchManyOptionIds(row.sectionRaw, sections);
      const ulbId = fuzzyMatchOptionId(row.ulbRaw, ulbs);
      const officerType = parseOfficerType(row.officerTypeRaw);
      const roleCode = parseRole(row.roleRaw);

      try {
        const response = await fetch(withNextBasePath("/api/v1/admin/users"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.name,
            department: row.department,
            email: row.email.toLowerCase(),
            phone: row.phone,
            defaultPassword: row.defaultPassword,
            designationId: designationId || undefined,
            organisationIds: organisationIds.length > 0 ? organisationIds : undefined,
            sectionIds,
            ulbId: ulbId || undefined,
            officerType: officerType || undefined,
            roleCode,
          }),
        });
        if (response.ok) {
          successCount += 1;
        } else {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    await refreshUsers();
    setSeedAlert(`Seeding complete. Success: ${successCount}, Failed: ${failedCount}. Dropdown fields were fuzzy-matched; unmatched values were left empty.`);
    setIsSeedingUsers(false);
  }, [designations, isSeedingUsers, organisations, refreshUsers, sections, seedDraftRows, ulbs]);

  const refreshPermissionCatalog = useCallback(async () => {
    const response = await fetch(withNextBasePath("/api/v1/rbac/permissions"));
    if (!response.ok) throw new Error("Failed to load permissions");
    const data = (await response.json()) as { permissions: PermissionRow[] };
    setPermissionCatalog(data.permissions);
  }, []);

  const refreshRoles = useCallback(async () => {
    const response = await fetch(withNextBasePath("/api/v1/rbac/roles"));
    if (!response.ok) throw new Error("Failed to load roles");
    const data = (await response.json()) as { roles: Array<{ code: UserRole; permissions: Permission[] }> };

    setRolePermissions((prev) => {
      const next: Record<UserRole, Permission[]> = { ...prev };
      for (const role of data.roles) {
        next[role.code] = role.permissions;
      }
      return next;
    });
  }, []);

  const refreshUsers = useCallback(async () => {
    const response = await fetch(withNextBasePath("/api/v1/rbac/users"));
    if (!response.ok) throw new Error("Failed to load users");
    const data = (await response.json()) as { users: DbUserRow[] };
    setUsers(data.users);
    return data.users;
  }, []);

  const refreshReferenceData = useCallback(async () => {
    const [designationsRes, organisationsRes, ulbsRes, sectionsRes] = await Promise.all([
      fetch(withNextBasePath("/api/v1/admin/designations")),
      fetch(withNextBasePath("/api/v1/admin/organisations")),
      fetch(withNextBasePath("/api/v1/admin/ulbs")),
      fetch(withNextBasePath("/api/v1/admin/sections")),
    ]);

    if (designationsRes.ok) {
      const data = await designationsRes.json() as { designations: ReferenceOption[] };
      setDesignations(data.designations || []);
    }
    if (organisationsRes.ok) {
      const data = await organisationsRes.json() as { organisations: ReferenceOption[] };
      setOrganisations(data.organisations || []);
    }
    if (ulbsRes.ok) {
      const data = await ulbsRes.json() as { ulbs: ReferenceOption[] };
      setUlbs(data.ulbs || []);
    }
    if (sectionsRes.ok) {
      const data = await sectionsRes.json() as { sections: ReferenceOption[] };
      setSections(data.sections || []);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await Promise.all([refreshRoles(), refreshUsers(), refreshPermissionCatalog(), refreshReferenceData()]);
        if (!active) return;
        setAlert("");
      } catch {
        if (!active) return;
        setAlert("Unable to load permissions from database. Using fallback view.");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [refreshRoles, refreshUsers, refreshPermissionCatalog, refreshReferenceData]);

  const managePermissionCount = useMemo(() => {
    return users.filter((user) => user.effectivePermissions.includes(Permission.MANAGE_PERMISSIONS)).length;
  }, [users]);

  const roleOptions = useMemo<UserRole[]>(() => {
    const keys = Object.keys(rolePermissions).filter((code) => code in UserRole) as UserRole[];
    if (keys.length) return keys;
    return Object.values(UserRole);
  }, [rolePermissions]);

  const phoneUsernamePreview = useMemo(
    () => usernameDigitsFromPhone(createUserForm.phone),
    [createUserForm.phone],
  );

  const filteredUsers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const role = user.roles[0] ?? UserRole.NODAL_OFFICER;
      if (roleFilter !== "ALL" && role !== roleFilter) return false;
      if (!needle) return true;

      const assignedSchemes = user.assignedSchemes?.join(" ").toLowerCase() ?? "";
      const sectionNames = user.sections?.map((s) => s.name).join(" ").toLowerCase() ?? "";
      const haystack = [
        user.name,
        user.email,
        user.code ?? "",
        user.department ?? "",
        user.designationName ?? "",
        user.organisationName ?? "",
        user.ulbName ?? "",
        sectionNames,
        user.officerType ?? "",
        role,
        assignedSchemes,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [roleFilter, searchTerm, users]);

  const pendingRoleSaveCount = useMemo(() => {
    return users.reduce((count, user) => {
      const userCode = user.code ?? "";
      if (!userCode) return count;
      const currentRole = user.roles[0] ?? UserRole.NODAL_OFFICER;
      const nextRole = pendingRoleChanges[userCode];
      if (!nextRole || nextRole === currentRole) return count;
      return count + 1;
    }, 0);
  }, [pendingRoleChanges, users]);

  const handleCreateUserChange = useCallback((key: Exclude<keyof CreateUserFormState, "roleCode" | "sectionIds">, value: string) => {
    setCreateUserForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCreateUserOrganisationsChange = useCallback((organisationIds: string[]) => {
    setCreateUserForm((prev) => ({ ...prev, organisationIds }));
  }, []);

  const handleCreateUserSectionsChange = useCallback((sectionIds: string[]) => {
    setCreateUserForm((prev) => ({ ...prev, sectionIds }));
  }, []);

  const handleCreateUserRoleChange = useCallback((roleCode: UserRole) => {
    setCreateUserForm((prev) => ({ ...prev, roleCode }));
  }, []);

  const handleCreateUser = useCallback(async () => {
    if (isCreatingUser) return;
    setCreateUserAlert("");

    if (!createUserForm.name.trim() || !createUserForm.email.trim() || !createUserForm.defaultPassword.trim()) {
      setCreateUserAlert("Name, email, and default password are required.");
      return;
    }

    if (!createUserForm.designationId.trim()) {
      setCreateUserAlert("Designation is required for every new user.");
      return;
    }

    const phoneDigits = usernameDigitsFromPhone(createUserForm.phone);
    if (phoneDigits.length < 10) {
      setCreateUserAlert("Phone number is required: at least 10 digits. Digits are used as the login username.");
      return;
    }

    setIsCreatingUser(true);
    try {
      const response = await fetch(withNextBasePath("/api/v1/admin/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createUserForm.name.trim(),
          email: createUserForm.email.trim().toLowerCase(),
          phone: createUserForm.phone.trim(),
          department: createUserForm.department.trim() || undefined,
          designationId: createUserForm.designationId.trim() || undefined,
          organisationIds: createUserForm.organisationIds.length > 0 ? createUserForm.organisationIds : undefined,
          ulbId: createUserForm.ulbId.trim() || undefined,
          sectionIds: createUserForm.sectionIds,
          officerType: createUserForm.officerType,
          defaultPassword: createUserForm.defaultPassword,
          roleCode: createUserForm.roleCode,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setCreateUserAlert(data?.detail || "Unable to create user.");
        return;
      }

      setCreateUserForm(INITIAL_CREATE_USER_FORM);
      setCreateUserAlert("User created in Keycloak and local RBAC.");
      await refreshUsers();
      setIsCreateUserOpen(false);
    } catch {
      setCreateUserAlert("Unable to create user.");
    } finally {
      setIsCreatingUser(false);
    }
  }, [createUserForm, isCreatingUser, refreshUsers]);

  const handleRoleDraftChange = useCallback((userCode: string, roleCode: UserRole) => {
    setPendingRoleChanges((prev) => ({ ...prev, [userCode]: roleCode }));
  }, []);

  const handleRoleUpdate = useCallback(async (user: DbUserRow) => {
    const userCode = user.code ?? "";
    if (!userCode) return;

    const currentRole = user.roles[0] ?? UserRole.NODAL_OFFICER;
    const nextRole = pendingRoleChanges[userCode] ?? currentRole;
    if (nextRole === currentRole) {
      return;
    }

    setRoleUpdateLoadingCodes((prev) => ({ ...prev, [userCode]: true }));
    setAlert("");
    try {
      const response = await fetch(withNextBasePath(`/api/v1/admin/users/${encodeURIComponent(userCode)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleCode: nextRole }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setAlert(data?.detail || "Unable to update role.");
        return;
      }

      await refreshUsers();
      setPendingRoleChanges((prev) => {
        const next = { ...prev };
        delete next[userCode];
        return next;
      });
    } catch {
      setAlert("Unable to update role.");
    } finally {
      setRoleUpdateLoadingCodes((prev) => ({ ...prev, [userCode]: false }));
    }
  }, [pendingRoleChanges, refreshUsers]);

  const handleDeleteUser = useCallback(async (user: DbUserRow) => {
    const userCode = user.code ?? "";
    if (!userCode) return;

    const confirmed = window.confirm(`Delete ${user.name}? This action deactivates the account and removes role access.`);
    if (!confirmed) return;

    setDeleteLoadingCodes((prev) => ({ ...prev, [userCode]: true }));
    setAlert("");
    try {
      const response = await fetch(withNextBasePath(`/api/v1/admin/users/${encodeURIComponent(userCode)}`), {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setAlert(data?.detail || "Unable to delete user.");
        return;
      }

      await refreshUsers();
      setPendingRoleChanges((prev) => {
        const next = { ...prev };
        delete next[userCode];
        return next;
      });
      if (selectedUser?.code === userCode) {
        setSelectedUser(null);
      }
      if (profileEditUser?.code === userCode) {
        setProfileEditUser(null);
        setProfileEditForm(null);
        setProfileEditAlert("");
      }
    } catch {
      setAlert("Unable to delete user.");
    } finally {
      setDeleteLoadingCodes((prev) => ({ ...prev, [userCode]: false }));
    }
  }, [refreshUsers, selectedUser?.code, profileEditUser?.code]);

  const handleProfileEditChange = useCallback((key: Exclude<keyof EditProfileFormState, "sectionIds" | "organisationIds">, value: string) => {
    setProfileEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleProfileEditOrganisationsChange = useCallback((organisationIds: string[]) => {
    setProfileEditForm((prev) => (prev ? { ...prev, organisationIds } : prev));
  }, []);

  const handleProfileEditSectionsChange = useCallback((sectionIds: string[]) => {
    setProfileEditForm((prev) => (prev ? { ...prev, sectionIds } : prev));
  }, []);

  const handleSaveUserProfile = useCallback(async () => {
    if (!profileEditUser || !profileEditForm) return;
    const userCode = profileEditUser.code ?? "";
    if (!userCode) return;

    setProfileEditAlert("");
    if (!profileEditForm.name.trim() || !profileEditForm.email.trim()) {
      setProfileEditAlert("Name and email are required.");
      return;
    }

    setProfileSaveLoadingCodes((prev) => ({ ...prev, [userCode]: true }));
    try {
      const response = await fetch(withNextBasePath(`/api/v1/admin/users/${encodeURIComponent(userCode)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileEditForm.name.trim(),
          email: profileEditForm.email.trim().toLowerCase(),
          department: profileEditForm.department.trim() || null,
          designationId: profileEditForm.designationId.trim() || null,
          organisationIds: profileEditForm.organisationIds,
          ulbId: profileEditForm.ulbId.trim() || null,
          sectionIds: profileEditForm.sectionIds,
          officerType: profileEditForm.officerType,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: string } | null;
        setProfileEditAlert(data?.detail || "Unable to save profile.");
        return;
      }

      await refreshUsers();
      setProfileEditUser(null);
      setProfileEditForm(null);
      setProfileEditAlert("");
    } catch {
      setProfileEditAlert("Unable to save profile.");
    } finally {
      setProfileSaveLoadingCodes((prev) => ({ ...prev, [userCode]: false }));
    }
  }, [profileEditForm, profileEditUser, refreshUsers]);

  const togglePermission = useCallback(async (userCode: string, permissionCode: string) => {
    const target = users.find((user) => user.code === userCode);
    if (!target) return;

    const currentOverride = target.overrides.find((override) => override.code === permissionCode) ?? null;
    const hasEffective = target.effectivePermissions.includes(permissionCode as Permission);

    let nextEffect: "allow" | "deny" | "unset";
    if (currentOverride) {
      nextEffect = "unset";
    } else {
      nextEffect = hasEffective ? "deny" : "allow";
    }

    if (
      permissionCode === Permission.MANAGE_PERMISSIONS &&
      hasEffective &&
      nextEffect === "deny" &&
      managePermissionCount <= 1
    ) {
      setAlert("At least one officer must retain the Manage Permissions privilege.");
      return;
    }

    setAlert("");

    const response = await fetch(withNextBasePath(`/api/v1/rbac/users/${userCode}/permissions`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionCode, effect: nextEffect }),
    });

    if (!response.ok) {
      setAlert("Unable to persist user permission change.");
      return;
    }

    const latestUsers = await refreshUsers();

    // Keep the modal user data in sync after refresh
    setSelectedUser((prev) => {
      if (!prev || prev.code !== userCode) return prev;
      return latestUsers.find((u) => u.code === userCode) ?? prev;
    });
  }, [managePermissionCount, refreshUsers, users]);

  // Sync selectedUser when users list updates
  useEffect(() => {
    setSelectedUser((prev) => {
      if (!prev) return null;
      return users.find((u) => u.code === prev.code) ?? prev;
    });
  }, [users]);

  useEffect(() => {
    if (selectedUser && !canManagePermissions) {
      setSelectedUser(null);
      setAlert("");
    }
  }, [selectedUser, canManagePermissions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdownCode && !(event.target as HTMLElement).closest(`#actions-dropdown-${openDropdownCode}`) && !(event.target as HTMLElement).closest(`#actions-button-${openDropdownCode}`)) {
        setOpenDropdownCode(null);
      }
    };

    if (openDropdownCode) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openDropdownCode]);

  return (
    <AppShell title="Admin · Users">
      <div className="space-y-5 px-6 py-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">Administration</p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">User Directory</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Manage users, roles, and access visibility
                {canManagePermissions ? ", including permission overrides" : ""}.
              </p>
            </div>
            <button
              onClick={() => { setCreateUserAlert(""); setIsCreateUserOpen(true); }}
              disabled={!canMutateUsers}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create User
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Active Users</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{filteredUsers.length}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">of {users.length} total</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Pending Role Saves</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{pendingRoleSaveCount}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Unsaved role changes in this view</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Can Manage Permissions</p>
            <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{managePermissionCount}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Users with effective grant</p>
          </div>
        </div>

        {alert && !selectedUser && !profileEditUser && (
          <div className="rounded-xl border border-[var(--alert-critical)] bg-[rgba(255,59,59,0.08)] px-4 py-3">
            <p className="text-sm text-[var(--alert-critical)]">{alert}</p>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Search & Filter</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--text-muted)]">
              Search users
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, phone/code, designation, department, organisation, section, officer type, scheme"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
              />
            </label>
            <label className="flex min-w-[220px] flex-col gap-1 text-xs text-[var(--text-muted)]">
              Filter by role
              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleFilterValue)}
                  className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
                >
                  <option value="ALL">All roles</option>
                  {roleOptions.map((role) => (
                    <option key={`filter-role-${role}`} value={role}>
                      {formatRoleLabel(role)}
                    </option>
                  ))}
                </select>
                <svg 
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  width="16" 
                  height="16" 
                  viewBox="0 0 16 16" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </label>
            <button
              onClick={() => { setSearchTerm(""); setRoleFilter("ALL"); }}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)]"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-left text-sm">
              <thead className="bg-[var(--bg-surface)] text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Officer</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Organisation</th>
                  <th className="px-4 py-3">ULB</th>
                  <th className="px-4 py-3">Sections</th>
                  <th className="px-4 py-3">Officer type</th>
                  <th className="px-4 py-3">Assigned Schemes</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const userCode = user.code ?? "";
                  const currentRole = user.roles[0] ?? UserRole.NODAL_OFFICER;
                  const selectedRole = pendingRoleChanges[userCode] ?? currentRole;
                  const roleChanged = selectedRole !== currentRole;
                  const isUpdatingRole = Boolean(roleUpdateLoadingCodes[userCode]);
                  const isDeleting = Boolean(deleteLoadingCodes[userCode]);
                  const shownSchemes = user.assignedSchemes?.slice(0, 2) ?? [];
                  const hiddenSchemeCount = Math.max((user.assignedSchemes?.length ?? 0) - shownSchemes.length, 0);
                  return (
                    <tr key={user.code ?? user.email} className="border-t border-[var(--border)] align-top transition-colors hover:bg-[var(--bg-hover)]">
                      <td className="px-4 py-4">
                        <p className="font-medium text-[var(--text-primary)]">{user.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{user.email}</p>
                        {user.code && (
                          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                            {user.code}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                        {user.designationName?.trim() ? user.designationName : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-[220px] flex-col gap-2">
                          <RoleBadge role={currentRole} />
                          <div className="relative">
                            <select
                              value={selectedRole}
                              onChange={(e) => handleRoleDraftChange(userCode, e.target.value as UserRole)}
                              disabled={!userCode || isUpdatingRole || isDeleting || !canMutateUsers}
                              className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 pr-6 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {roleOptions.map((role) => (
                                <option key={`row-role-${userCode}-${role}`} value={role}>
                                  {formatRoleLabel(role)}
                                </option>
                              ))}
                            </select>
                            <svg 
                              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                              width="12" 
                              height="12" 
                              viewBox="0 0 16 16" 
                              fill="none" 
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          {roleChanged && (
                            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--alert-warning)]">
                              Unsaved change
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[var(--text-muted)]">{user.department || "—"}</td>
                      <td className="px-4 py-4">
                        {user.organisations && user.organisations.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {user.organisations.map((organisation) => (
                              <span
                                key={`${userCode}-org-${organisation.id}`}
                                className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]"
                              >
                                {organisation.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-[var(--text-muted)]">{user.ulbName?.trim() ? user.ulbName : "—"}</td>
                      <td className="px-4 py-4">
                        {user.sections && user.sections.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {user.sections.map((section) => (
                              <span
                                key={`${userCode}-section-${section.id}`}
                                className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]"
                              >
                                {section.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-[var(--text-muted)]">{formatOfficerTypeLabel(user.officerType)}</td>
                      <td className="px-4 py-4">
                        {shownSchemes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {shownSchemes.map((schemeCode) => (
                              <span
                                key={`${userCode}-scheme-${schemeCode}`}
                                className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]"
                              >
                                {schemeCode}
                              </span>
                            ))}
                            {hiddenSchemeCount > 0 && (
                              <span className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]">
                                +{hiddenSchemeCount} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="relative">
                          <button
                            id={`actions-button-${userCode}`}
                            onClick={() => setOpenDropdownCode(openDropdownCode === userCode ? null : userCode)}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-muted)]"
                          >
            •••
                          </button>
                          {openDropdownCode === userCode && (
                            <div
                              id={`actions-dropdown-${userCode}`}
                              className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg"
                            >
                              <div className="flex flex-col py-1">
                                {canManagePermissions && (
                                  <button
                                    onClick={() => {
                                      setAlert("");
                                      setSelectedUser(user);
                                      setOpenDropdownCode(null);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                                      <path d="M8.5 8.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                      <path d="M6 4v4M4 6h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                    Permissions
                                  </button>
                                )}
                                {canMutateUsers && (
                                  <button
                                    onClick={() => {
                                      setProfileEditAlert("");
                                      setProfileEditUser(user);
                                      setProfileEditForm(editProfileFormFromUser(user));
                                      setOpenDropdownCode(null);
                                    }}
                                    disabled={!userCode || isDeleting || isUpdatingRole || Boolean(profileSaveLoadingCodes[userCode])}
                                    className="flex items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Edit profile
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    void handleRoleUpdate(user);
                                    setOpenDropdownCode(null);
                                  }}
                                  disabled={!canMutateUsers || !roleChanged || !userCode || isUpdatingRole || isDeleting}
                                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isUpdatingRole ? "Saving..." : "Save Role"}
                                </button>
                                <button
                                  onClick={() => {
                                    void handleDeleteUser(user);
                                    setOpenDropdownCode(null);
                                  }}
                                  disabled={!canMutateUsers || !userCode || isDeleting || isUpdatingRole}
                                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-[var(--alert-critical)] hover:bg-[rgba(255,59,59,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isDeleting ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr className="border-t border-[var(--border)]">
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                      No users match the current search/filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedUser && canManagePermissions && (
        <PermissionsModal
          user={selectedUser}
          permissionCatalog={permissionCatalog}
          onToggle={togglePermission}
          onClose={() => { setSelectedUser(null); setAlert(""); }}
          alert={alert}
        />
      )}

      {profileEditUser && profileEditForm && (
        <EditUserProfileModal
          user={profileEditUser}
          form={profileEditForm}
          isSaving={Boolean(profileSaveLoadingCodes[profileEditUser.code ?? ""])}
          alert={profileEditAlert}
          designations={designations}
          organisations={organisations}
          ulbs={ulbs}
          sections={sections}
          onChange={handleProfileEditChange}
          onOrganisationsChange={handleProfileEditOrganisationsChange}
          onSectionsChange={handleProfileEditSectionsChange}
          onSubmit={handleSaveUserProfile}
          onClose={() => {
            if (!profileSaveLoadingCodes[profileEditUser.code ?? ""]) {
              setProfileEditUser(null);
              setProfileEditForm(null);
              setProfileEditAlert("");
            }
          }}
        />
      )}

      <CreateUserModal
        isOpen={isCreateUserOpen}
        form={createUserForm}
        roleOptions={roleOptions}
        phoneUsernamePreview={phoneUsernamePreview}
        isCreatingUser={isCreatingUser}
        alert={createUserAlert}
        designations={designations}
        organisations={organisations}
        ulbs={ulbs}
        sections={sections}
        onChange={handleCreateUserChange}
        onOrganisationsChange={handleCreateUserOrganisationsChange}
        onSectionsChange={handleCreateUserSectionsChange}
        onRoleChange={handleCreateUserRoleChange}
        onSubmit={handleCreateUser}
        onClose={() => { if (!isCreatingUser) setIsCreateUserOpen(false); }}
      />
    </AppShell>
  );
}
