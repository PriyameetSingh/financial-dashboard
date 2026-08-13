/**
 * Golden blind-spot hardening — pins the EXACT rendered output of the surfaces
 * Step 3 mutates (currency string, locale number, PDF header text, UI labels).
 * If extraction changes a rendered form, this file fails.
 *
 * The PDF text is extracted from the rendered buffer by decompressing each
 * FlateDecode content stream (zlib) and searching the decoded bytes — no
 * external PDF parser dependency.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inflateSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { ODISHA_TENANT_ID } from "@/lib/tenant-config";
import { enterTenantScope } from "@/lib/tenant-context";
import { resolveDataScopeForUser, type DataScope } from "@/lib/data-scope";
import { buildMeetingReport } from "@/lib/meeting-report";
import { renderMeetingReportPdfBuffer } from "@/lib/meeting-report-pdf-server";
import {
  seedScope,
  cleanupScopeSeed,
  loadDbUserWithRbac,
  type ScopeSeed,
} from "./helpers/seed-scope";
import {
  tenantConfig,
} from "@/lib/tenant-config";
import {
  formatCurrency,
  formatNumber,
  tenantLocale,
  tenantTimezone,
} from "@/lib/tenant-config/format";

let seed: ScopeSeed;
let fullScope: DataScope;
let fullDbUser: Awaited<ReturnType<typeof loadDbUserWithRbac>>;

beforeAll(async () => {
  // Phase 2: these suites exercise Odisha's data through the tenant-scoped
  // client, so the process enters Odisha's scope first (test-only ergonomic
  // form of withTenantContext).
  await enterTenantScope(ODISHA_TENANT_ID);
  seed = await seedScope();
  fullDbUser = await loadDbUserWithRbac(seed.fullUser.id);
  fullScope = await resolveDataScopeForUser(fullDbUser);
});

afterAll(async () => {
  await cleanupScopeSeed();
  await prisma.$disconnect();
});

/** Extract text from a PDF buffer by decoding hex (`<…>`) and literal (`(…)`)
 * string operands inside text-showing TJ/Tj operators across every
 * decompressed FlateDecode content stream. react-pdf stores text as
 * hex-encoded byte strings with kerning numbers between them, e.g.
 * `[<476f> 20 <7665726e…>] TJ` → "Government of Odisha". */
function extractPdfText(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const chunks: Buffer[] = [];
  // Locate each `stream\r?\n ... \r?\nendstream` segment and inflate it.
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    try {
      chunks.push(inflateSync(Buffer.from(m[1], "latin1")));
    } catch {
      // Not a FlateDecode stream (e.g. an image). Skip.
    }
  }
  const decoded = Buffer.concat(chunks).toString("latin1");
  // Pull every hex-string operand `<…>` and literal-string operand `(…)`.
  const parts: string[] = [];
  const hexRe = /<([0-9a-fA-F]+)>/g;
  let h: RegExpExecArray | null;
  while ((h = hexRe.exec(decoded)) !== null) {
    parts.push(Buffer.from(h[1], "hex").toString("latin1"));
  }
  const litRe = /\(((?:[^()\\]|\\.)*)\)/g;
  let l: RegExpExecArray | null;
  while ((l = litRe.exec(decoded)) !== null) {
    // Unescape PDF string escapes minimally.
    parts.push(l[1].replace(/\\([()\\])/g, "$1"));
  }
  return parts.join("");
}

describe("Blind spot (a) — formatted currency value (exact rendered string)", () => {
  it("matches today's inline ₹ + en-IN + Cr output", () => {
    // Mirrors the dominant inline pattern:
    //   `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`
    expect(formatCurrency(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      "₹1,23,456.78 Cr",
    );
  });

  it("omits the unit when withUnit is false", () => {
    expect(formatCurrency(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2, withUnit: false })).toBe(
      "₹1,23,456.78",
    );
  });
});

describe("Blind spot (b) — locale-formatted number (exact rendered string)", () => {
  it("en-IN Indian grouping for a 6-digit value with 2 fraction digits", () => {
    expect(formatNumber(123456.78, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      "1,23,456.78",
    );
  });

  it("en-IN grouping for a 9-digit value", () => {
    expect(formatNumber(123456789, { maximumFractionDigits: 0 })).toBe("12,34,56,789");
  });
});

describe("Blind spot (c) — PDF header text extracted from the rendered buffer", () => {
  it("the meeting report PDF contains 'Government of Odisha'", async () => {
    const payload = await buildMeetingReport(seed.meeting.id, fullScope);
    expect(payload).not.toBeNull();
    const buffer = await renderMeetingReportPdfBuffer(payload!);
    const text = extractPdfText(buffer);
    expect(text).toContain("Government of Odisha");
  });
});

describe("Blind spot (d) — UI labels pinned to today's Odisha copy", () => {
  it("SO / IFMS domain labels", () => {
    const { labels } = tenantConfig();
    expect(labels.soExpenditure).toBe("SO");
    expect(labels.ifmsExpenditure).toBe("IFMS");
  });

  it("product name and locale/timezone defaults", () => {
    const cfg = tenantConfig();
    expect(cfg.productName).toBe("HUDD Dashboard");
    expect(tenantLocale()).toBe("en-IN");
    expect(tenantTimezone()).toBe("Asia/Kolkata");
  });
});
