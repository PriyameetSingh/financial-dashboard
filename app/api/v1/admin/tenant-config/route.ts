/**
 * Tenant config admin API — Phase 3 Gate C.
 *
 * CRUD over `tenant_config_entries` for the CURRENT tenant.
 *
 * TENANCY NOTE — this is one of the few places that must scope by hand.
 * `TenantConfigEntry` is deliberately in GLOBAL_MODELS (lib/tenant-scope-registry.ts):
 * the resolver reads it BEFORE any tenant scope exists, so it cannot be
 * auto-scoped by the chokepoint. Every query below therefore carries an
 * explicit `tenantId`, taken from the request's resolved tenant context — never
 * from user input. A caller cannot address another tenant's row: the id comes
 * from the host-derived, DB-validated resolution, and the only caller-supplied
 * value is the config key.
 *
 * Three storage classes are enforced here, not merely documented
 * (lib/tenant-config/registry.ts):
 *
 *   storable  read and written freely.
 *   env-only  REJECTED from storage (400). basePath is build-bound; the
 *             Keycloak keys and seedAdminEmail stay env-backed.
 *   secret    writable, but never returned in readable form — reads report
 *             presence (`isSet`) only.
 *
 * Values are validated per key on write (backlog P4), so a malformed locale or
 * timezone is refused at the door rather than silently degrading that tenant to
 * Odisha defaults at render time.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { toAuthErrorResponse, requirePermission } from "@/lib/server-rbac";
import { getTenantContext } from "@/lib/tenant-context";
import { ODISHA_DEFAULTS } from "@/lib/tenant-config";
import {
  configKeyClass,
  listConfigKeys,
  overlayConfigEntries,
  validateConfigValue,
} from "@/lib/tenant-config/registry";
import {
  clearTenantConfigEntry,
  readTenantConfigEntries,
  writeTenantConfigEntry,
} from "@/lib/tenant-config/store";

export const runtime = "nodejs";

const MANAGE = "MANAGE_TENANT_CONFIG";

/**
 * GET — the current tenant's config.
 *
 * `entries` is every key the admin surface may show: its class, whether the
 * tenant has overridden it, and the EFFECTIVE value for storable keys (stored
 * value overlaid on the default, which is what the app actually renders).
 * Secret keys report `isSet` and nothing else.
 */
export async function GET() {
  try {
    await requirePermission(MANAGE);
    const { tenantId } = await getTenantContext();

    const rows = await readTenantConfigEntries(tenantId);
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const effective = overlayConfigEntries(ODISHA_DEFAULTS, rows);

    const entries = listConfigKeys().map(({ key, class: cls }) => {
      const isSet = stored.has(key);
      if (cls === "secret") {
        // Presence only. The material never crosses this boundary.
        return { key, class: cls, isSet, value: null };
      }
      return {
        key,
        class: cls,
        isSet,
        value: (effective as Record<string, unknown>)[key] ?? null,
        default: (ODISHA_DEFAULTS as Record<string, unknown>)[key] ?? null,
      };
    });

    return NextResponse.json({ entries });
  } catch (error) {
    const mapped = toAuthErrorResponse(error);
    if (mapped) return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    throw error;
  }
}

/**
 * PUT — upsert one key for the current tenant.
 *
 * Body: `{ "key": "locale", "value": "en-US" }`
 */
export async function PUT(request: NextRequest) {
  try {
    await requirePermission(MANAGE);
    const { tenantId } = await getTenantContext();

    const body = (await request.json().catch(() => null)) as
      | { key?: unknown; value?: unknown }
      | null;
    if (!body || typeof body.key !== "string") {
      return NextResponse.json({ detail: 'Body must be { "key": string, "value": … }' }, { status: 400 });
    }
    const key = body.key;

    // One gate for env-only, unknown keys, and malformed values alike.
    const reason = validateConfigValue(key, body.value);
    if (reason) return NextResponse.json({ detail: reason }, { status: 400 });

    await writeTenantConfigEntry(tenantId, key, body.value);

    const cls = configKeyClass(key);
    // Never echo a secret back, not even the value just written.
    return NextResponse.json(
      cls === "secret" ? { key, class: cls, isSet: true } : { key, class: cls, value: body.value },
    );
  } catch (error) {
    const mapped = toAuthErrorResponse(error);
    if (mapped) return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    throw error;
  }
}

/**
 * DELETE — clear one key, reverting the tenant to the built-in default.
 *
 * `?key=locale`
 */
export async function DELETE(request: NextRequest) {
  try {
    await requirePermission(MANAGE);
    const { tenantId } = await getTenantContext();

    const key = request.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ detail: "Pass ?key=<configKey>" }, { status: 400 });
    const cls = configKeyClass(key);
    if (cls === "unknown" || cls === "env-only") {
      return NextResponse.json({ detail: `Unknown or non-storable config key "${key}"` }, { status: 400 });
    }

    // Clearing a key this tenant never set is a no-op rather than a 404, so the
    // endpoint is idempotent.
    const cleared = await clearTenantConfigEntry(tenantId, key);
    return NextResponse.json({ key, class: cls, cleared });
  } catch (error) {
    const mapped = toAuthErrorResponse(error);
    if (mapped) return NextResponse.json({ detail: mapped.detail }, { status: mapped.status });
    throw error;
  }
}
