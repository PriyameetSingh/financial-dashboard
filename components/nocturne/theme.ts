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
