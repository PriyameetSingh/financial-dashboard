import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, moduleByCode, type ModuleTier } from "@/lib/entitlements/catalog";
import {
  moduleWithinCeiling,
  planCeiling,
  resolveGrants,
  tiersReachedBy,
  TIER_ORDER,
} from "@/lib/entitlements/plan";
import { ODISHA_DEFAULTS } from "@/lib/tenant-config";
import { overlayConfigEntries, validateConfigValue } from "@/lib/tenant-config/registry";
import { themeOverrideCss } from "@/components/nocturne/theme";
import {
  CAPABILITY_GROUPS,
  CAPABILITY_COUNT,
  PLATFORM_STANDARD,
  gatedGroups,
  groupsForModule,
} from "@/lib/menu-card/capabilities";

/**
 * S3 — the two configurators.
 *
 * These are the first screens where a TENANT ADMINISTRATOR — not an operator,
 * not a developer — writes values that the product then renders and enforces.
 * Two boundaries meet untrusted input for the first time, and both are tested
 * here as boundaries rather than as features:
 *
 *   1. THEME VALUES reach a `<style>` element on every page the tenant renders.
 *      The Gate A tests proved the generator cannot emit something dangerous;
 *      these prove the WRITE PATH cannot store something the generator would
 *      have to drop, and that the read path re-sanitises anyway.
 *   2. MODULE TOGGLES decide what the tenant is entitled to. These prove the
 *      ceiling is applied by the shared resolver, that it cannot be raised from
 *      the request, and that it is the same resolver onboarding uses.
 */

/* ── 1. the theme write→render path ──────────────────────────────────────── */

describe("themeOverrides: what may be stored", () => {
  it("accepts a plain, well-formed theme", () => {
    expect(
      validateConfigValue("themeOverrides", {
        dark: { "--color-accent": "#5fa8a0" },
        light: { "--color-accent": "#2b5a54", "--dv-cat-1": "#3f847c" },
      }),
    ).toBeNull();
  });

  it("accepts an empty object — that is how a tenant reverts to the platform palette", () => {
    expect(validateConfigValue("themeOverrides", {})).toBeNull();
    expect(validateConfigValue("themeOverrides", { dark: {} })).toBeNull();
  });

  it("rejects a CSS breakout attempt, naming the role", () => {
    const reason = validateConfigValue("themeOverrides", {
      dark: { "--color-accent": "red; } body { display: none } .x {" },
    });
    expect(reason).toContain("--color-accent");
    expect(reason).toContain("hex");
  });

  it("rejects every shape of value that is not a hex colour", () => {
    for (const value of [
      "red",
      "rgb(1,2,3)",
      "var(--color-text)",
      "url(https://evil.test/x)",
      "#ffff",
      "expression(alert(1))",
      "</style><script>alert(1)</script>",
      "#5fa8a0 !important",
      "",
      null,
      42,
      { nested: "#5fa8a0" },
      ["#5fa8a0"],
    ]) {
      const reason = validateConfigValue("themeOverrides", { dark: { "--color-accent": value } });
      expect(reason, `accepted ${JSON.stringify(value)}`).not.toBeNull();
    }
  });

  it("rejects a property that is not a swappable role", () => {
    // Structural decisions are not tenant-configurable. A tenant that could set
    // `--radius-md` or `--font-heading-weight` would be redesigning the product.
    for (const role of ["--radius-md", "--font-heading-weight", "--space-4", "background", "--"]) {
      const reason = validateConfigValue("themeOverrides", { dark: { [role]: "#5fa8a0" } });
      expect(reason, `accepted ${role}`).toContain("not a colour a tenant may set");
    }
  });

  it("rejects a theme name that is not dark or light", () => {
    const reason = validateConfigValue("themeOverrides", { sepia: { "--color-accent": "#5fa8a0" } });
    expect(reason).toContain("dark");
    expect(reason).toContain("light");
  });

  it("rejects the container itself when it is not an object", () => {
    for (const value of ["#5fa8a0", 42, null, [], [{ "--color-accent": "#5fa8a0" }]]) {
      expect(validateConfigValue("themeOverrides", value), JSON.stringify(value)).not.toBeNull();
    }
  });

  it("survives a prototype-pollution shaped payload without polluting anything", () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "dark": {"--color-accent": "#5fa8a0"}}');
    // `__proto__` in a JSON.parse result is an ordinary own property, so it is
    // seen as an unexpected theme name and refused rather than silently ignored.
    expect(validateConfigValue("themeOverrides", payload)).not.toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses rather than silently dropping — the difference that matters on a write path", () => {
    // The generator's job is to never emit something dangerous, so it drops.
    // The write path's job is to not store a theme the administrator did not
    // get: saving half of what was submitted is worse than refusing all of it.
    const half = { dark: { "--color-accent": "#5fa8a0", "--radius-md": "8px" } };
    expect(validateConfigValue("themeOverrides", half)).not.toBeNull();
  });
});

describe("themeOverrides: what survives to render", () => {
  it("reaches the rendered config when it is valid", () => {
    const config = overlayConfigEntries(ODISHA_DEFAULTS, [
      { key: "themeOverrides", value: { dark: { "--color-accent": "#5fa8a0" } } },
    ]);
    expect(config.themeOverrides).toEqual({ dark: { "--color-accent": "#5fa8a0" } });
  });

  it("is re-sanitised on the way out, so a row that skipped validation is still safe", () => {
    // A row can arrive from a migration, a restored backup or a direct database
    // edit — none of which passed through `validateConfigValue`.
    const config = overlayConfigEntries(ODISHA_DEFAULTS, [
      {
        key: "themeOverrides",
        value: {
          dark: { "--color-accent": "red; } * { display: none } .x {", "--color-bg": "#161826" },
          sepia: { "--color-accent": "#5fa8a0" },
        },
      },
    ]);
    expect(config.themeOverrides).toEqual({ dark: { "--color-bg": "#161826" } });
  });

  it("defaults to no overrides, which is what keeps an unconfigured tenant identical", () => {
    expect(overlayConfigEntries(ODISHA_DEFAULTS, []).themeOverrides).toEqual({});
    expect(ODISHA_DEFAULTS.themeOverrides).toEqual({});
  });

  it("cannot produce CSS that escapes its own block, end to end", () => {
    // The whole path a configurator write actually takes: validate, overlay,
    // generate. Anything that survives all three is what reaches the browser.
    const hostile = {
      dark: {
        "--color-accent": "#5fa8a0",
        "--color-bg": '</style><script>alert(1)</script>',
      },
    };
    expect(validateConfigValue("themeOverrides", hostile)).not.toBeNull();

    // Force it past validation, as a corrupted row would be, and check the
    // remaining two layers hold on their own.
    const config = overlayConfigEntries(ODISHA_DEFAULTS, [{ key: "themeOverrides", value: hostile }]);
    const css = themeOverrideCss("nabc123", config.themeOverrides);
    expect(css).not.toContain("<");
    expect(css).not.toContain("script");
    expect(css.split("{").length).toBe(css.split("}").length);
    expect(css).toContain("--color-accent:#5fa8a0;");
  });

  it("refuses a scope id carrying a selector, so a generated id cannot be steered", () => {
    for (const bad of ['a"] { color: red } [x="', "a b", "a}", "<script>", "*"]) {
      expect(themeOverrideCss(bad, { dark: { "--color-accent": "#5fa8a0" } }), bad).toBe("");
    }
  });
});

describe("secret keys stay write-only", () => {
  it("is never part of the rendered config, however it is stored", () => {
    const config = overlayConfigEntries(ODISHA_DEFAULTS, [
      { key: "llmApiKey", value: "sk-should-never-render" },
    ]);
    expect(JSON.stringify(config)).not.toContain("sk-should-never-render");
    expect((config as Record<string, unknown>).llmApiKey).toBeUndefined();
  });

  it("is still writable — presence, not material, is what is withheld", () => {
    expect(validateConfigValue("llmApiKey", "sk-a-real-looking-key")).toBeNull();
    expect(validateConfigValue("llmApiKey", "")).not.toBeNull();
  });
});

/* ── 2. the tier ceiling ─────────────────────────────────────────────────── */

describe("the plan ceiling", () => {
  it("reads a missing plan as the lowest tier, not the highest", () => {
    expect(planCeiling(null)).toBe("core");
    expect(planCeiling(undefined)).toBe("core");
    expect(planCeiling("enterprise" as ModuleTier)).toBe("core");
    expect(planCeiling("premium")).toBe("premium");
  });

  it("reaches its own tier and everything below", () => {
    expect(tiersReachedBy("core")).toEqual(["core"]);
    expect(tiersReachedBy("standard")).toEqual(["core", "standard"]);
    expect(tiersReachedBy("addon")).toEqual([...TIER_ORDER]);
  });

  it("covers every tier the catalog actually uses", () => {
    const used = new Set(MODULE_CATALOG.map((m) => m.tier).filter((t): t is ModuleTier => t !== null));
    for (const tier of used) {
      expect(TIER_ORDER.includes(tier), `no ceiling reaches "${tier}"`).toBe(true);
    }
  });
});

describe("resolveGrants — the one intersection both configurator and onboarding use", () => {
  it("always enables every core module, asked for or not", () => {
    const cores = MODULE_CATALOG.filter((m) => m.enforcement === "core").map((m) => m.code);
    const { enabled } = resolveGrants([], "core");
    for (const code of cores) expect(enabled, code).toContain(code);
  });

  it("cannot be made to disable a core module", () => {
    // A payload that omits every core code — or names only gated ones — still
    // produces a workspace that can be administered.
    const { enabled } = resolveGrants(["MOD-FIN"], "standard");
    expect(enabled).toContain("MOD-ADMIN");
    expect(enabled).toContain("MOD-RBAC");
    expect(enabled).toContain("MOD-SHELL");
  });

  it("denies a module above the ceiling and says so", () => {
    // MOD-AI is premium. A standard plan cannot have it.
    const { enabled, denied } = resolveGrants(["MOD-FIN", "MOD-AI"], "standard");
    expect(enabled).toContain("MOD-FIN");
    expect(enabled).not.toContain("MOD-AI");
    expect(denied).toEqual(["MOD-AI"]);
  });

  it("cannot be self-upgraded by asking for everything", () => {
    // The attack, stated plainly: a tenant admin edits the PUT body to name
    // every module in the catalog. They get exactly their tier.
    const everything = MODULE_CATALOG.map((m) => m.code);
    const { enabled, denied } = resolveGrants(everything, "core");
    const gated = MODULE_CATALOG.filter((m) => m.enforcement === "gated").map((m) => m.code);
    for (const code of gated) {
      expect(enabled, `${code} was granted on a core plan`).not.toContain(code);
      expect(denied, `${code} was dropped without being reported`).toContain(code);
    }
  });

  it("never grants a roadmap module, and never reports one as denied", () => {
    const roadmap = MODULE_CATALOG.filter((m) => m.enforcement === "roadmap").map((m) => m.code);
    const { enabled, denied } = resolveGrants(roadmap, "addon");
    for (const code of roadmap) {
      expect(enabled, code).not.toContain(code);
      expect(denied, code).not.toContain(code);
    }
  });

  it("ignores codes that are not in the catalog at all", () => {
    const { enabled, denied } = resolveGrants(["MOD-NOT-REAL", "../../etc/passwd", ""], "addon");
    expect(enabled.every((code) => moduleByCode(code) !== undefined)).toBe(true);
    expect(denied).toEqual([]);
  });

  it("is monotonic — a higher ceiling never grants less", () => {
    const wanted = MODULE_CATALOG.filter((m) => m.enforcement === "gated").map((m) => m.code);
    let previous = 0;
    for (const tier of TIER_ORDER) {
      const { enabled } = resolveGrants(wanted, tier);
      expect(enabled.length, `${tier} granted fewer than the tier below`).toBeGreaterThanOrEqual(previous);
      previous = enabled.length;
    }
  });

  it("agrees with moduleWithinCeiling for every module and every tier", () => {
    // Two functions answer "can this tenant have this?" — the resolver decides
    // writes, `moduleWithinCeiling` decides how the row is drawn. A screen that
    // showed a toggle the server would refuse is exactly the confusion this
    // check prevents.
    const gated = MODULE_CATALOG.filter((m) => m.enforcement === "gated").map((m) => m.code);
    for (const tier of TIER_ORDER) {
      const { enabled } = resolveGrants(gated, tier);
      for (const code of gated) {
        expect(moduleWithinCeiling(code, tier), `${code} at ${tier}`).toBe(enabled.includes(code));
      }
    }
  });
});

/* ── 3. the capability catalogue ─────────────────────────────────────────── */

describe("the capability catalogue", () => {
  it("maps every group to a module that exists", () => {
    for (const group of CAPABILITY_GROUPS) {
      expect(moduleByCode(group.moduleCode), `${group.code} → ${group.moduleCode}`).toBeDefined();
    }
  });

  it("gives every capability an id, a name and a description", () => {
    for (const group of CAPABILITY_GROUPS) {
      for (const capability of group.capabilities) {
        expect(capability.id, group.code).toMatch(/^[A-Z]+-\d+$/);
        expect(capability.name.length, capability.id).toBeGreaterThan(3);
        expect(capability.description.length, capability.id).toBeGreaterThan(20);
      }
    }
  });

  it("has no duplicate capability ids across the whole catalogue", () => {
    const ids = [...PLATFORM_STANDARD, ...CAPABILITY_GROUPS.flatMap((g) => g.capabilities)].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("counts what it says it counts", () => {
    const actual =
      PLATFORM_STANDARD.length + CAPABILITY_GROUPS.reduce((sum, g) => sum + g.capabilities.length, 0);
    expect(CAPABILITY_COUNT).toBe(actual);
  });

  it("resolves the two groups that share a module", () => {
    // `EXP` folded into Reports during the Phase 3 reconciliation, so RPT has
    // two groups. If that ever became one, the menu card would silently stop
    // listing the export capabilities.
    expect(groupsForModule("MOD-RPT").length).toBeGreaterThan(1);
  });

  it("only offers toggles for modules the guard actually gates", () => {
    for (const group of gatedGroups()) {
      expect(moduleByCode(group.moduleCode)?.enforcement, group.code).toBe("gated");
    }
  });
});
