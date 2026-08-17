/**
 * Dev path-based tenant routing — the pure decisions (permanent golden).
 *
 * The proxy branch itself is proven over real HTTP by the path-mode section of
 * scripts/check-http-smoke.mjs. What is asserted here is the part that can be
 * got wrong silently: which first segments may be read as a tenant slug, and
 * that the gate is shut unless BOTH dev conditions hold.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEV_TENANT_ENTRY_PATH,
  RESERVED_ROOT_SEGMENTS,
  devPathRoutingEnabled,
  splitTenantPath,
} from "@/lib/dev-path-routing";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the gate", () => {
  it("stays shut unless development AND DEV_AUTH_ENABLED both hold", () => {
    const cases: [string | undefined, string | undefined, boolean][] = [
      ["development", "1", true],
      ["development", undefined, false],
      ["development", "0", false],
      ["production", "1", false],
      ["test", "1", false],
      [undefined, "1", false],
    ];
    for (const [nodeEnv, devAuth, expected] of cases) {
      vi.stubEnv("NODE_ENV", nodeEnv as never);
      vi.stubEnv("DEV_AUTH_ENABLED", devAuth as never);
      expect(devPathRoutingEnabled(), `NODE_ENV=${nodeEnv} DEV_AUTH_ENABLED=${devAuth}`).toBe(
        expected,
      );
    }
  });
});

describe("splitting a path into tenant + remainder", () => {
  it("reads a slug and keeps the remainder", () => {
    expect(splitTenantPath("/odisha/dashboard")).toEqual({
      slugCandidate: "odisha",
      rest: "/dashboard",
    });
    expect(splitTenantPath("/demo/financial/schemes-board")).toEqual({
      slugCandidate: "demo",
      rest: "/financial/schemes-board",
    });
  });

  it("treats a bare /{slug} as the workspace entry", () => {
    expect(splitTenantPath("/demo")).toEqual({ slugCandidate: "demo", rest: "/" });
    expect(splitTenantPath("/demo/")).toEqual({ slugCandidate: "demo", rest: "/" });
    // …and the entry lands in the workspace, not back out on the landing.
    expect(DEV_TENANT_ENTRY_PATH).toBe("/dashboard");
  });

  it("never reads a reserved root as a tenant", () => {
    for (const reserved of RESERVED_ROOT_SEGMENTS) {
      const { slugCandidate } = splitTenantPath(`/${reserved}/anything`);
      expect(slugCandidate, `/${reserved} must not be a tenant`).toBeNull();
    }
  });

  it("refuses the root, asset requests and malformed segments", () => {
    for (const path of ["/", "/logo.png", "/_next/static/x.js", "/Odisha%20Dev", "/UPPER"]) {
      expect(splitTenantPath(path).slugCandidate, path).toBeNull();
    }
  });

  it("leaves the path untouched when there is no slug", () => {
    expect(splitTenantPath("/dashboard")).toEqual({ slugCandidate: null, rest: "/dashboard" });
  });
});

describe("reserved roots stay in step with the app", () => {
  it("every top-level route directory is reserved", () => {
    const routeDirs = readdirSync("app").filter((entry) => {
      if (entry.startsWith("_") || entry.startsWith("(")) return false;
      return statSync(join("app", entry)).isDirectory();
    });

    const unreserved = routeDirs.filter((dir) => !RESERVED_ROOT_SEGMENTS.has(dir));
    // A new route directory that is not listed could be shadowed by a tenant
    // whose slug happens to match it — the page would vanish in dev only.
    expect(unreserved).toEqual([]);
  });
});
