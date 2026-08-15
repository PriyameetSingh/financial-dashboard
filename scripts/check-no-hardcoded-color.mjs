#!/usr/bin/env node
/**
 * CI guard: reskinned files carry no hardcoded colour.
 *
 * WHY THIS EXISTS. Per-tenant theming works because every colour on a surface
 * resolves through a Nocturne role token, so swapping the token swaps the brand.
 * One `bg-blue-600` or one `#2563EB` breaks that quietly: the screen still looks
 * fine to whoever wrote it, and it stays the platform's colour on every tenant
 * that bought their own. White-label failures are invisible to the person who
 * causes them, which is exactly the shape of bug a lint is for.
 *
 * SCOPE GROWS PER TRANCHE. The reskin migrates screens in gated batches, so this
 * check is enforced only over the files that have been migrated — listed in
 * `RESKINNED` below with the gate that brought them in. A file outside that list
 * is not checked, and adding one is how a tranche declares itself done.
 *
 * Run `node scripts/check-no-hardcoded-color.mjs --all` for a survey of the WHOLE
 * repository — every file, in or out of scope, with its counts. That mode never
 * fails; it is the baseline that says how much work is left.
 *
 * WHAT COUNTS AS A COLOUR
 *   - a hex literal (`#2563EB`, `#fff`)
 *   - a Tailwind palette utility (`bg-blue-600`, `text-gray-500`, `border-red-200`)
 *   - a Tailwind arbitrary colour (`bg-[#2563EB]`, `text-[rgb(1,2,3)]`)
 *   - `rgb()` / `rgba()` / `hsl()` literals in CSS
 *
 * Comments are stripped before scanning. A hex in a comment is documentation —
 * usually the record of what a token replaced — and failing on it would push
 * people to delete the explanation rather than the colour.
 *
 * Run: node scripts/check-no-hardcoded-color.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
/**
 * `src/` is included deliberately: it holds a second UI kit
 * (`src/components/ui/*`) that the shell and most screens import. Leaving it out
 * would have made the lint report a clean tranche while a third of its rendered
 * pixels came from unchecked files.
 */
const SCAN_DIRS = ["app", "components", "lib", "src"];
const EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"]);

/**
 * Files the reskin has migrated, and which must therefore be token-only.
 *
 * Prefixes, matched against the repo-relative path. Each entry records the gate
 * that added it, so the list doubles as the reskin's progress ledger.
 */
const RESKINNED = [
  // Phase 4 — the net-new surfaces. Token-driven from the day they were written.
  { path: "app/platform/", gate: "S1" },
  { path: "app/onboarding/", gate: "S2" },
  { path: "app/admin/design-system/", gate: "S3" },
  { path: "app/admin/menu-card/", gate: "S3" },
  { path: "lib/platform/", gate: "S1" },
  { path: "lib/onboarding/", gate: "S2" },
  { path: "lib/menu-card/", gate: "S3" },
  // The gallery is the design system's own specimen page: it names tokens, and
  // its two-theme comparison shows real values on purpose.
  { path: "app/design-system/", gate: "S0" },

  // ── Reskin Gate A — the app shell, and the unauthenticated pages ──────────
  { path: "components/AppShell.tsx", gate: "A" },
  { path: "components/Sidebar.tsx", gate: "A" },
  { path: "components/ThemeProvider.tsx", gate: "A" },
  { path: "components/FontScaleProvider.tsx", gate: "A" },
  { path: "components/TextSizeToolbarControl.tsx", gate: "A" },
  { path: "components/LogoutButton.tsx", gate: "A" },
  { path: "components/AuthSessionProvider.tsx", gate: "A" },
  { path: "components/TenantConfigProvider.tsx", gate: "A" },
  { path: "components/GovLoginBranding.tsx", gate: "A" },
  { path: "components/LoginGrid.tsx", gate: "A" },
  { path: "app/layout.tsx", gate: "A" },
  { path: "app/login/", gate: "A" },
  { path: "app/auth/", gate: "A" },
  { path: "src/lib/myTasksPendingBadges.ts", gate: "A" },

  // ── Reskin Gate B — the Command Centre ────────────────────────────────────
  { path: "components/CommandCentre.tsx", gate: "B" },
  { path: "app/dashboard/", gate: "B" },
  { path: "app/command-centre/", gate: "B" },
];

/**
 * Exceptions, each with the reason it is one. An entry here should be arguable
 * in a sentence; if it takes a paragraph, the colour probably belongs in a token.
 */
const ALLOW = [
  {
    path: "components/nocturne/nocturne.css",
    reason: "the token sheet itself — this is where raw values are DEFINED",
  },
  {
    path: "components/nocturne/tokens.css",
    reason: "the platform token layer, including the contrast corrections",
  },
  {
    path: "components/nocturne/primitives.css",
    reason:
      "extension tokens and the two literals documented in place: the section band's fixed foreground, and the ::backdrop tint that cannot inherit a custom property",
  },
  {
    path: "components/nocturne/theme.ts",
    reason: "parses and validates hex colours; the test fixtures are hex by nature",
  },
  {
    path: "components/NationalColourBand.tsx",
    reason:
      "the Indian flag's saffron and green, as the Flag Code specifies them — a statutory element, not a palette choice, and not the tenant's to theme",
  },
  {
    path: "app/design-system/Gallery.tsx",
    reason: "the specimen page: an example tenant brand shown as data, to prove role values swap",
  },
];

const args = process.argv.slice(2);
const surveyAll = args.includes("--all");

/* ── detection ───────────────────────────────────────────────────────────── */

const TAILWIND_PALETTES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
  "white", "black",
].join("|");

const TAILWIND_PREFIXES = [
  "bg", "text", "border", "ring", "from", "to", "via", "fill", "stroke",
  "divide", "outline", "shadow", "decoration", "accent", "caret", "placeholder",
].join("|");

const PATTERNS = [
  {
    id: "hex",
    re: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g,
  },
  {
    id: "tailwind-palette",
    re: new RegExp(String.raw`\b(?:${TAILWIND_PREFIXES})-(?:${TAILWIND_PALETTES})(?:-\d{2,3})?\b`, "g"),
  },
  {
    id: "tailwind-arbitrary-color",
    re: new RegExp(String.raw`\b(?:${TAILWIND_PREFIXES})-\[(?:#|rgba?\(|hsla?\()[^\]]*\]`, "g"),
  },
  {
    id: "css-color-function",
    re: /\b(?:rgba?|hsla?)\(\s*\d/g,
  },
];

/**
 * Strips comments so documentation does not trip the check.
 *
 * Deliberately blunt: it also blanks the contents of string literals that happen
 * to look like comments, which costs nothing here — a colour hidden in such a
 * string would be a very strange way to write CSS.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function findings(source) {
  const text = stripComments(source);
  const lines = text.split("\n");
  const found = [];
  for (const [index, line] of lines.entries()) {
    for (const { id, re } of PATTERNS) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        found.push({ line: index + 1, kind: id, text: match[0] });
      }
    }
  }
  return found;
}

/* ── walking ─────────────────────────────────────────────────────────────── */

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((dir) => {
  const full = join(ROOT, dir);
  try {
    return listFiles(full);
  } catch {
    return [];
  }
}).map((file) => relative(ROOT, file)).sort();

function isReskinned(path) {
  return RESKINNED.some((entry) => path.startsWith(entry.path));
}

function allowance(path) {
  return ALLOW.find((entry) => path === entry.path || path.startsWith(entry.path));
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (surveyAll) {
  const rows = [];
  let inScopeTotal = 0;
  let outOfScopeTotal = 0;

  for (const file of files) {
    const hits = findings(readFileSync(join(ROOT, file), "utf8"));
    if (hits.length === 0) continue;
    const allowed = allowance(file);
    const scoped = isReskinned(file);
    if (allowed) continue;
    if (scoped) inScopeTotal += hits.length;
    else outOfScopeTotal += hits.length;
    rows.push({ file, count: hits.length, scoped });
  }

  rows.sort((a, b) => b.count - a.count);
  console.log("check-no-hardcoded-color: survey (--all does not fail)\n");
  console.log(`  files scanned            ${files.length}`);
  console.log(`  files with colours       ${rows.length}`);
  console.log(`  occurrences IN scope     ${inScopeTotal}   (these would fail today)`);
  console.log(`  occurrences OUT of scope ${outOfScopeTotal}   (the reskin's remaining work)\n`);
  console.log("  Largest, worst first:\n");
  for (const row of rows.slice(0, 30)) {
    console.log(`    ${String(row.count).padStart(5)}  ${row.scoped ? "IN " : "out"}  ${row.file}`);
  }
  if (rows.length > 30) console.log(`    …and ${rows.length - 30} more files`);
  process.exit(0);
}

const offenders = [];
let checked = 0;

for (const file of files) {
  if (!isReskinned(file)) continue;
  if (allowance(file)) continue;
  checked += 1;
  const hits = findings(readFileSync(join(ROOT, file), "utf8"));
  if (hits.length > 0) offenders.push({ file, hits });
}

if (offenders.length > 0) {
  console.error("check-no-hardcoded-color: hardcoded colours in reskinned files.\n");
  console.error("  Reskinned surfaces must resolve every colour through a Nocturne role token,");
  console.error("  or per-tenant theming silently stops working for that element.\n");
  for (const offender of offenders) {
    console.error(`  ${offender.file}`);
    for (const hit of offender.hits.slice(0, 8)) {
      console.error(`    line ${hit.line}: ${hit.text}  (${hit.kind})`);
    }
    if (offender.hits.length > 8) console.error(`    …and ${offender.hits.length - 8} more`);
  }
  console.error(
    "\n  Use a token (`var(--color-accent)`, `.btn`, `.card`, …). If a raw value is genuinely",
    "\n  unavoidable, add the file to ALLOW in this script with the reason.",
  );
  process.exit(1);
}

console.log(
  `check-no-hardcoded-color: ok (${checked} reskinned file(s) checked, ` +
    `${ALLOW.length} allowlisted with reasons, ${files.length} scanned in total)`,
);
