#!/usr/bin/env node
/**
 * Data-level tenancy audit — the backstop for anything the write path might
 * have let through. Derives its checks from the Prisma schema (no hand-kept
 * table list), so a new model or FK is covered the day it is added:
 *
 *   1. NULL sweep      — no tenant-scoped table may hold a row with a NULL
 *                        tenantId (M3 enforces this at the column level; this
 *                        catches a table that somehow escaped enforcement).
 *   2. Cross-tenant FK — for every FK that points at another tenant-scoped
 *                        model, no child row may reference a parent belonging
 *                        to a different tenant. Plain FKs cannot express this,
 *                        so it is asserted here (plan §4c).
 *
 * Run: node scripts/check-tenant-integrity.mjs   (needs DATABASE_URL)
 */
import { PrismaClient, Prisma } from "@prisma/client";

const GLOBAL_MODELS = new Set(["Permission", "Release", "ChangelogEntry", "Tenant", "TenantConfigEntry"]);
const prisma = new PrismaClient();

function tableOf(model) {
  return model.dbName ?? model.name;
}

function columnOf(model, fieldName) {
  const f = model.fields.find((x) => x.name === fieldName);
  return f?.dbName ?? fieldName;
}

const models = Prisma.dmmf.datamodel.models;
const scoped = new Map();
for (const m of models) {
  if (GLOBAL_MODELS.has(m.name)) continue;
  if (m.fields.some((f) => f.name === "tenantId" && f.kind === "scalar")) scoped.set(m.name, m);
}

const failures = [];
let nullChecks = 0;
let fkChecks = 0;

for (const [name, model] of scoped) {
  const table = tableOf(model);
  nullChecks++;
  const [{ count }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM "${table}" WHERE "tenantId" IS NULL`,
  );
  if (count > 0) failures.push(`${name} (${table}): ${count} row(s) with NULL tenantId`);
}

for (const [name, model] of scoped) {
  const table = tableOf(model);
  for (const field of model.fields) {
    if (field.kind !== "object") continue;
    const from = field.relationFromFields ?? [];
    const to = field.relationToFields ?? [];
    if (from.length !== 1 || to.length !== 1) continue;
    if (from[0] === "tenantId") continue;
    const parent = scoped.get(field.type);
    if (!parent) continue; // parent is a global model

    const parentTable = tableOf(parent);
    const fkColumn = columnOf(model, from[0]);
    const parentKey = columnOf(parent, to[0]);
    fkChecks++;
    const [{ count }] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS count
         FROM "${table}" c
         JOIN "${parentTable}" p ON p."${parentKey}" = c."${fkColumn}"
        WHERE c."${fkColumn}" IS NOT NULL AND c."tenantId" IS DISTINCT FROM p."tenantId"`,
    );
    if (count > 0) {
      failures.push(
        `${name}.${from[0]} → ${field.type}: ${count} row(s) reference a parent in a DIFFERENT tenant`,
      );
    }
  }
}

await prisma.$disconnect();

if (failures.length > 0) {
  console.error("check-tenant-integrity: FAILED\n");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check-tenant-integrity: ok (${scoped.size} tenant-scoped tables, ${nullChecks} NULL checks, ${fkChecks} cross-tenant FK checks)`,
);
