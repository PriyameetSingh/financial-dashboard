/**
 * Composite unique selectors for the fields that became `@@unique([tenantId, …])`
 * in Gate D's M3 migration.
 *
 * Reads (`findFirst`) do not need these — the chokepoint injects the tenant
 * filter and the field is unique within a tenant. They exist for the
 * operations that REQUIRE a unique selector (`update`/`upsert`/`delete`), where
 * Prisma needs the composite key by name.
 *
 * Each helper reads the tenant from the current scope, so call sites never
 * pass a tenant id around by hand (and cannot pass the wrong one).
 */
import { requireTenantScope } from "@/lib/prisma";

export function userByEmail(email: string) {
  return { tenantId_email: { tenantId: requireTenantScope("userByEmail"), email } };
}

export function userByCode(code: string) {
  return { tenantId_code: { tenantId: requireTenantScope("userByCode"), code } };
}

export function roleByCode(code: string) {
  return { tenantId_code: { tenantId: requireTenantScope("roleByCode"), code } };
}

export function schemeByCode(code: string) {
  return { tenantId_code: { tenantId: requireTenantScope("schemeByCode"), code } };
}

export function verticalByCode(code: string) {
  return { tenantId_code: { tenantId: requireTenantScope("verticalByCode"), code } };
}

export function financialYearByLabel(label: string) {
  return { tenantId_label: { tenantId: requireTenantScope("financialYearByLabel"), label } };
}

export function systemNotificationConfigByKey(key: string) {
  return { tenantId_key: { tenantId: requireTenantScope("systemNotificationConfigByKey"), key } };
}
