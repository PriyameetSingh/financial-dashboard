/**
 * Phase 3 Gate C — the tenant config admin write path.
 *
 * Two things are under test and they are separable:
 *
 *   1. The REGISTRY (pure): storage classes and per-key value validation. This
 *      is the security-relevant half — env-only keys barred from the database,
 *      secret keys never readable, malformed values refused — so it is asserted
 *      without a server, the same way the entitlement guard is.
 *   2. The STORE (DB): a valid write round-trips into the config a tenant
 *      actually renders, and one tenant's write is invisible to another.
 *
 * The API route composes exactly these two, plus `requirePermission`, so
 * covering both halves covers the endpoint's behaviour without standing up
 * HTTP a second time (the smoke leg already proves the request path).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prismaUnscoped } from "@/lib/prisma";
import { ODISHA_TENANT_ID, ODISHA_DEFAULTS } from "@/lib/tenant-config";
import { loadTenantConfigFromDb } from "@/lib/tenant-context";
import {
  configKeyClass,
  isSecretKey,
  listConfigKeys,
  overlayConfigEntries,
  validateConfigValue,
} from "@/lib/tenant-config/registry";
import {
  clearTenantConfigEntry,
  readTenantConfigEntries,
  writeTenantConfigEntry,
} from "@/lib/tenant-config/store";

const OTHER_SLUG = "configtenant-b";
let otherTenantId: string;

beforeAll(async () => {
  const tenant = await prismaUnscoped.tenant.upsert({
    where: { slug: OTHER_SLUG },
    update: { status: "active" },
    create: { slug: OTHER_SLUG, name: "Config Test Authority", status: "active" },
  });
  otherTenantId = tenant.id;
}, 120_000);

afterAll(async () => {
  // ONLY this file's own tenant. Odisha's config rows are migration-seeded
  // shared fixture state that tests/tenant-config-db-roundtrip.test.ts asserts
  // on — deleting them here would break a sibling suite, which is exactly what
  // an earlier version of this cleanup did.
  await prismaUnscoped.tenantConfigEntry.deleteMany({ where: { tenantId: otherTenantId } }).catch(() => {});
  await prismaUnscoped.tenant.deleteMany({ where: { slug: OTHER_SLUG } }).catch(() => {});
  await prismaUnscoped.$disconnect();
});

describe("Storage classes", () => {
  it("classifies every key the admin surface exposes", () => {
    expect(configKeyClass("locale")).toBe("storable");
    expect(configKeyClass("labels")).toBe("storable");
    expect(configKeyClass("basePath")).toBe("env-only");
    expect(configKeyClass("keycloakClientSecret" /* not a known key at all */)).toBe("unknown");
    expect(configKeyClass("llmApiKey")).toBe("secret");
  });

  it("env-only keys are rejected from storage, every one of them", () => {
    for (const key of ["basePath", "keycloakRealm", "keycloakClientId", "seedAdminEmail"]) {
      const reason = validateConfigValue(key, "anything");
      expect(reason, key).toMatch(/env-only/);
    }
  });

  it("unknown keys are rejected", () => {
    expect(validateConfigValue("nonsense", "x")).toMatch(/Unknown tenant config key/);
  });

  it("the readable key list never contains an env-only key", () => {
    const listed = listConfigKeys().map((e) => e.key);
    for (const key of ["basePath", "keycloakRealm", "keycloakClientId", "seedAdminEmail"]) {
      expect(listed).not.toContain(key);
    }
  });

  it("secret keys are not part of TenantConfig, so they can never render", () => {
    // The rendering config is what reaches components and the client provider.
    // A secret must not be reachable from it even if a row exists.
    for (const { key } of listConfigKeys().filter((e) => e.class === "secret")) {
      expect(Object.prototype.hasOwnProperty.call(ODISHA_DEFAULTS, key)).toBe(false);
    }
  });

  it("a stored secret row is ignored by the config overlay", () => {
    const config = overlayConfigEntries(ODISHA_DEFAULTS, [
      { key: "llmApiKey", value: "sk-super-secret" },
      { key: "productName", value: "Suryapur Insights" },
    ]);
    expect(config.productName).toBe("Suryapur Insights");
    expect(JSON.stringify(config)).not.toContain("sk-super-secret");
  });
});

describe("Per-key value validation (backlog P4)", () => {
  it("accepts well-formed values", () => {
    const good: [string, unknown][] = [
      ["locale", "en-IN"],
      ["locale", "en-US"],
      ["timezone", "Asia/Kolkata"],
      ["timezone", "America/Chicago"],
      ["currencySymbol", "₹"],
      ["currencyUnit", "Cr"],
      ["productName", "Suryapur Insights"],
      ["pdfHeaderLine", "Suryapur Development Authority"],
      ["logoPublicPath", "/suryapur-logo.svg"],
      ["logoPublicPath", "https://cdn.example.test/logo.svg"],
      ["labels", { soExpenditure: "Sanctioned", ifmsExpenditure: "Disbursed" }],
    ];
    for (const [key, value] of good) {
      expect(validateConfigValue(key, value), `${key}=${JSON.stringify(value)}`).toBeNull();
    }
  });

  it("rejects a malformed locale — the exact gap this discharges", () => {
    // Before Gate C this stored happily and degraded the tenant to Odisha
    // defaults at render time, silently.
    expect(validateConfigValue("locale", "not-a-locale")).toMatch(/BCP-47/);
    expect(validateConfigValue("locale", "1234")).toMatch(/BCP-47/);
    expect(validateConfigValue("locale", "")).toMatch(/must not be empty/);
  });

  it("rejects a malformed timezone", () => {
    expect(validateConfigValue("timezone", "Mars/Olympus")).toMatch(/IANA/);
    expect(validateConfigValue("timezone", "GMT+25")).toMatch(/IANA/);
  });

  it("rejects an unsafe or non-https logo path", () => {
    expect(validateConfigValue("logoPublicPath", "javascript:alert(1)")).toMatch(/root-relative/);
    expect(validateConfigValue("logoPublicPath", "http://cdn.example.test/logo.svg")).toMatch(/root-relative/);
    expect(validateConfigValue("logoPublicPath", "//evil.example.test/logo.svg")).toMatch(/root-relative/);
  });

  it("rejects wrong types and oversized values", () => {
    expect(validateConfigValue("productName", 42)).toMatch(/must be a string/);
    expect(validateConfigValue("productName", "x".repeat(513))).toMatch(/too long/);
    expect(validateConfigValue("currencySymbol", "x".repeat(9))).toMatch(/too long/);
  });

  it("validates the labels object, including unknown label keys", () => {
    expect(validateConfigValue("labels", "not-an-object")).toMatch(/must be an object/);
    expect(validateConfigValue("labels", { nope: "x" })).toMatch(/Unknown label/);
    expect(validateConfigValue("labels", { soExpenditure: "" })).toMatch(/non-empty/);
  });

  it("requires a non-empty secret but never inspects it further", () => {
    expect(validateConfigValue("llmApiKey", "")).toMatch(/non-empty/);
    expect(validateConfigValue("llmApiKey", 1)).toMatch(/non-empty/);
    expect(validateConfigValue("llmApiKey", "sk-anything")).toBeNull();
  });
});

describe("Round-trip and tenant isolation", () => {
  async function write(tenantId: string, key: string, value: unknown) {
    expect(validateConfigValue(key, value)).toBeNull();
    await prismaUnscoped.tenantConfigEntry.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: { value: value as never },
      create: { tenantId, key, value: value as never },
    });
  }

  it("a valid write round-trips into the config the tenant renders", async () => {
    await write(otherTenantId, "locale", "en-US");
    await write(otherTenantId, "productName", "Config Test Dashboard");

    const config = await loadTenantConfigFromDb(otherTenantId);
    expect(config.locale).toBe("en-US");
    expect(config.productName).toBe("Config Test Dashboard");
    // Untouched keys still come from the defaults.
    expect(config.currencySymbol).toBe(ODISHA_DEFAULTS.currencySymbol);
  });

  it("one tenant's config change never affects another", async () => {
    await write(otherTenantId, "locale", "en-US");

    const odisha = await loadTenantConfigFromDb(ODISHA_TENANT_ID);
    const other = await loadTenantConfigFromDb(otherTenantId);

    expect(other.locale).toBe("en-US");
    expect(odisha.locale).toBe(ODISHA_DEFAULTS.locale);
    expect(odisha.productName).toBe(ODISHA_DEFAULTS.productName);
  });

  it("a stored secret never reaches the rendered config of its own tenant", async () => {
    await write(otherTenantId, "llmApiKey", "sk-never-render-me");

    const config = await loadTenantConfigFromDb(otherTenantId);
    expect(JSON.stringify(config)).not.toContain("sk-never-render-me");
    expect((config as Record<string, unknown>).llmApiKey).toBeUndefined();

    // It IS in the table — the point is that reads of the rendering config
    // cannot surface it, and the API reports presence only.
    const row = await prismaUnscoped.tenantConfigEntry.findFirst({
      where: { tenantId: otherTenantId, key: "llmApiKey" },
      select: { key: true },
    });
    expect(row?.key).toBe("llmApiKey");
    expect(isSecretKey("llmApiKey")).toBe(true);
  });

  it("clearing a key reverts that tenant to the default", async () => {
    await write(otherTenantId, "productName", "Temporary Name");
    expect((await loadTenantConfigFromDb(otherTenantId)).productName).toBe("Temporary Name");

    await prismaUnscoped.tenantConfigEntry.deleteMany({
      where: { tenantId: otherTenantId, key: "productName" },
    });
    expect((await loadTenantConfigFromDb(otherTenantId)).productName).toBe(ODISHA_DEFAULTS.productName);
  });
});

describe("Store accessor guard", () => {
  it("refuses a missing tenantId rather than reading across tenants", async () => {
    // `tenant_config_entries` is a GLOBAL model — the chokepoint does not filter
    // it — so an empty tenantId slipping through a loose type would read or
    // delete every tenant's rows. Fail loudly instead.
    await expect(readTenantConfigEntries("")).rejects.toThrow(/requires an explicit tenantId/);
    await expect(writeTenantConfigEntry("", "locale", "en-IN")).rejects.toThrow(
      /requires an explicit tenantId/,
    );
    await expect(clearTenantConfigEntry("", "locale")).rejects.toThrow(/requires an explicit tenantId/);
  });

  it("reads back only the requested tenant's rows", async () => {
    await prismaUnscoped.tenantConfigEntry.upsert({
      where: { tenantId_key: { tenantId: otherTenantId, key: "productName" } },
      update: { value: "Store Test" as never },
      create: { tenantId: otherTenantId, key: "productName", value: "Store Test" as never },
    });
    const rows = await readTenantConfigEntries(otherTenantId);
    expect(rows.some((r) => r.key === "productName" && r.value === "Store Test")).toBe(true);
    const odishaRows = await readTenantConfigEntries(ODISHA_TENANT_ID);
    expect(odishaRows.some((r) => r.value === "Store Test")).toBe(false);
  });
});
