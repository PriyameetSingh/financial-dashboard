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
 * SCOPE IS THE WHOLE REPOSITORY, as of reskin Gate F.
 *
 * For the length of the reskin this check ran against a `RESKINNED` allow-list
 * that grew one tranche at a time, so a screen came under enforcement on the gate
 * that migrated it. That list is gone. It had a real weakness as a permanent
 * design — a NEW file was unchecked until somebody remembered to add it, which is
 * the opposite of what a guard should do — and it exists in the git history if
 * anyone needs to see which gate brought which screen in.
 *
 * Everything under `SCAN_DIRS` is checked. `ALLOW` below is the complete set of
 * exceptions, each with the reason it is one.
 *
 * Run `node scripts/check-no-hardcoded-color.mjs --all` for a survey that lists
 * every file with a colour, allowed or not, and never fails.
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
      "extension tokens, plus the literals documented in place: the section band's fixed foreground, the ::backdrop tint that cannot inherit a custom property, and the black the scrim mixes the ground into",
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
  {
    path: "lib/meeting-report-pdf-server.tsx",
    reason:
      "the server-side PDF generator: it renders through @react-pdf, which has no CSS custom properties, so a token cannot reach it. Out of the reskin's scope by instruction; the ON-SCREEN report it mirrors is on the document palette (see --ax-doc-* in tokens.css)",
  },
  {
    path: "lib/pendance-report-pdf-server.tsx",
    reason: "same as the meeting-report generator above",
  },
  {
    path: "lib/meeting-report-pdf.ts",
    reason: "one white, in the PDF generator's shared page setup",
  },
  {
    path: "lib/tenant-config/registry.ts",
    reason:
      "a hex inside a VALIDATION MESSAGE — `must be a hex colour like \"#5fa8a0\"` — not a colour this file paints with. Nothing renders from it",
  },
  {
    path: "components/AgentPanel.tsx",
    reason:
      "orphaned: nothing imports it. Preserved unchanged pending product triage, along with AiAlertsCard below — deleting either is a product decision, not a reskin one",
  },
  {
    path: "components/command-centre/AiAlertsCard.tsx",
    reason: "orphaned: nothing imports it. Preserved unchanged pending product triage",
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

function allowance(path) {
  return ALLOW.find((entry) => path === entry.path || path.startsWith(entry.path));
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (surveyAll) {
  const rows = [];
  let inScopeTotal = 0;

  for (const file of files) {
    const hits = findings(readFileSync(join(ROOT, file), "utf8"));
    if (hits.length === 0) continue;
    const allowed = allowance(file);
    if (allowed) continue;
    inScopeTotal += hits.length;
    rows.push({ file, count: hits.length });
  }

  rows.sort((a, b) => b.count - a.count);
  console.log("check-no-hardcoded-color: survey (--all does not fail)\n");
  console.log(`  files scanned            ${files.length}`);
  console.log(`  files with colours       ${rows.length}`);
  console.log(`  occurrences              ${inScopeTotal}   (these would fail today)\n`);
  console.log("  Largest, worst first:\n");
  for (const row of rows.slice(0, 30)) {
    console.log(`    ${String(row.count).padStart(5)}  ${row.file}`);
  }
  if (rows.length > 30) console.log(`    …and ${rows.length - 30} more files`);
  process.exit(0);
}

const offenders = [];
let checked = 0;

for (const file of files) {
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
  `check-no-hardcoded-color: ok (${checked} file(s) checked repo-wide, ` +
    `${ALLOW.length} allowlisted with reasons)`,
);
