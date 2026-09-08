import { NextResponse } from "next/server";
import { toAuthErrorResponse, requirePermission } from "@/lib/server-rbac";
import { getTenantContext } from "@/lib/tenant-context";
import { buildTenantExportPayload, toYaml } from "@/lib/entitlements/export";

/**
 * Read-only tenant snapshot, for git-committed audit-trail purposes.
 *
 * Decision (2026-09-08, locked, `docs/plan.md` §0c): NOT a write path, and has
 * no `apply`/`validate` counterpart. Database + the admin APIs
 * (`/api/v1/admin/entitlements`, `/api/v1/admin/tenant-config`) remain the
 * sole way to change a tenant's capability or config state. An operator who
 * wants a reviewable record commits the output of this endpoint; nothing ever
 * reads it back in.
 *
 * Same permission as the write paths it snapshots (`MANAGE_TENANT_CONFIG`) —
 * a snapshot of tenant configuration is itself tenant configuration.
 */
export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePermission("MANAGE_TENANT_CONFIG");
    const { tenantId } = await getTenantContext();

    const payload = await buildTenantExportPayload(tenantId);
    const header = `# GENERATED — read-only export, ${payload.exportedAt}\n# NOT a write path. See lib/entitlements/export.ts.\n`;
    const body = header + toYaml(payload);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/yaml; charset=utf-8",
        "content-disposition": `attachment; filename="${payload.tenant.slug}-capabilities.yaml"`,
      },
    });
  } catch (error) {
    const mapped = toAuthErrorResponse(error);
    if (mapped) return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    throw error;
  }
}
