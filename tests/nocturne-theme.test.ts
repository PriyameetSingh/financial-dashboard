import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLATFORM_ROLE_DEFAULTS,
  BRAND_SWATCHES,
  THEME_ROLES,
  checkRoleContrast,
  contrastRatio,
  formatContrastRatio,
  isDensity,
  isHexColor,
  themeGround,
  isThemeName,
  parseHexColor,
  relativeLuminance,
  sanitizeRoleValues,
  themeOverrideCss,
} from "@/components/nocturne/theme";

/**
 * The runtime-swappable token layer.
 *
 * Two things are under test here and they are of very different weight.
 *
 * The contrast maths is a correctness check: it decides, at Gate D, whether a
 * tenant's chosen brand colour is legible, so it is measured against the values
 * WCAG's own worked examples give.
 *
 * `sanitizeRoleValues` and `themeOverrideCss` are a SECURITY boundary. From
 * Gate D these values originate in tenant-admin input and end up inside a
 * `<style>` element. The tests below are written as attacks rather than as
 * examples, because "it renders the right CSS for good input" is not the
 * property that matters.
 */

describe("colour parsing", () => {
  it("accepts both hex forms and expands the short one", () => {
    expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("#9184d9")).toEqual({ r: 145, g: 132, b: 217 });
  });

  it("rejects everything that is not a plain hex colour", () => {
    for (const value of [
      "red",
      "rgb(0,0,0)",
      "#ffff",
      "#12345",
      "#gggggg",
      "var(--color-accent)",
      "",
      "#",
    ]) {
      expect(parseHexColor(value), value).toBeNull();
      expect(isHexColor(value), value).toBe(false);
    }
  });

  it("computes relative luminance at the ends of the range", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
  });
});

describe("contrast ratio", () => {
  it("matches the WCAG reference extremes", () => {
    // Black on white is the definition of 21:1; identical colours are 1:1.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("is symmetric — order of arguments cannot change the verdict", () => {
    const a = contrastRatio("#9184d9", "#161826");
    const b = contrastRatio("#161826", "#9184d9");
    expect(a).toBeCloseTo(b as number, 10);
  });

  it("returns null rather than a plausible number for unmeasurable input", () => {
    expect(contrastRatio("chartreuse", "#161826")).toBeNull();
    expect(contrastRatio("#161826", "color-mix(in srgb, red, blue)")).toBeNull();
  });

  it("measures the platform's own pairs above their required floors", () => {
    // The accent carries chrome and large text, so its floor is 3:1.
    expect(contrastRatio("#9184d9", "#161826")!).toBeGreaterThanOrEqual(3);
    // Body text against both grounds must clear 4.5:1.
    expect(contrastRatio("#e9e9ed", "#161826")!).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#232532", "#eef0f8")!).toBeGreaterThanOrEqual(4.5);
    // The light theme's accent, against the light ground.
    expect(contrastRatio("#5d5294", "#eef0f8")!).toBeGreaterThanOrEqual(3);
  });

  it("truncates rather than rounds up when formatting", () => {
    // 4.499 must never be reported as "4.50:1" beside a 4.5 threshold.
    expect(formatContrastRatio(4.499)).toBe("4.49:1");
    expect(formatContrastRatio(21)).toBe("21.00:1");
  });
});

describe("role contrast verdicts", () => {
  it("applies each role's own floor, not one global number", () => {
    // 3.4:1 — enough for the accent, not enough for text.
    const dim = "#6f66a8";
    expect(checkRoleContrast("--color-accent", dim, "#161826").passes).toBe(true);
    expect(checkRoleContrast("--color-text", dim, "#161826").passes).toBe(false);
  });

  it("fails closed when the value cannot be measured", () => {
    const verdict = checkRoleContrast("--color-accent", "rebeccapurple", "#161826");
    expect(verdict.ratio).toBeNull();
    expect(verdict.passes).toBe(false);
  });
});

describe("sanitizeRoleValues", () => {
  it("keeps known roles with valid hex values", () => {
    expect(sanitizeRoleValues({ "--color-accent": "#3f847c" })).toEqual({
      "--color-accent": "#3f847c",
    });
  });

  it("drops properties that are not swappable roles", () => {
    const dirty = {
      "--color-accent": "#3f847c",
      // Structural, deliberately not tenant-configurable.
      "--radius-md": "#000000",
      "--font-heading-weight": "#000000",
    } as Record<string, string>;
    expect(sanitizeRoleValues(dirty)).toEqual({ "--color-accent": "#3f847c" });
  });

  it("drops any value that is not a plain hex colour", () => {
    const dirty = {
      "--color-accent": "red; } body { display: none } .x {",
      "--color-bg": "url(https://example.test/x.png)",
      "--color-text": "var(--color-accent)",
      "--color-surface": "#123456",
    } as Record<string, string>;
    // Only the one real colour survives; nothing is escaped or repaired.
    expect(sanitizeRoleValues(dirty)).toEqual({ "--color-surface": "#123456" });
  });

  it("survives a prototype-pollution shaped payload", () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "--color-accent": "#3f847c"}');
    expect(sanitizeRoleValues(parsed)).toEqual({ "--color-accent": "#3f847c" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("themeOverrideCss", () => {
  it("emits a block per theme, scoped to the subtree", () => {
    const css = themeOverrideCss("nabc123", {
      dark: { "--color-accent": "#5fa8a0" },
      light: { "--color-accent": "#2b5a54" },
    });
    expect(css).toContain('[data-noct-scope="nabc123"][data-theme="dark"]');
    expect(css).toContain('[data-noct-scope="nabc123"] [data-theme="light"]');
    expect(css).toContain("--color-accent:#5fa8a0;");
    expect(css).toContain("--color-accent:#2b5a54;");
  });

  it("emits nothing when nothing survives validation", () => {
    expect(themeOverrideCss("nabc123", {})).toBe("");
    expect(themeOverrideCss("nabc123", { dark: { "--color-accent": "javascript:alert(1)" } })).toBe("");
    expect(themeOverrideCss("nabc123", undefined)).toBe("");
  });

  it("refuses a scope id that is not a generated identifier", () => {
    // The id is generated, never supplied. This is the guard against a future
    // caller wiring one through from a request.
    for (const bad of ['a"] { color: red } [x="', "a b", "a}", "<script>"]) {
      expect(themeOverrideCss(bad, { dark: { "--color-accent": "#3f847c" } }), bad).toBe("");
    }
  });

  it("cannot produce a string that closes its own style element", () => {
    const css = themeOverrideCss("nabc123", {
      dark: { "--color-accent": "#3f847c" },
      light: { "--color-bg": "#eef0f8" },
    });
    expect(css).not.toContain("<");
    expect(css).not.toContain("</style");
    // Braces are balanced: every block the generator opens, it closes.
    expect(css.split("{").length).toBe(css.split("}").length);
  });
});

describe("the role registry", () => {
  it("gives every role a floor that is one of the two WCAG thresholds", () => {
    for (const role of THEME_ROLES) {
      expect([3, 4.5], role.token).toContain(role.minRatio);
    }
  });

  it("points every role at a role that is itself in the registry", () => {
    const tokens = new Set(THEME_ROLES.map((r) => r.token));
    for (const role of THEME_ROLES) {
      expect(tokens.has(role.contrastAgainst), `${role.token} → ${role.contrastAgainst}`).toBe(true);
    }
  });
});

describe("theme and density guards", () => {
  it("accepts only the two known values and rejects everything else", () => {
    expect(isThemeName("dark")).toBe(true);
    expect(isThemeName("light")).toBe(true);
    expect(isThemeName("Dark")).toBe(false);
    expect(isThemeName(undefined)).toBe(false);

    expect(isDensity("comfortable")).toBe(true);
    expect(isDensity("compact")).toBe(true);
    expect(isDensity("cosy")).toBe(false);
    expect(isDensity(null)).toBe(false);
  });
});

describe("the platform's role defaults match the stylesheets", () => {
  const dir = join(process.cwd(), "components", "nocturne");
  const nocturne = readFileSync(join(dir, "nocturne.css"), "utf8");
  const tokens = readFileSync(join(dir, "tokens.css"), "utf8");
  const primitives = readFileSync(join(dir, "primitives.css"), "utf8");

  /**
   * The value `token` ends up with, across EVERY rule whose selector list
   * contains `selector` exactly.
   *
   * Scanning all of them rather than the first matters: the token layer has
   * several `.noct` rules and several `[data-theme="light"]` rules — the AI
   * accent, the status pair, the theme itself — and a lookup that stopped at the
   * first would report whichever happened to be written highest in the file.
   * Later declarations win in CSS, so the last match is the answer.
   *
   * The selector must match a whole entry in the list, so `.noct` does not also
   * match `.noct .btn`.
   */
  function declared(source: string, selector: string, token: string): string | null {
    // Comments first. A rule's "prelude" is everything since the previous `}`,
    // which for the first rule in a file is its entire header comment — and
    // these files have long ones.
    const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
    let found: string | null = null;
    for (const [, prelude, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = prelude.split(",").map((part) => part.trim());
      if (!selectors.includes(selector)) continue;
      const match = body.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
      if (match) found = match[1].trim();
    }
    return found;
  }

  it("duplicates the dark values exactly", () => {
    // The TypeScript copy exists only because Node cannot read a custom
    // property. It has no way to notice when the CSS moves, so this notices.
    for (const [token, value] of Object.entries(PLATFORM_ROLE_DEFAULTS.dark)) {
      const source = token.startsWith("--dv-") ? tokens : nocturne;
      const inCss = declared(source, ".noct", token);
      expect(inCss, `${token} in ${token.startsWith("--dv-") ? "tokens" : "nocturne"}.css`).toBe(value);
    }
  });

  it("duplicates the light values exactly", () => {
    for (const [token, value] of Object.entries(PLATFORM_ROLE_DEFAULTS.light)) {
      if (token === "--dv-cat-1") continue; // the data-viz series does not change per theme
      const inCss = declared(tokens, '.noct[data-theme="light"]', token);
      expect(inCss, `${token} in tokens.css light block`).toBe(value);
    }
  });

  /**
   * Every token that takes a light-theme value must also state a dark one.
   *
   * This is not symmetry for its own sake. A custom property is resolved where
   * it is DECLARED: a token declared once on `.noct` and again under
   * `[data-theme="light"]` has no dark declaration to find, so a dark island
   * nested inside a light page inherits the light literal and paints it on a
   * dark surface. The sidebar is exactly that island, and this is exactly how
   * the accessibility audit found `--ax-muted` at 2.21:1 on every nav label —
   * after the dark theme had been clean.
   *
   * The check reads the stylesheets rather than a list, so a token added
   * tomorrow is covered without anyone remembering to add it here.
   */
  it("gives every light-theme token a dark peer", () => {
    const LIGHT = '.noct[data-theme="light"]';
    const DARK = '.noct[data-theme="dark"]';

    function tokensUnder(source: string, selector: string): Set<string> {
      const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
      const names = new Set<string>();
      for (const [, prelude, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!prelude.split(",").map((part) => part.trim()).includes(selector)) continue;
        for (const [, name] of body.matchAll(/(--[a-z0-9-]+)\s*:/g)) names.add(name);
      }
      return names;
    }

    for (const [file, source] of [["tokens.css", tokens], ["primitives.css", primitives]] as const) {
      const light = tokensUnder(source, LIGHT);
      const dark = tokensUnder(source, DARK);
      const orphans = [...light].filter((name) => !dark.has(name));
      expect(
        orphans,
        `${file}: light-only tokens — a nested dark island would inherit the light value`,
      ).toEqual([]);
    }
  });

  it("names a ground for each theme", () => {
    expect(themeGround("dark")).toBe(PLATFORM_ROLE_DEFAULTS.dark["--color-bg"]);
    expect(themeGround("light")).toBe(PLATFORM_ROLE_DEFAULTS.light["--color-bg"]);
  });

  it("covers every swappable role in both themes", () => {
    for (const role of THEME_ROLES) {
      expect(PLATFORM_ROLE_DEFAULTS.dark[role.token], `dark ${role.token}`).toBeDefined();
      expect(PLATFORM_ROLE_DEFAULTS.light[role.token], `light ${role.token}`).toBeDefined();
    }
  });

  it("offers only legible, well-formed brand swatches", () => {
    for (const swatch of BRAND_SWATCHES) {
      expect(isHexColor(swatch.value), swatch.name).toBe(true);
      // Offered as an accent, so the accent's own floor applies.
      expect(contrastRatio(swatch.value, themeGround("dark"))!, swatch.name).toBeGreaterThanOrEqual(3);
    }
  });
});
