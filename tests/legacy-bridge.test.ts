import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The legacy variable bridge must be COMPLETE.
 *
 * Outside `.noct`, a custom property the app references but nobody declares
 * falls back to whatever `:root` says — which for the pre-reskin screens is
 * `app/globals.css`. Inside `.noct`, the bridge shadows that block, so a name
 * the bridge forgets resolves to nothing and the element paints transparent:
 * invisible text, borderless cards, an unreadable badge. Nothing else in the
 * harness would notice, because no test asserts on colour.
 *
 * So this walks the source, collects every legacy custom property actually
 * referenced, and requires the bridge to declare each one. It is the guard that
 * makes "wrap the app in NocturneRoot and every screen still renders" a checked
 * claim rather than a hope.
 *
 * It is also the tranche ledger's other half: as screens migrate off the legacy
 * names, this list shrinks, and when it is empty the bridge can be deleted.
 */

const ROOT = process.cwd();
const BRIDGE = join(ROOT, "components", "nocturne", "legacy-bridge.css");
const SCAN = ["app", "components"];

/**
 * The pre-reskin naming. Nocturne's own tokens are `--color-*`, `--ax-*` and
 * `--dv-*`, so the prefixes below cannot collide with them.
 *
 * The optional suffix matters: `--accent` and `--border` exist as bare names
 * alongside `--accent-text` and `--border-strong`, and a pattern that required a
 * suffix would miss the two most-used variables in the codebase.
 */
const LEGACY_RE = /--(?:bg|text|border|accent|sidebar|alert)(?:-[a-z-]+)?\b/g;

/** Nocturne's own names, which happen to match the prefix pattern. */
const NOCTURNE_OWNED = /^--(?:ax|color|dv|status|font|space|radius|shadow)-/;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Comments stripped first. The file's prose quotes declarations verbatim to
 * explain them, and a guard that reads documentation as code would push the next
 * person to delete the explanation rather than write one.
 */
const bridgeSource = readFileSync(BRIDGE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Names the bridge declares (left of a colon), not ones it merely references. */
const declared = new Set(
  [...bridgeSource.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
);

const referenced = new Map<string, string[]>();
for (const dir of SCAN) {
  for (const file of listFiles(join(ROOT, dir))) {
    const relative = file.replace(`${ROOT}/`, "");
    // The bridge and the token sheets are where these are DEFINED.
    if (relative.startsWith("components/nocturne/")) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.match(LEGACY_RE) ?? []) {
      if (NOCTURNE_OWNED.test(match)) continue;
      const seen = referenced.get(match) ?? [];
      if (!seen.includes(relative)) seen.push(relative);
      referenced.set(match, seen);
    }
  }
}

describe("the legacy variable bridge", () => {
  it("finds legacy names to check — the guard must not pass vacuously", () => {
    // Until the reskin is finished this is in the twenties. When it reaches
    // zero, delete the bridge and this file with it.
    expect(referenced.size).toBeGreaterThan(0);
  });

  it("declares every legacy custom property the app still references", () => {
    const missing = [...referenced.entries()]
      .filter(([name]) => !declared.has(name))
      .map(([name, files]) => `${name}  (${files.slice(0, 3).join(", ")}${files.length > 3 ? ", …" : ""})`);
    expect(missing, "legacy names that would resolve to nothing inside .noct").toEqual([]);
  });

  it("declares nothing that is no longer referenced", () => {
    // A stale entry is harmless but misleading: it makes the bridge look bigger
    // than the remaining work, and the bridge is the progress ledger.
    const legacyDeclared = [...declared].filter((name) => !NOCTURNE_OWNED.test(name));
    const stale = legacyDeclared.filter((name) => !referenced.has(name));
    expect(stale, "bridge entries nothing references any more — delete them").toEqual([]);
  });

  it("maps every legacy name onto a Nocturne token, never onto a literal", () => {
    // The whole point is that these resolve through the token layer. A hex here
    // would silently opt that element out of per-tenant theming, which is the
    // exact failure the reskin exists to prevent.
    // From the first brace: the selector list is a detail (it is repeated per
    // theme island), the declarations are the subject.
    const block = bridgeSource.slice(bridgeSource.indexOf("{"));
    const declarations = [...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)];
    expect(declarations.length).toBeGreaterThan(20);
    for (const [, name, value] of declarations) {
      expect(value, `${name} does not resolve through a token`).toMatch(/var\(--/);
      expect(value, `${name} carries a hex literal`).not.toMatch(/#[0-9a-fA-F]{3}/);
    }
  });
});
