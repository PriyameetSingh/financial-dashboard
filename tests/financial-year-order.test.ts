/**
 * Current-financial-year selection is deterministic (permanent golden).
 *
 * The product resolves "the current financial year" in ~20 places by taking the
 * row with the furthest `endDate`. Nothing constrains two rows from sharing an
 * `endDate` — only (tenantId, label) is unique — and on a tie Postgres returns
 * whichever row the scan reaches first. That is physical row order, so the
 * answer depends on insertion history rather than on anything an officer could
 * see or reason about.
 *
 * These assertions pin the fix: a total order (endDate, createdAt, id) that
 * resolves the same way every time, and no call site left ordering by `endDate`
 * alone.
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma, tenantStamped } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { withTenantContext } from "@/lib/tenant-context";
import { CURRENT_FINANCIAL_YEAR_ORDER } from "@/lib/financial-year-order";

/** Same prefix convention as tests/helpers/seed-scope.ts. */
const PREFIX = "TIEBREAK_FY_";
const SHARED_END = new Date("2031-03-31T00:00:00.000Z");

async function cleanup() {
  await withTenantContext(ODISHA_TENANT_ID, () =>
    prisma.financialYear.deleteMany({ where: { label: { startsWith: PREFIX } } }),
  ).catch(() => {});
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("current financial year — tie on endDate", () => {
  it("resolves to the same row every time, and it is the most recently created", async () => {
    await cleanup();

    const { older, newer } = await withTenantContext(ODISHA_TENANT_ID, async () => {
      // Two years that end on the same day: the exact shape a corrected
      // re-entry of an existing year produces.
      const older = await prisma.financialYear.create({
        data: tenantStamped({
          label: `${PREFIX}OLDER`,
          startDate: new Date("2030-04-01T00:00:00.000Z"),
          endDate: SHARED_END,
        }),
      });
      const newer = await prisma.financialYear.create({
        data: tenantStamped({
          label: `${PREFIX}NEWER`,
          startDate: new Date("2030-04-01T00:00:00.000Z"),
          endDate: SHARED_END,
        }),
      });
      return { older, newer };
    });

    expect(older.endDate.getTime()).toBe(newer.endDate.getTime());

    // Repeat: a single lucky call proves nothing about a tie.
    const picks = await withTenantContext(ODISHA_TENANT_ID, async () => {
      const seen: (string | undefined)[] = [];
      for (let i = 0; i < 10; i += 1) {
        const fy = await prisma.financialYear.findFirst({
          where: { label: { startsWith: PREFIX } },
          orderBy: CURRENT_FINANCIAL_YEAR_ORDER,
          select: { id: true },
        });
        seen.push(fy?.id);
      }
      return seen;
    });

    expect(new Set(picks).size).toBe(1);
    expect(picks[0]).toBe(newer.id);
  });

  it("orders a list the same way it picks the single current year", async () => {
    const labels = await withTenantContext(ODISHA_TENANT_ID, async () => {
      const rows = await prisma.financialYear.findMany({
        where: { label: { startsWith: PREFIX } },
        orderBy: CURRENT_FINANCIAL_YEAR_ORDER,
        select: { label: true },
      });
      return rows.map((r) => r.label);
    });

    // The row a `findFirst` would return leads the list — a dropdown and the
    // dashboard behind it cannot disagree about which year is current.
    expect(labels[0]).toBe(`${PREFIX}NEWER`);
  });
});

describe("no call site orders financial years by endDate alone", () => {
  const ROOTS = ["app", "lib", "scripts"];
  const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
      else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
    }
    return out;
  }

  it("every financial-year ordering goes through CURRENT_FINANCIAL_YEAR_ORDER", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const text = readFileSync(file, "utf8");
        // The definition of the constant is the one legitimate occurrence.
        if (file.endsWith("lib/financial-year-order.ts")) continue;
        if (/orderBy:\s*\{\s*endDate:\s*["']desc["']\s*\}/.test(text)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
