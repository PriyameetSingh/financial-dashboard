/**
 * The runtime-swappable half of the token layer.
 *
 * `nocturne.css` and `tokens.css` carry the platform's own values. Everything a
 * tenant is allowed to change at runtime is listed here ONCE, as `THEME_ROLES`,
 * and flows from there to three places that must not disagree:
 *
 *   - `NocturneRoot`, which emits the override block,
 *   - the design-system configurator (Gate D), which offers the roles to edit,
 *   - the contrast validator, which decides whether a chosen value is legible.
 *
 * A role that is not in this list cannot be swapped at runtime. That is the
 * point: the design system's structural decisions — the outlined primary
 * button, the 0.70× spacing scale, the fading rules, the 2px focus ring — are
 * not tenant-configurable, because a tenant configuring those would be
 * redesigning the product rather than branding it.
 *
 * NOTHING in this module reads a database, a session or a tenant. It takes
 * values in and produces CSS. The tenant plumbing lives at the call site.
 */

/** The CSS custom properties a tenant theme may override. */
export const THEME_ROLES = [
  {
    token: "--color-accent",
    label: "Accent",
    /** Where the value is read against, for the contrast check. */
    contrastAgainst: "--color-bg",
    /** 3:1 — the accent carries chrome, lines, marks and large text, not body copy. */
    minRatio: 3,
    description: "Lines, marks, focus ring and the outlined primary action.",
  },
  {
    token: "--color-bg",
    label: "Page ground",
    contrastAgainst: "--color-text",
    minRatio: 4.5,
    description: "The page ground everything else is measured against.",
  },
  {
    token: "--color-surface",
    label: "Surface",
    contrastAgainst: "--color-text",
    minRatio: 4.5,
    description: "Cards, panels and dialogs that sit above the ground.",
  },
  {
    token: "--color-text",
    label: "Text",
    contrastAgainst: "--color-bg",
    minRatio: 4.5,
    description: "Primary text colour.",
  },
  {
    token: "--dv-cat-1",
    label: "Chart series 1",
    contrastAgainst: "--color-bg",
    minRatio: 3,
    description: "The first categorical series. Follows the accent by default.",
  },
] as const;

export type ThemeRole = (typeof THEME_ROLES)[number]["token"];

const ROLE_TOKENS: ReadonlySet<string> = new Set(THEME_ROLES.map((r) => r.token));

/** Role values for one theme. Partial: a tenant may override the accent alone. */
export type RoleValues = Partial<Record<ThemeRole, string>>;

/**
 * A tenant's theme. `dark` and `light` are peers — a tenant that only ships one
 * still renders correctly in the other, on the platform defaults.
 */
export type ThemeOverrides = {
  dark?: RoleValues;
  light?: RoleValues;
};

export type ThemeName = "dark" | "light";
export type Density = "comfortable" | "compact";

export const THEME_NAMES: readonly ThemeName[] = ["dark", "light"];
export const DENSITIES: readonly Density[] = ["comfortable", "compact"];

export function isThemeName(value: unknown): value is ThemeName {
  return value === "dark" || value === "light";
}

export function isDensity(value: unknown): value is Density {
  return value === "comfortable" || value === "compact";
}

/**
 * The platform's own value for every swappable role, per theme.
 *
 * One source, because there were four. The design-system configurator restated
 * the palette to show "what you get if you change nothing", the onboarding
 * branding step restated it as its swatch list, and the draft's default brand
 * colour restated the accent — all as hex literals, in three files that had no
 * reason to agree with `nocturne.css` and no way to notice when they stopped.
 * `scripts/check-no-hardcoded-color.mjs` found all of it on its first run.
 *
 * These MUST stay equal to the values in `nocturne.css` and `tokens.css`;
 * `tests/nocturne-theme.test.ts` asserts it. They are duplicated in TypeScript
 * at all only because CSS custom properties cannot be read from Node, and the
 * contrast maths has to run on the server and in tests.
 */
export const PLATFORM_ROLE_DEFAULTS: Record<ThemeName, Record<ThemeRole, string>> = {
  dark: {
    "--color-accent": "#9184d9",
    "--color-bg": "#161826",
    "--color-surface": "#232532",
    "--color-text": "#e9e9ed",
    "--dv-cat-1": "#9184d9",
  },
  light: {
    "--color-accent": "#5d5294",
    "--color-bg": "#eef0f8",
    "--color-surface": "#f8f9fd",
    "--color-text": "#232532",
    "--dv-cat-1": "#9184d9",
  },
};

/** The ground a role is read against, per theme. Used by the contrast checks. */
export function themeGround(theme: ThemeName): string {
  return PLATFORM_ROLE_DEFAULTS[theme]["--color-bg"];
}

/**
 * Suggested brand colours, offered wherever a tenant picks one.
 *
 * The data-viz categorical palette, which is where they came from: six hues
 * already checked against the dark ground and against each other for deutan and
 * protan vision. Offering a tenant a palette that is known to work beats
 * offering them a colour wheel and hoping.
 */
export const BRAND_SWATCHES: readonly { name: string; value: string }[] = [
  { name: "Nocturne blurple", value: "#9184d9" },
  { name: "River teal", value: "#5fa8a0" },
  { name: "Laterite", value: "#c2925c" },
  { name: "Slate blue", value: "#7f9cc9" },
  { name: "Rosewood", value: "#c07f92" },
  { name: "Graphite", value: "#9397ab" },
];

/* ── colour parsing and contrast ──────────────────────────────────────────── */

export type Rgb = { r: number; g: number; b: number };

/** `#abc` and `#aabbcc` only. Anything else is a rejection, not a guess. */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

export function parseHexColor(value: string): Rgb | null {
  if (!HEX_RE.test(value)) return null;
  let hex = value.slice(1);
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** WCAG 2.1 relative luminance (§ "relative luminance"). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG 2.1 contrast ratio, 1..21. Returns null if either colour is not a hex
 * this module understands — a caller must decide what an unmeasurable pair
 * means, rather than being handed a plausible number.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return null;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded the way the WCAG reporting convention does, to two decimals. */
export function formatContrastRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

export type ContrastVerdict = {
  ratio: number | null;
  required: number;
  passes: boolean;
};

/** Checks one proposed role value against the colour it will be read on. */
export function checkRoleContrast(
  role: ThemeRole,
  value: string,
  against: string,
): ContrastVerdict {
  const spec = THEME_ROLES.find((r) => r.token === role);
  const required = spec?.minRatio ?? 4.5;
  const ratio = contrastRatio(value, against);
  return { ratio, required, passes: ratio !== null && ratio >= required };
}

/* ── CSS generation ───────────────────────────────────────────────────────── */

/**
 * Keeps only entries whose key is a known role AND whose value is a plain hex
 * colour.
 *
 * This is the injection boundary. These values reach a `<style>` element, and
 * from Gate D onward they originate in tenant-admin input, so the rule is
 * allowlist-and-validate rather than escape: a value that is not `#rgb` or
 * `#rrggbb` is dropped, not sanitised. There is no syntax for a hex colour that
 * can also close a style block.
 */
export function sanitizeRoleValues(values: RoleValues | undefined): RoleValues {
  if (!values) return {};
  const clean: RoleValues = {};
  for (const [token, value] of Object.entries(values)) {
    if (!ROLE_TOKENS.has(token)) continue;
    if (typeof value !== "string" || !isHexColor(value)) continue;
    clean[token as ThemeRole] = value;
  }
  return clean;
}

function declarations(values: RoleValues): string {
  return Object.entries(values)
    .map(([token, value]) => `${token}:${value};`)
    .join("");
}

/**
 * The scoped override block for one Nocturne subtree.
 *
 * Selectors are written against a `data-noct-scope` attribute rather than a
 * class so that a page may host several independently themed subtrees — which
 * is exactly what the gallery's side-by-side themes and the Gate D live preview
 * both need.
 *
 * Returns an empty string when nothing survives validation, so the caller can
 * skip rendering the element entirely.
 */
export function themeOverrideCss(scopeId: string, overrides: ThemeOverrides | undefined): string {
  if (!overrides) return "";
  // The scope id is generated, never supplied; the assertion is a guard against
  // a future caller passing something through from a request.
  if (!/^[A-Za-z0-9_-]+$/.test(scopeId)) return "";

  const dark = sanitizeRoleValues(overrides.dark);
  const light = sanitizeRoleValues(overrides.light);
  const blocks: string[] = [];
  const sel = `[data-noct-scope="${scopeId}"]`;

  if (Object.keys(dark).length > 0) {
    // Matches the subtree root when it is itself dark, and any dark island
    // inside it — the same doubling `tokens.css` uses, for the same reason.
    blocks.push(`${sel}[data-theme="dark"],${sel} [data-theme="dark"]{${declarations(dark)}}`);
  }
  if (Object.keys(light).length > 0) {
    blocks.push(`${sel}[data-theme="light"],${sel} [data-theme="light"]{${declarations(light)}}`);
  }
  return blocks.join("");
}
