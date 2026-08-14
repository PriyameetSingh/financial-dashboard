/**
 * Prisma clients — Phase 2 Gate D.
 *
 * Two exports, deliberately named:
 *
 *   `prisma`          the TENANT-SCOPED client. Every query against a
 *                     tenant-scoped model is filtered by the tenant resolved
 *                     for the current request/scope. This is what application
 *                     code must use.
 *
 *   `prismaUnscoped`  the raw client, no tenant filter. Only for contexts that
 *                     legitimately run outside a tenant scope — middleware's
 *                     pre-resolution auth lookup, seed scripts, migrations,
 *                     cron, and the chokepoint's own integrity probes — and
 *                     always with an explicit `tenantId` in the query. Import
 *                     sites are enforced by scripts/check-unscoped-prisma.mjs.
 *
 * Chokepoint mechanics (see docs/PHASE2-TENANCY-PLAN.md §10):
 *   - reads   (findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany)
 *             → `where` is AND-ed with the current tenantId.
 *   - by-id   (findUnique/update/delete/upsert) → the target row's owner is
 *             resolved first; a foreign row behaves as "not found" (P2025 /
 *             null), never as another tenant's data.
 *   - writes  (create/createMany/upsert-create) → tenantId is stamped from the
 *             scope, an explicit foreign tenantId is rejected, and every FK
 *             pointing at a tenant-scoped parent is checked to belong to the
 *             same tenant (positive-evidence check: a parent row that exists
 *             and belongs to another tenant is rejected; a parent not yet
 *             visible — e.g. created earlier in the same transaction — is left
 *             to the database's FK constraint).
 *   - unknown models (neither tenant-scoped nor in GLOBAL_MODELS) → throw.
 *
 * Rule 3: the scope is read per operation from the request-scoped holder
 * (lib/tenant-config/request-store.ts). There is no module-global tenant state.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { activeHolder } from "@/lib/tenant-config/request-store";
import { TENANT_ID_HEADER } from "@/lib/tenant-config/resolution";
import {
  GLOBAL_MODELS,
  PARENT_FKS,
  RELATION_TARGETS,
  TENANT_ID_FIELD,
  TENANT_SCOPED_MODELS,
  delegateKey,
} from "@/lib/tenant-scope-registry";

const globalForPrisma = globalThis as unknown as {
  prismaUnscoped: PrismaClient | undefined;
};

/** Use the Supabase pooler URL (port 6543, `?pgbouncer=true&connection_limit=1`) for Vercel serverless. */
const datasourceUrl = process.env.DATABASE_URL;

const basePrisma =
  globalForPrisma.prismaUnscoped ??
  new PrismaClient(
    datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl,
            },
          },
        }
      : undefined,
  );

if (!globalForPrisma.prismaUnscoped) {
  globalForPrisma.prismaUnscoped = basePrisma;
}

/** Raw client — no tenant filter. See the header for the allowed call sites. */
export const prismaUnscoped = basePrisma;

/** Raised when a tenant-scoped query runs with no resolved tenant scope. */
export class TenantScopeError extends Error {
  status = 500;
  constructor(model: string, operation: string) {
    super(
      `No tenant scope resolved for ${model}.${operation}. ` +
        `Application code must run inside a resolved request (the root layout / API guards prime it) ` +
        `or an explicit withTenantContext() scope; scripts and middleware must use prismaUnscoped with an explicit tenantId.`,
    );
    this.name = "TenantScopeError";
  }
}

function notFound(model: string, operation: string): Prisma.PrismaClientKnownRequestError {
  // P2025 is what Prisma raises for "record not found" on update/delete, so
  // existing route handlers map a cross-tenant target to 404, not 500.
  return new Prisma.PrismaClientKnownRequestError(
    `No ${model} record found for this ${operation} (outside the current tenant scope).`,
    { code: "P2025", clientVersion: Prisma.prismaVersion.client },
  );
}

function currentTenantId(model: string, operation: string): string {
  const tenantId = activeHolder().tenantId;
  if (!tenantId) throw new TenantScopeError(model, operation);
  return tenantId;
}

/**
 * The resolved tenant id stamped on the request by proxy.ts.
 *
 * `next/headers` is imported dynamically and defensively: this module is also
 * loaded by seeds, scripts and vitest, where the import may not resolve or
 * `headers()` throws for want of a request. Every one of those failures means
 * "no request-scoped tenant", which falls through to TenantScopeError — the
 * same fail-closed direction as before.
 */
async function tenantIdFromRequest(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get(TENANT_ID_HEADER);
  } catch {
    return null;
  }
}

/**
 * Tenant id for a chokepoint operation, over BOTH request-scoped rails.
 *
 * The holder (React `cache()`) is authoritative when primed — RSC renders and
 * explicit `withTenantContext()` scopes both populate it. But React `cache()`
 * only memoises inside a render scope, and a Route Handler is not one: there,
 * every read of the holder returns a fresh empty object, so a value primed by
 * the resolver microseconds earlier is already gone. Before this fallback,
 * every authenticated `/api/v1/**` request died with TenantScopeError.
 *
 * The header is set by the proxy from a DB-validated active tenant and stripped
 * from inbound requests, so it is not client-supplied. It is read only when the
 * holder is empty, so an explicit scope always wins and nothing about the
 * existing behaviour changes where the holder already worked.
 */
async function resolveTenantId(model: string, operation: string): Promise<string> {
  const fromHolder = activeHolder().tenantId;
  if (fromHolder) return fromHolder;
  const fromRequest = await tenantIdFromRequest();
  if (fromRequest) return fromRequest;
  throw new TenantScopeError(model, operation);
}

/**
 * The tenant id of the current scope, for the few call sites that must handle
 * tenancy explicitly rather than through the chokepoint — cross-request caches
 * (cache keys/tags must be tenant-qualified) and any deliberate
 * `prismaUnscoped` usage inside a request. Throws when no scope is resolved.
 */
export function requireTenantScope(context: string): string {
  return currentTenantId(context, "scope");
}

type AnyArgs = Record<string, unknown>;

/** The extended (tenant-scoped) client type, and its interactive-transaction
 * client type. `TenantTransactionClient` replaces `Prisma.TransactionClient`
 * in helper signatures (e.g. logAudit) — the extended `tx` is a distinct type,
 * and the chokepoint applies to it (verified by spike + regression test). */
export type ExtendedPrismaClient = ReturnType<typeof buildScopedClient>;
export type TenantTransactionClient = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

function andTenant(args: AnyArgs, tenantId: string): AnyArgs {
  const where = args.where as object | undefined;
  return {
    ...args,
    where: where ? { AND: [where, { [TENANT_ID_FIELD]: tenantId }] } : { [TENANT_ID_FIELD]: tenantId },
  };
}

/** Resolve the owning tenant of the row addressed by a unique `where`. */
async function ownerTenantIdOf(model: string, where: unknown): Promise<string | null | undefined> {
  const delegate = (prismaUnscoped as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
    delegateKey(model)
  ];
  const row = (await delegate.findUnique({
    where,
    select: { [TENANT_ID_FIELD]: true },
  })) as { tenantId?: string | null } | null;
  return row ? (row.tenantId ?? null) : undefined; // undefined = no such row
}

/**
 * Reject a write whose FK points at a row that demonstrably belongs to another
 * tenant. A parent that cannot be seen (not yet committed inside the caller's
 * transaction, or genuinely absent) is left to the FK constraint — so this
 * check never breaks legitimate create-parent-then-child transactions.
 */
async function assertParentsInTenant(model: string, data: unknown, tenantId: string): Promise<void> {
  const fks = PARENT_FKS.get(model);
  if (!fks || !data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  for (const fk of fks) {
    const value = record[fk.field];
    if (typeof value !== "string") continue;
    const owner = await ownerTenantIdOf(fk.model, { id: value });
    if (owner !== undefined && owner !== null && owner !== tenantId) {
      throw notFound(fk.model, "reference");
    }
  }
}

/**
 * Stamp tenantId onto a create payload, rejecting an explicit foreign one, and
 * recurse into NESTED relation writes.
 *
 * Nested writes (`data: { performers: { create: [...] } }`) never surface as
 * their own `$allOperations` calls, so without this walk they would reach the
 * database tenant-less — caught by the NOT NULL column, but as a 500 rather
 * than correct behaviour. The walk covers `create`, `createMany.data` and
 * `connectOrCreate.create` for every relation whose target model is
 * tenant-scoped.
 */
async function prepareCreateData(model: string, data: unknown, tenantId: string): Promise<unknown> {
  if (Array.isArray(data)) {
    return Promise.all(data.map((row) => prepareCreateData(model, row, tenantId)));
  }
  if (!data || typeof data !== "object") return data;
  const record = { ...(data as Record<string, unknown>) };
  const explicit = record[TENANT_ID_FIELD];
  if (typeof explicit === "string" && explicit !== tenantId) {
    throw notFound(model, "create");
  }
  await assertParentsInTenant(model, record, tenantId);

  const relations = RELATION_TARGETS.get(model);
  if (relations) {
    for (const [field, targetModel] of relations) {
      if (!TENANT_SCOPED_MODELS.has(targetModel)) continue;
      const nested = record[field];
      if (!nested || typeof nested !== "object") continue;
      record[field] = await prepareNestedWrite(targetModel, nested as Record<string, unknown>, tenantId);
    }
  }

  return { ...record, [TENANT_ID_FIELD]: tenantId };
}

/**
 * Stamp the tenant inside one relation's nested-write payload, and verify every
 * row the payload CONNECTS to belongs to the same tenant.
 *
 * `connect` / `connectOrCreate.connect` / `set` attach an EXISTING row by a
 * unique selector, so nothing is stamped — without an ownership check they
 * would be a way to graft another tenant's row onto this tenant's object. Like
 * the scalar-FK check, this rejects only on positive evidence (the row exists
 * and belongs to someone else); an invisible row is left to the FK constraint,
 * so create-parent-then-connect inside one transaction still works.
 */
async function prepareNestedWrite(
  targetModel: string,
  nested: Record<string, unknown>,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const out = { ...nested };
  if (out.create !== undefined) {
    out.create = await prepareCreateData(targetModel, out.create, tenantId);
  }
  if (out.createMany && typeof out.createMany === "object") {
    const cm = { ...(out.createMany as Record<string, unknown>) };
    if (cm.data !== undefined) cm.data = await prepareCreateData(targetModel, cm.data, tenantId);
    out.createMany = cm;
  }
  if (out.connectOrCreate !== undefined) {
    const one = async (entry: unknown) => {
      if (!entry || typeof entry !== "object") return entry;
      const e = { ...(entry as Record<string, unknown>) };
      if (e.create !== undefined) e.create = await prepareCreateData(targetModel, e.create, tenantId);
      if (e.where !== undefined) await assertConnectTargetInTenant(targetModel, e.where, tenantId);
      return e;
    };
    out.connectOrCreate = Array.isArray(out.connectOrCreate)
      ? await Promise.all(out.connectOrCreate.map(one))
      : await one(out.connectOrCreate);
  }
  for (const key of ["connect", "set", "disconnect", "delete"] as const) {
    if (out[key] === undefined) continue;
    const entries = Array.isArray(out[key]) ? (out[key] as unknown[]) : [out[key]];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      await assertConnectTargetInTenant(targetModel, entry, tenantId);
    }
  }
  return out;
}

/** Reject attaching/detaching a row that demonstrably belongs to another tenant. */
async function assertConnectTargetInTenant(
  targetModel: string,
  selector: unknown,
  tenantId: string,
): Promise<void> {
  if (!TENANT_SCOPED_MODELS.has(targetModel)) return;
  const owner = await ownerTenantIdOf(targetModel, selector).catch(() => undefined);
  if (owner !== undefined && owner !== null && owner !== tenantId) {
    throw notFound(targetModel, "connect");
  }
}

const READ_MANY_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

const BY_UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete"]);

/**
 * The tenant-scoped client. Application code imports this as `prisma`.
 */
function buildScopedClient() {
  return basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (GLOBAL_MODELS.has(model)) return query(args);
        if (!TENANT_SCOPED_MODELS.has(model)) {
          throw new Error(
            `Model ${model} is not classified for tenancy. Add a tenantId column (tenant-scoped) ` +
              `or add it to GLOBAL_MODELS in lib/tenant-scope-registry.ts with a written justification.`,
          );
        }

        const tenantId = await resolveTenantId(model, operation);
        const a = (args ?? {}) as AnyArgs;

        if (READ_MANY_OPS.has(operation)) {
          const scoped = andTenant(a, tenantId);
          if (operation === "updateMany" || operation === "updateManyAndReturn") {
            // Never let a bulk update move rows to another tenant.
            const data = scoped.data as Record<string, unknown> | undefined;
            if (data && typeof data === "object" && TENANT_ID_FIELD in data) {
              delete data[TENANT_ID_FIELD];
            }
          }
          return query(scoped as typeof args);
        }

        if (BY_UNIQUE_OPS.has(operation)) {
          const owner = await ownerTenantIdOf(model, a.where);
          if (owner !== undefined && owner !== tenantId) {
            if (operation === "findUnique") return null;
            throw notFound(model, operation);
          }
          if (operation === "update") {
            const data = a.data as Record<string, unknown> | undefined;
            if (data && typeof data === "object") {
              if (TENANT_ID_FIELD in data) delete data[TENANT_ID_FIELD];
              await assertParentsInTenant(model, data, tenantId);
              // Relation writes on update (connect / set / nested create) get
              // the same treatment as on create.
              const relations = RELATION_TARGETS.get(model);
              if (relations) {
                for (const [field, targetModel] of relations) {
                  if (!TENANT_SCOPED_MODELS.has(targetModel)) continue;
                  const nested = data[field];
                  if (!nested || typeof nested !== "object") continue;
                  data[field] = await prepareNestedWrite(
                    targetModel,
                    nested as Record<string, unknown>,
                    tenantId,
                  );
                }
              }
            }
          }
          return query(a as typeof args);
        }

        if (operation === "create" || operation === "createMany" || operation === "createManyAndReturn") {
          return query({ ...a, data: await prepareCreateData(model, a.data, tenantId) } as typeof args);
        }

        if (operation === "upsert") {
          const owner = await ownerTenantIdOf(model, a.where);
          if (owner !== undefined && owner !== tenantId) throw notFound(model, operation);
          const update = a.update as Record<string, unknown> | undefined;
          if (update && typeof update === "object" && TENANT_ID_FIELD in update) {
            delete update[TENANT_ID_FIELD];
          }
          return query({ ...a, create: await prepareCreateData(model, a.create, tenantId) } as typeof args);
        }

        // Unknown/never-reached operation class: fail closed rather than pass
        // an unfiltered query through.
        throw new Error(`Tenant chokepoint: unhandled operation ${model}.${operation}`);
        },
      },
    },
  });
}

export const prisma = buildScopedClient();
