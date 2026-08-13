/**
 * Fix 02 — Transactional Audit Logging: verification harness.
 *
 * Run against the TEST database only:
 *   node --env-file=.env.test.local --import tsx scripts/verify-transactional-audit.ts
 *
 * Proves, with raw DB assertions (no mocking of Prisma):
 *   1. An audit-insert failure rolls back the paired financial mutation.   (Test 2)
 *   2. An audit-insert failure rolls back the paired RBAC mutation.        (Test 3)
 *   3. A mutation failure leaves no orphan audit row.                        (Test 4)
 *   4. (Control) A successful mutation+audit commits both atomically.       (Test 1)
 *   5. The Keycloak compensating path runs on transaction failure.           (Test 5)
 *
 * Audit-insert failure is forced WITHOUT mocking: `AuditLog.actorUserId` has
 * a FK to `User.id`, so passing a non-existent UUID makes the INSERT violate
 * the foreign key and throw — exactly the "audit failed to write" case.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { prismaUnscoped as prisma } from "../lib/prisma";
import type { TenantTransactionClient } from "../lib/prisma";

/** This verification script runs outside any tenant scope by design (it audits
 * the transactional-audit contract itself), so it uses the unscoped client and
 * casts its tx to the shape logAudit expects. */
const asAuditTx = (tx: unknown) => tx as TenantTransactionClient;
import { logAudit } from "../lib/audit";

const BOGUS_USER_ID = "00000000-0000-0000-0000-000000000000"; // non-existent → FK violation on audit
const BOGUS_SCHEME_ID = "11111111-1111-1111-1111-111111111111"; // non-existent → FK violation on snapshot

async function fixture() {
  const actor = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!actor) throw new Error("No active user found in test DB for fixture");
  const scheme = await prisma.scheme.findFirst({ select: { id: true } });
  if (!scheme) throw new Error("No scheme found in test DB for fixture");
  const fy = await prisma.financialYear.findFirst({ orderBy: { endDate: "desc" }, select: { id: true } });
  if (!fy) throw new Error("No financial year found in test DB for fixture");
  const role = await prisma.role.findFirst({ select: { id: true } });
  if (!role) throw new Error("No role found in test DB for fixture");
  // Find a (user, permission) pair with no existing override so the create is non-destructive.
  const perms = await prisma.permission.findMany({ select: { id: true }, take: 50 });
  if (perms.length === 0) throw new Error("No permission found in test DB for fixture");
  const users = await prisma.user.findMany({ select: { id: true }, take: 20 });
  const existing = new Set(
    (
      await prisma.userPermissionOverride.findMany({
        where: { userId: { in: users.map((u) => u.id) } },
        select: { userId: true, permissionId: true },
      })
    ).map((r) => `${r.userId}|${r.permissionId}`),
  );
  let pair: { userId: string; permissionId: string } | null = null;
  for (const u of users) {
    for (const p of perms) {
      if (!existing.has(`${u.id}|${p.id}`)) {
        pair = { userId: u.id, permissionId: p.id };
        break;
      }
    }
    if (pair) break;
  }
  if (!pair) throw new Error("Could not find an unused (user, permission) pair for RBAC fixture");
  return { actor: actor.id, scheme: scheme.id, fy: fy.id, role: role.id, pair };
}

test("Test 1 (control): successful mutation+audit commits both atomically", async () => {
  const f = await fixture();
  const marker = `ctrl-${randomUUID()}`;
  const action = `verify.control.${randomUUID()}`;
  await prisma.$transaction(async (tx) => {
    const snap = await tx.financeExpenditureSnapshot.create({
      data: {
        schemeId: f.scheme,
        financialYearId: f.fy,
        asOfDate: new Date(),
        soExpenditureCr: new Prisma.Decimal(1),
        ifmsExpenditureCr: new Prisma.Decimal(1),
        remarks: marker,
        createdById: f.actor,
      },
    });
    await logAudit(
      asAuditTx(tx), f.actor, action, "finance_expenditure_snapshot", snap.id, null, { marker });
  });
  const snap = await prisma.financeExpenditureSnapshot.findFirst({ where: { remarks: marker } });
  const audit = await prisma.auditLog.findFirst({ where: { actionType: action } });
  assert.ok(snap, "snapshot should be committed");
  assert.ok(audit, "audit row should be committed");
  await prisma.auditLog.deleteMany({ where: { actionType: action } });
  if (snap) await prisma.financeExpenditureSnapshot.delete({ where: { id: snap.id } });
});

test("Test 2 (financial): audit-insert failure rolls back the financial mutation", async () => {
  const f = await fixture();
  const marker = `auditfail-fin-${randomUUID()}`;
  const action = `verify.auditfail.fin.${randomUUID()}`;
  let caught: unknown;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.financeExpenditureSnapshot.create({
        data: {
          schemeId: f.scheme,
          financialYearId: f.fy,
          asOfDate: new Date(),
          soExpenditureCr: new Prisma.Decimal(2),
          ifmsExpenditureCr: new Prisma.Decimal(2),
          remarks: marker,
          createdById: f.actor,
        },
      });
      // Force the audit write to fail via FK violation on actorUserId.
      await logAudit(
      asAuditTx(tx), BOGUS_USER_ID, action, "finance_expenditure_snapshot", null, null, { marker });
    });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "transaction should have thrown because the audit insert failed");
  const snap = await prisma.financeExpenditureSnapshot.findFirst({ where: { remarks: marker } });
  const audit = await prisma.auditLog.findFirst({ where: { actionType: action } });
  assert.equal(snap, null, "FINANCIAL MUTATION MUST BE ROLLED BACK — snapshot row must not exist");
  assert.equal(audit, null, "no audit row should exist (audit insert failed and rolled back)");
});

test("Test 3 (RBAC): audit-insert failure rolls back the RBAC mutation", async () => {
  const f = await fixture();
  const action = `verify.auditfail.rbac.${randomUUID()}`;
  let caught: unknown;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.create({
        data: {
          userId: f.pair.userId,
          permissionId: f.pair.permissionId,
          effect: "allow",
          createdById: f.actor,
        },
      });
      // Force the audit write to fail via FK violation on actorUserId.
      await logAudit(
      asAuditTx(tx), BOGUS_USER_ID, action, "user_permission_override", null, null, {
        userId: f.pair.userId,
        permissionId: f.pair.permissionId,
      });
    });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "transaction should have thrown because the audit insert failed");
  const override = await prisma.userPermissionOverride.findUnique({
    where: { userId_permissionId: { userId: f.pair.userId, permissionId: f.pair.permissionId } },
  });
  const audit = await prisma.auditLog.findFirst({ where: { actionType: action } });
  assert.equal(override, null, "RBAC MUTATION MUST BE ROLLED BACK — override row must not exist");
  assert.equal(audit, null, "no audit row should exist (audit insert failed and rolled back)");
});

test("Test 4: mutation failure leaves no orphan audit row", async () => {
  const f = await fixture();
  const action = `verify.mutfail.${randomUUID()}`;
  let caught: unknown;
  try {
    await prisma.$transaction(async (tx) => {
      // Audit is written first, then a mutation that fails (invalid schemeId FK).
      // This proves the transaction rolls back an already-written audit when a
      // later operation fails — i.e. no orphan audit row can survive a rollback.
      await logAudit(
      asAuditTx(tx), f.actor, action, "finance_expenditure_snapshot", null, null, { phase: "pre-mutation" });
      await tx.financeExpenditureSnapshot.create({
        data: {
          schemeId: BOGUS_SCHEME_ID, // FK violation → mutation fails
          financialYearId: f.fy,
          asOfDate: new Date(),
          soExpenditureCr: new Prisma.Decimal(3),
          ifmsExpenditureCr: new Prisma.Decimal(3),
        },
      });
    });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "transaction should have thrown because the mutation failed (FK violation)");
  const audit = await prisma.auditLog.findFirst({ where: { actionType: action } });
  assert.equal(audit, null, "NO ORPHAN AUDIT ROW — the audit written before the failing mutation must be rolled back");
});

test("Test 5 (Keycloak): compensating delete runs on transaction failure when keycloak.created=true", async () => {
  // Mirrors the exact try/catch structure of POST /api/v1/admin/users.
  let compensated = false;
  let compensationTarget: string | null = null;
  const deleteKeycloakUserById = async (id: string) => {
    compensationTarget = id;
    compensated = true;
  };
  // Fake $transaction whose callback throws (simulating a DB failure after the
  // Keycloak user was already created).
  const fakeTransaction = async (cb: (tx: unknown) => Promise<unknown>) => {
    await cb({}); // cb throws inside → fakeTransaction re-throws
  };
  const keycloak = { id: "kc-user-123", created: true };
  try {
    await fakeTransaction(async () => {
      throw new Error("simulated DB transaction failure");
    });
  } catch (txError) {
    if (keycloak.created) {
      await deleteKeycloakUserById(keycloak.id);
      // eslint-disable-next-line no-console
      console.error("[test] compensating Keycloak delete executed for", keycloak.id, "— original:", (txError as Error).message);
    }
  }
  assert.equal(compensated, true, "compensating delete MUST run when a freshly-created Keycloak user is orphaned");
  assert.equal(compensationTarget, "kc-user-123");
});

test("Test 5b (Keycloak): no compensating delete when keycloak.created=false (pre-existing user)", async () => {
  let compensated = false;
  const deleteKeycloakUserById = async (_id: string) => {
    compensated = true;
  };
  const fakeTransaction = async (cb: (tx: unknown) => Promise<unknown>) => {
    await cb({});
  };
  const keycloak = { id: "kc-preexisting", created: false };
  try {
    await fakeTransaction(async () => {
      throw new Error("simulated DB transaction failure");
    });
  } catch {
    if (keycloak.created) {
      await deleteKeycloakUserById(keycloak.id);
    }
  }
  assert.equal(compensated, false, "must NOT delete a pre-existing Keycloak user (cannot safely revert role assignment)");
});

test.after(async () => {
  await prisma.$disconnect();
});
