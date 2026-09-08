/**
 * Read-only tenant snapshot — entitlement + config state as yaml.
 *
 * Decision (2026-09-08, locked): this codebase does NOT adopt the VMS
 * `tenant.yaml` + CLI pattern (see `docs/plan.md` §0c). Database + the admin
 * API (`app/api/v1/admin/entitlements`, `app/api/v1/admin/tenant-config`)
 * remain the sole write path. This module exists ONLY to produce a
 * git-committable, human-diffable snapshot of what those write paths
 * currently hold, for audit-trail purposes. It writes nothing and has no
 * `apply`/`validate` counterpart — a snapshot with a write path would be a
 * second source of truth for the same fact the DB already owns, which is
 * exactly the hazard the single-write-path principle exists to prevent.
 *
 * Secret-class config keys are never included, even as ciphertext — same
 * posture as the tenant-config admin API (`isSet` only, never a value).
 */
import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG } from "@/lib/entitlements/catalog";
import { planCeiling } from "@/lib/entitlements/plan";
import { readTenantConfigEntries } from "@/lib/tenant-config/store";
import { ODISHA_DEFAULTS } from "@/lib/tenant-config";
import { listConfigKeys, overlayConfigEntries } from "@/lib/tenant-config/registry";

export type TenantExportPayload = {
  schemaVersion: 1;
  exportedAt: string;
  tenant: {
    slug: string;
    name: string;
    status: string;
    planTier: string;
  };
  capabilities: Array<{
    code: string;
    name: string;
    enforcement: string;
    tier: string | null;
    status: string;
    enabled: boolean;
  }>;
  config: Record<string, unknown>;
};

/** Assemble the export payload for one tenant. Read-only; touches no write path. */
export async function buildTenantExportPayload(tenantId: string): Promise<TenantExportPayload> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { slug: true, name: true, status: true, planTier: true },
  });
  const ceiling = planCeiling(tenant.planTier ?? null);

  const rows = await prisma.tenantEntitlement.findMany({
    select: { enabled: true, module: { select: { code: true } } },
  });
  const enabledCodes = new Set(rows.filter((r) => r.enabled).map((r) => r.module.code));

  const capabilities = MODULE_CATALOG.filter((mod) => mod.enforcement !== "roadmap").map((mod) => ({
    code: mod.code,
    name: mod.name,
    enforcement: mod.enforcement,
    tier: mod.tier,
    status: mod.status,
    enabled: mod.enforcement === "core" ? true : enabledCodes.has(mod.code),
  }));

  const configRows = await readTenantConfigEntries(tenantId);
  const effective = overlayConfigEntries(ODISHA_DEFAULTS, configRows);
  const config: Record<string, unknown> = {};
  for (const { key, class: cls } of listConfigKeys()) {
    if (cls === "secret") continue; // never exported, not even ciphertext
    config[key] = (effective as Record<string, unknown>)[key] ?? null;
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tenant: {
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      planTier: ceiling,
    },
    capabilities,
    config,
  };
}

// ─── Minimal YAML serializer ────────────────────────────────────────────────
//
// Scoped deliberately to the shapes this export produces: flat scalar values,
// flat objects, and arrays of flat objects — no anchors, no multi-line
// strings, no deep nesting. Not a general-purpose YAML writer; do not reuse
// for arbitrary data without re-checking these assumptions.

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value !== "string") return JSON.stringify(value);
  const looksAmbiguous =
    value === "" ||
    /^\s|\s$/.test(value) ||
    /[:#\-?[\]{}&*!|>'"%@`]/.test(value) ||
    /^(true|false|null|~|-?\d+(\.\d+)?)$/i.test(value);
  if (!looksAmbiguous) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderEntry(key: string, value: unknown, indent: number, linePrefix: string): string {
  const isEmptyObject = value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
  const isEmptyArray = Array.isArray(value) && value.length === 0;
  if (isEmptyObject) return `${linePrefix}${key}: {}\n`;
  if (isEmptyArray) return `${linePrefix}${key}: []\n`;
  if (value !== null && typeof value === "object") {
    return `${linePrefix}${key}:\n${toYaml(value, indent + 1)}`;
  }
  return `${linePrefix}${key}: ${yamlScalar(value)}\n`;
}

/** Serialize a plain object/array of the shape described above to YAML text. */
export function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const entries = Object.entries(item as Record<string, unknown>);
          return entries
            .map(([k, v], i) => renderEntry(k, v, indent + 1, i === 0 ? `${pad}- ` : `${pad}  `))
            .join("");
        }
        return `${pad}- ${yamlScalar(item)}\n`;
      })
      .join("");
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => renderEntry(k, v, indent, pad))
      .join("");
  }
  return `${pad}${yamlScalar(value)}\n`;
}
