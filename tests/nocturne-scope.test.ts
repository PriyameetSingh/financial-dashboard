import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The containment guarantee.
 *
 * This phase is additive: the signed-off screens must render byte-identically
 * after it. The design system's own stylesheet cannot honour that, because it
 * styles `body`, `h1`-`h6`, `a`, `p` and `:root` — apply it globally and every
 * existing screen changes. The port therefore scopes every rule under `.noct`,
 * the class `NocturneRoot` owns.
 *
 * "We were careful when we ported it" is not a guarantee; a single unscoped rule
 * added later would silently restyle the product, and the golden's other legs
 * would not notice, because a colour change is not a test failure anywhere else.
 * So the scoping is asserted mechanically, here.
 *
 * The parser is deliberately blunt — it reads selectors, not CSS semantics. A
 * blunt check that fails on something legal is a two-line fix; a clever one that
 * passes on a leak is the thing being guarded against.
 */

const CSS_DIR = join(process.cwd(), "components", "nocturne");
const SCOPED_FILES = ["nocturne.css", "tokens.css", "primitives.css"];

/**
 * A floor per file, well under the real count but far above zero. Its only job
 * is to make the scoping assertions fail loudly if the parser ever stops
 * finding selectors — an empty list satisfies "every selector is scoped".
 */
const MIN_SELECTORS: Record<string, number> = {
  "nocturne.css": 40,
  "tokens.css": 8,
  "primitives.css": 25,
};

/** Comments only. Kept separate because some checks need the strings intact. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Strips comments, then string contents, which can contain braces. */
function stripNoise(css: string): string {
  return stripComments(css)
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/**
 * Every selector that introduces a declaration block, with at-rule preludes
 * (`@media`, `@keyframes` and their bodies' percentage selectors) excluded —
 * those cannot match an element by themselves.
 */
function topLevelSelectors(css: string): string[] {
  const text = stripNoise(css);
  const selectors: string[] = [];
  let depth = 0;
  let buffer = "";
  let inKeyframes = false;
  let keyframesDepth = 0;

  for (const char of text) {
    if (char === "{") {
      const prelude = buffer.trim();
      buffer = "";
      depth += 1;
      if (/^@keyframes\b/.test(prelude)) {
        inKeyframes = true;
        keyframesDepth = depth;
      } else if (prelude.startsWith("@")) {
        // A media/supports prelude wraps rules; its own body is checked as it
        // is read, so nothing to record here.
      } else if (!(inKeyframes && depth > keyframesDepth)) {
        if (prelude) selectors.push(prelude);
      }
      continue;
    }
    if (char === "}") {
      if (inKeyframes && depth === keyframesDepth) inKeyframes = false;
      depth -= 1;
      buffer = "";
      continue;
    }
    buffer += char;
  }
  return selectors;
}

/** Splits a selector list on top-level commas. */
function selectorList(selector: string): string[] {
  return selector
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("the Nocturne layer is contained under .noct", () => {
  for (const file of SCOPED_FILES) {
    describe(file, () => {
      const css = readFileSync(join(CSS_DIR, file), "utf8");
      const selectors = topLevelSelectors(css).flatMap(selectorList);

      it("has rules to check at all — the guard must not pass vacuously", () => {
        expect(selectors.length).toBeGreaterThanOrEqual(MIN_SELECTORS[file]);
      });

      it("starts every single selector with .noct", () => {
        const escaped = selectors.filter((s) => !s.startsWith(".noct"));
        expect(escaped, `unscoped selectors in ${file}`).toEqual([]);
      });

      it("never targets a document-level element or :root", () => {
        // `.noct body` would be nonsense but harmless; a bare one would not be.
        const global = selectors.filter((s) => /^(:root|html|body|\*)\b/.test(s));
        expect(global, `document-level selectors in ${file}`).toEqual([]);
      });

      it("declares no custom property outside a .noct scope", () => {
        // A `--token: value` on :root would leak into the existing screens'
        // cascade even if no rule here painted anything.
        const declarations = stripNoise(css).split("}");
        const leaked = declarations
          .filter((block) => block.includes("--") && block.includes(":"))
          .map((block) => block.split("{")[0]?.trim() ?? "")
          .filter((prelude) => prelude && !prelude.startsWith("@") && !prelude.startsWith(".noct"));
        expect(leaked, `custom properties declared outside .noct in ${file}`).toEqual([]);
      });
    });
  }

  it("is imported by NocturneRoot and by nothing else", () => {
    // If any other module imported these stylesheets, Next would emit them on
    // that route too. Containment then rests on the selectors alone rather than
    // on the selectors AND the fact that the sheet is not on the page.
    const roots = ["app", "components", "lib"];
    const importers: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?|mjs)$/.test(entry.name)) continue;
        const source = readFileSync(full, "utf8");
        for (const sheet of SCOPED_FILES) {
          if (source.includes(`/${sheet}"`) || source.includes(`./${sheet}'`)) {
            importers.push(full);
          }
        }
      }
    }

    for (const root of roots) walk(join(process.cwd(), root));

    const unique = [...new Set(importers)].map((p) => p.replace(`${process.cwd()}/`, ""));
    expect(unique).toEqual(["components/nocturne/NocturneRoot.tsx"]);
  });
});

describe("the design system's load-bearing rules survived the port", () => {
  const nocturne = readFileSync(join(CSS_DIR, "nocturne.css"), "utf8");

  it("keeps the primary action an outline, never a fill", () => {
    // The rule sets `color` and `border-color` only. A `background` on the base
    // `.btn-primary` rule would make it a filled button, which is the single
    // clearest way to stop this looking like Nocturne.
    const rule = nocturne.match(/\.noct \.btn-primary \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("border-color: var(--color-accent)");
    expect(rule).not.toContain("background");
  });

  it("keeps the 2px accent focus ring", () => {
    expect(nocturne).toContain(":focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }");
  });

  it("keeps disabled controls at 45% opacity", () => {
    expect(nocturne).toContain("opacity: 0.45");
  });

  it("does not fetch a webfont at runtime", () => {
    // The export opens with a Google Fonts @import. Carrying it over would add
    // a render-blocking third-party request to every new surface.
    // Comments stripped first: this file's own header explains why the export's
    // `@import` was dropped, and the explanation must not trip the check.
    const code = stripComments(nocturne);
    expect(code).not.toContain("@import");
    expect(code).not.toContain("fonts.googleapis.com");
  });
});
