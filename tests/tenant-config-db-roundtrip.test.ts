/**
 * Phase 2 Gate C — DB→config round-trip assertions (permanent golden).
 *
 * Proves the Odisha config stored in tenant_config_entries (migration
 * 20260813084800_phase2_odisha_backfill) deserializes through the KV registry
 * BYTE-IDENTICALLY to the file defaults — every stored key including the
 * `labels` object — and that rendering under a DB-resolved tenant context
 * (the real request-scoped holder, via withTenantContext) produces exactly
 * the strings the golden already pins for the file-default path.
 *
 * Scope note (explicit, per Gate C review): a green run here proves the
 * DB round-trip and the holder path — it does NOT prove that every request
 * entry point primes the holder, because under Odisha the fallback renders
 * identically to the primed path. Priming coverage becomes observable (and is
 * asserted) at Gate D with a second, differently-configured tenant.
 */
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  ODISHA_DEFAULTS,
  ODISHA_TENANT_ID,
  tenantConfig,
} from "@/lib/tenant-config";
import { overlayConfigEntries, STORABLE_KEYS, assertStorableKey } from "@/lib/tenant-config/registry";
import { loadTenantConfigFromDb, withTenantContext } from "@/lib/tenant-context";
import { formatCurrency, formatNumber, tenantLocale, tenantTimezone } from "@/lib/tenant-config/format";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Odisha tenant row and config entries (from migration M2)", () => {
  it("the Odisha tenant exists at the well-known id, active, slug 'odisha'", async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: ODISHA_TENANT_ID } });
    expect(tenant).not.toBeNull();
    expect(tenant!.slug).toBe("odisha");
    expect(tenant!.status).toBe("active");
  });

  it("every storable key has a DB row — none missing, none unknown", async () => {
    const rows = await prisma.tenantConfigEntry.findMany({
      where: { tenantId: ODISHA_TENANT_ID },
      select: { key: true },
    });
    expect(new Set(rows.map((r) => r.key))).toEqual(new Set(STORABLE_KEYS));
  });
});

describe("DB → config deserialization is byte-identical to ODISHA_DEFAULTS", () => {
  it("overlay of the raw DB rows reproduces the full defaults object (labels included)", async () => {
    const rows = await prisma.tenantConfigEntry.findMany({
      where: { tenantId: ODISHA_TENANT_ID },
      select: { key: true, value: true },
    });
    const config = overlayConfigEntries(ODISHA_DEFAULTS, rows);
    // Full-object strict equality: every stored key round-trips exactly, and
    // env-backed keys fall back to the identical defaults.
    expect(config).toStrictEqual(ODISHA_DEFAULTS);
    // The labels OBJECT specifically survives jsonb round-trip key-for-key.
    // The stored row carries the two compact keys; the formal report-heading
    // forms come from the defaults through the label merge, so Odisha's
    // headings stay byte-identical without a migration.
    expect(config.labels).toStrictEqual({
      soExpenditure: "SO",
      ifmsExpenditure: "IFMS",
      soExpenditureFormal: "S.O.",
      ifmsExpenditureFormal: "IFMS",
    });
  });

  it("loadTenantConfigFromDb (the resolver's own loader) agrees", async () => {
    expect(await loadTenantConfigFromDb(ODISHA_TENANT_ID)).toStrictEqual(ODISHA_DEFAULTS);
  });
});

describe("Rendering under a DB-resolved tenant context matches the file-default pins", () => {
  it("tenantConfig() inside withTenantContext returns the DB-resolved config", async () => {
    await withTenantContext(ODISHA_TENANT_ID, () => {
      expect(tenantConfig()).toStrictEqual(ODISHA_DEFAULTS);
    });
  });

  it("pinned currency/number/locale/timezone strings are identical through the DB path", async () => {
    await withTenantContext(ODISHA_TENANT_ID, () => {
      expect(
        formatCurrency(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ).toBe("₹1,23,456.78 Cr");
      expect(
        formatNumber(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ).toBe("1,23,456.78");
      expect(tenantLocale()).toBe("en-IN");
      expect(tenantTimezone()).toBe("Asia/Kolkata");
      const { labels, pdfHeaderLine, productName } = tenantConfig();
      expect(labels.soExpenditure).toBe("SO");
      expect(labels.ifmsExpenditure).toBe("IFMS");
      expect(pdfHeaderLine).toBe("Government of Odisha");
      expect(productName).toBe("HUDD Dashboard");
    });
  });
});

describe("Registry guardrails", () => {
  it("env-only keys are rejected by the write-path guard", () => {
    for (const key of ["basePath", "keycloakRealm", "keycloakClientId", "seedAdminEmail"]) {
      expect(() => assertStorableKey(key)).toThrowError(/env-only/);
    }
    expect(() => assertStorableKey("noSuchKey")).toThrowError(/Unknown/);
  });

  it("malformed rows degrade to defaults instead of breaking config", () => {
    const config = overlayConfigEntries(ODISHA_DEFAULTS, [
      { key: "currencySymbol", value: 42 }, // wrong shape → ignored
      { key: "labels", value: { soExpenditure: 7 } }, // wrong-typed key → that key falls back
      { key: "keycloakRealm", value: "sneaky" }, // env-only → ignored
      { key: "unknown", value: "x" }, // unknown → ignored
    ]);
    expect(config).toStrictEqual(ODISHA_DEFAULTS);
  });
});
