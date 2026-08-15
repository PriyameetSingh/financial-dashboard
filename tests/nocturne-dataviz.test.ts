import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, parseHexColor, type Rgb } from "@/components/nocturne/theme";

/**
 * The data-viz palette has to survive two things the eye of whoever picked it
 * cannot check: the other theme, and colour vision deficiency.
 *
 * Contrast against the ground is the easy half, and it is the half that had been
 * done — the palette shipped with a comment saying it was "checked against the
 * dark ground for deutan and protan vision", and every swatch did clear the
 * ground comfortably. What had never been measured was the swatches against EACH
 * OTHER under simulated dichromacy, which is the thing that actually decides
 * whether two series on one chart are telling apart. River teal and graphite sat
 * ΔE 3.8 apart under deuteranopia: the same colour, for roughly one man in
 * twelve, on any chart that used both.
 *
 * So this re-derives the numbers rather than trusting the comment. It reads the
 * declarations out of `tokens.css`, simulates protanopia and deuteranopia
 * (Viénot–Brettel–Mollon 1999), and measures CIE76 ΔE for every pair in every
 * simulation. A palette edit that reintroduces a collision fails here.
 *
 * The maths is duplicated in this file rather than shipped in `theme.ts` on
 * purpose: nothing in the application needs to simulate dichromacy at runtime,
 * and a checker that imports the thing it checks tends to inherit its bugs.
 */

const CSS = readFileSync(join(process.cwd(), "components", "nocturne", "tokens.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Every value `token` takes under a rule whose selector list contains `selector`. */
function declared(selector: string, token: string): string | null {
  let found: string | null = null;
  for (const [, prelude, body] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!prelude.split(",").map((s) => s.trim()).includes(selector)) continue;
    const match = body.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
    if (match) found = match[1].trim();
  }
  return found;
}

const GROUNDS = {
  dark: { selector: ".noct", bg: "#161826", surface: "#232532" },
  light: { selector: '.noct[data-theme="light"]', bg: "#eef0f8", surface: "#f8f9fd" },
} as const;

type ThemeKey = keyof typeof GROUNDS;

const CATEGORICAL = [1, 2, 3, 4, 5, 6].map((n) => `--dv-cat-${n}`);
const SEQUENTIAL = [1, 2, 3, 4, 5].map((n) => `--dv-seq-${n}`);
const DIVERGING = ["--dv-div-neg", "--dv-div-mid", "--dv-div-pos"];

function swatches(theme: ThemeKey, tokens: string[]): { token: string; hex: string; rgb: Rgb }[] {
  return tokens.map((token) => {
    const hex = declared(GROUNDS[theme].selector, token);
    expect(hex, `${token} is not declared for the ${theme} theme`).toBeTruthy();
    const rgb = parseHexColor(hex!);
    expect(rgb, `${token} is not a hex literal in the ${theme} theme: ${hex}`).not.toBeNull();
    return { token, hex: hex!, rgb: rgb! };
  });
}

/* ── dichromacy simulation ───────────────────────────────────────────────── */

const RGB_TO_LMS = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
];
const LMS_TO_RGB = [
  [0.080944, -0.130504, 0.116721],
  [-0.0102485, 0.0540194, -0.113615],
  [-0.000365294, -0.00412163, 0.693513],
];
/** Collapse the missing cone onto the plane the remaining two can still see. */
const PROTAN = [
  [0, 2.02344, -2.52581],
  [0, 1, 0],
  [0, 0, 1],
];
const DEUTAN = [
  [1, 0, 0],
  [0.494207, 0, 1.24827],
  [0, 0, 1],
];

type Vision = "normal" | "protan" | "deutan";

function apply(matrix: number[][], v: number[]): number[] {
  return matrix.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

function simulate(rgb: Rgb, vision: Vision): number[] {
  const v = [rgb.r, rgb.g, rgb.b];
  if (vision === "normal") return v;
  const lms = apply(RGB_TO_LMS, v);
  const collapsed = apply(vision === "protan" ? PROTAN : DEUTAN, lms);
  return apply(LMS_TO_RGB, collapsed).map((c) => Math.max(0, Math.min(255, c)));
}

/* ── CIE76 ΔE, via CIELAB ────────────────────────────────────────────────── */

function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function toLab([r, g, b]: number[]): [number, number, number] {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const bend = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = bend((0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047);
  const y = bend(0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
  const z = bend((0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE(a: number[], b: number[]): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * The worst-separated pair in a set, across normal and both dichromacies.
 *
 * ΔE 16 is the floor these palettes are tuned to. For scale: 2.3 is the classic
 * "just noticeable difference" between two patches held side by side; a chart
 * asks a reader to tell two swatches apart across a legend and a page, so the
 * floor is set well above it.
 */
function worstSeparation(set: { token: string; rgb: Rgb }[]) {
  let worst = { delta: Infinity, pair: "", vision: "normal" as Vision };
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      for (const vision of ["normal", "protan", "deutan"] as Vision[]) {
        const delta = deltaE(simulate(set[i].rgb, vision), simulate(set[j].rgb, vision));
        if (delta < worst.delta) {
          worst = { delta, pair: `${set[i].token} / ${set[j].token}`, vision };
        }
      }
    }
  }
  return worst;
}

const SEPARATION_FLOOR = 16;
/** WCAG 1.4.11: a chart fill is a non-text graphical object. */
const FILL_CONTRAST_FLOOR = 3;

describe("the data-viz palette", () => {
  for (const theme of Object.keys(GROUNDS) as ThemeKey[]) {
    const { bg, surface } = GROUNDS[theme];

    it(`declares every swatch for the ${theme} theme`, () => {
      // Declaration is the whole test: a token missing from one theme resolves
      // to the other theme's literal, which is how the palette was dark-only
      // without anyone noticing.
      for (const token of [...CATEGORICAL, ...SEQUENTIAL, ...DIVERGING]) {
        expect(declared(GROUNDS[theme].selector, token), `${token} missing in ${theme}`).toBeTruthy();
      }
    });

    it(`keeps ${theme} categorical fills legible on the page and on a card`, () => {
      for (const { token, hex, rgb } of swatches(theme, CATEGORICAL)) {
        for (const [where, ground] of [["page", bg], ["card", surface]] as const) {
          const ratio = contrastRatio(hex, ground)!;
          expect(ratio, `${token} (${hex}) on the ${theme} ${where}`).toBeGreaterThanOrEqual(
            FILL_CONTRAST_FLOOR,
          );
        }
        expect(rgb).not.toBeNull();
      }
    });

    it(`keeps ${theme} categorical series apart under protanopia and deuteranopia`, () => {
      const worst = worstSeparation(swatches(theme, CATEGORICAL));
      expect(
        worst.delta,
        `${worst.pair} are only ΔE ${worst.delta.toFixed(1)} apart under ${worst.vision} vision`,
      ).toBeGreaterThanOrEqual(SEPARATION_FLOOR);
    });

    it(`keeps the ${theme} diverging ends apart under protanopia and deuteranopia`, () => {
      // The scale a deficit/surplus bar reads from. Both ends AND the neutral
      // midpoint, because a two-way check would miss a mid that has collapsed
      // into one of them — which is what a teal does under deuteranopia.
      const worst = worstSeparation(swatches(theme, DIVERGING));
      expect(
        worst.delta,
        `${worst.pair} are only ΔE ${worst.delta.toFixed(1)} apart under ${worst.vision} vision`,
      ).toBeGreaterThanOrEqual(SEPARATION_FLOOR);
      for (const { token, hex } of swatches(theme, DIVERGING)) {
        expect(contrastRatio(hex, bg)!, `${token} on the ${theme} page`).toBeGreaterThanOrEqual(
          FILL_CONTRAST_FLOOR,
        );
      }
    });

    it(`orders the ${theme} sequential ramp by lightness alone`, () => {
      // The property that makes a sequential scale readable without colour
      // vision at all: low → high must be a monotone lightness ramp, so the
      // order survives a greyscale print as well as it survives dichromacy.
      const levels = swatches(theme, SEQUENTIAL).map(({ rgb }) => toLab([rgb.r, rgb.g, rgb.b])[0]);
      const direction = Math.sign(levels[1] - levels[0]);
      expect(direction, "the ramp does not move").not.toBe(0);
      for (let i = 1; i < levels.length; i++) {
        const step = (levels[i] - levels[i - 1]) * direction;
        expect(step, `step ${i} of the ${theme} ramp reverses or stalls`).toBeGreaterThan(0);
        expect(step, `step ${i} of the ${theme} ramp is too small to read`).toBeGreaterThanOrEqual(8);
      }
    });
  }

  it("pins the first categorical series to the accent in both themes", () => {
    // Documented behaviour of `--dv-cat-1`, and the reason a single-series chart
    // comes out in the tenant's own colour rather than a stylesheet's.
    expect(declared(".noct", "--dv-cat-1")).toBe(declared(".noct", "--color-accent-500") ?? "#9184d9");
    expect(declared('.noct[data-theme="light"]', "--dv-cat-1")).toBe("#5d5294");
  });

  it("simulates dichromacy rather than assuming it", () => {
    // Guards the checker itself. Under deuteranopia a mid red and a mid green
    // converge; if this stops holding, the simulation has been broken and every
    // assertion above is passing vacuously.
    const red = parseHexColor("#c03030")!;
    const green = parseHexColor("#30a030")!;
    const normal = deltaE(simulate(red, "normal"), simulate(green, "normal"));
    const deutan = deltaE(simulate(red, "deutan"), simulate(green, "deutan"));
    expect(normal).toBeGreaterThan(40);
    expect(deutan).toBeLessThan(normal / 2);
  });
});
