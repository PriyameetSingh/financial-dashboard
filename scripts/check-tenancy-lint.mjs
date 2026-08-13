/**
 * Tenancy lint — fails on tenant-identity branching and on Odisha-specific
 * literals that should live in tenant config, not in application code.
 *
 * Run: node scripts/check-tenancy-lint.mjs
 *
 * This is the extraction backlog enforcer. At Gate 1 it is EXPECTED to report
 * violations — those findings are the Phase 1 extraction backlog, not a
 * regression. As literals migrate into lib/tenant-config/ defaults and code
 * reads them through the resolver, the count drains toward zero.
 *
 * Allowlist (not scanned / not flagged):
 *   - filenames & paths            — we scan file *contents*, never paths
 *   - comments                     — slash-slash, asterisk, slash-star lines are skipped
 *   - .env.example / .env*         — sample config, not application logic
 *   - prisma/seed star-dot js|cjs|ts,
 *     prisma/seed.js, seed_dashboards.ts, UsersSeedData/ — seed data
 *   - chokepoint/config files      — lib/next-base-path.ts, lib/hudd-logo.ts,
 *                                    lib/tenant-config/** (the new defaults)
 *   - non-code assets              — docs/**, *.md, artifacts/**, *.csv,
 *                                    *.txt, *.log, *.py, *.sh, Jenkinsfile,
 *                                    nginx-proxy.conf, ecosystem.config.cjs,
 *                                    auto-deploy.service
 *
 * Flagged (in application logic / UI copy only):
 *   1. tenant-identity branching: `tenant === 'x'`, `tenantId === 'x'`, etc.
 *   2. known Odisha literals: odisha, hudd, Government of Odisha, Asia/Kolkata,
 *      en-IN, ₹ (currency), and the SO / IFMS domain labels as quoted strings.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SELF = relative(ROOT, new URL(import.meta.url).pathname);

// ─── Allowlist ───────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".continue",
  ".cursor",
]);

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs", ".jsx"]);

// Files / path prefixes whose contents are not application logic.
const SKIP_PATH_PATTERNS = [
  /^\.env(\.|$)/, // .env, .env.example, .env.test.local, ...
  /^prisma[\\/]+seed.*\.(js|cjs|ts)$/i,
  /^prisma[\\/]+seed\.js$/i,
  /^seed_dashboards\.ts$/i,
  /^UsersSeedData[\\/]/,
  /^lib[\\/]+next-base-path\.ts$/i,
  /^lib[\\/]+hudd-logo\.ts$/i,
  /^lib[\\/]+tenant-config[\\/]/,
  /^docs[\\/]/,
  /^artifacts[\\/]/,
  /^archive[\\/]/,
];

const SKIP_FILE_EXACT = new Set([
  SELF, // this lint script
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vitest.config.mjs",
  "next.config.ts",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "docker-compose.yml",
  "Jenkinsfile",
  "nginx-proxy.conf",
  "ecosystem.config.cjs",
  "auto-deploy.service",
  "check-tenancy-lint.mjs",
  "WEBHOOK-SETUP.md",
  "QUICK-START.md",
  "TESTING-CHECKLIST.md",
  "ACCEPTANCE_CHECKLIST.txt",
  "CHANGELOG.md",
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
  "design.md",
  "TEST.md",
]);

const SKIP_FILE_EXT = new Set([
  ".md",
  ".csv",
  ".txt",
  ".log",
  ".py",
  ".sh",
  ".yml",
  ".yaml",
  ".json",
  ".svg",
  ".png",
  ".ico",
  ".css",
]);

function shouldSkip(relPath) {
  const norm = relPath.split(sep).join("/");
  for (const re of SKIP_PATH_PATTERNS) {
    if (re.test(norm)) return true;
  }
  const base = norm.split("/").pop();
  if (SKIP_FILE_EXACT.has(base)) return true;
  const ext = base.includes(".") ? "." + base.split(".").pop().toLowerCase() : "";
  if (SKIP_FILE_EXT.has(ext)) return true;
  if (CODE_EXTS.has(ext)) return false; // scan code files
  return true; // unknown extension → skip
}

// ─── Comment detection (line-level, conservative) ────────────────────────────
// A line is treated as a comment if its first non-whitespace token starts a
// comment. Block-comment bodies (lines starting with *) are also skipped.
// This is intentionally simple: it avoids flagging prose in comments while
// not trying to parse JS comment blocks perfectly.
function isCommentLine(line) {
  const t = line.trimStart();
  if (!t) return true;
  if (t.startsWith("//")) return true;
  if (t.startsWith("*")) return true;
  if (t.startsWith("/*")) return true;
  return false;
}

// ─── Patterns ───────────────────────────────────────────────────────────────
// Each pattern: { id, re, kind }
const PATTERNS = [
  {
    id: "tenant-identity-branch",
    kind: "branch",
    re: /\btenant(Id)?\s*(===|!==|==|!=)\s*['"]/,
  },
  { id: "literal-odisha", kind: "literal", re: /\bodisha\b/i },
  { id: "literal-hudd", kind: "literal", re: /\bhudd\b/i },
  { id: "literal-government-of-odisha", kind: "literal", re: /Government of Odisha/i },
  { id: "literal-asia-kolkata", kind: "literal", re: /Asia\/Kolkata/ },
  { id: "literal-en-IN", kind: "literal", re: /\ben-IN\b/ },
  { id: "literal-rupee", kind: "literal", re: /₹/ },
  { id: "literal-SO-label", kind: "literal", re: /['"]SO['"]/ },
  { id: "literal-IFMS-label", kind: "literal", re: /['"]IFMS['"]/ },
];

// ─── Walk ────────────────────────────────────────────────────────────────────
function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

const allFiles = [];
walk(ROOT, allFiles);

const findings = [];
for (const file of allFiles) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (shouldSkip(rel)) continue;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    for (const p of PATTERNS) {
      const m = line.match(p.re);
      if (m) {
        findings.push({ file: rel, line: i + 1, id: p.id, kind: p.kind, text: line.trim() });
      }
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────
const byId = new Map();
for (const f of findings) {
  if (!byId.has(f.id)) byId.set(f.id, []);
  byId.get(f.id).push(f);
}

if (findings.length === 0) {
  console.log("check-tenancy-lint: ok (no tenant-identity branching or hardcoded Odisha literals found)");
  process.exit(0);
}

console.error(
  `check-tenancy-lint: ${findings.length} finding(s) across ${byId.size} pattern(s) — this is the Phase 1 extraction backlog.\n`,
);
for (const [id, items] of byId) {
  console.error(`── ${id} (${items.length}) ──`);
  for (const f of items) {
    console.error(`  ${f.file}:${f.line}  ${f.text}`);
  }
  console.error("");
}
console.error(
  "Resolve by moving these literals into lib/tenant-config/ defaults and reading them",
  "through the tenant config resolver. Do NOT branch on tenant identity in code.",
);
console.error(
  "\nTracked backlog & discharge procedure (extend the golden to the call site,",
  "then convert): docs/TENANCY-BACKLOG.md",
);
process.exit(1);
