import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The legacy variable bridge is RETIRED, and this is what keeps it that way.
 *
 * For the length of the reskin, `components/nocturne/legacy-bridge.css` mapped
 * the pre-reskin custom properties (`--bg-primary`, `--text-muted`, `--border`
 * and twenty-six others) onto their Nocturne replacements, so screens that had
 * not yet been through their tranche still resolved their colours through the
 * token layer. This file's job then was COMPLETENESS: a name the bridge forgot
 * resolved to nothing inside `.noct` and the element painted transparent.
 *
 * At Gate F the last 3,836 references were renamed onto the tokens themselves
 * and the bridge was deleted. The test inverts with it. It now asserts the
 * opposite property — that no legacy name has come back — because the failure
 * mode has inverted too: with no bridge, a reintroduced `var(--text-muted)`
 * resolves to nothing at all, and the element it was meant to colour paints
 * transparent on a screen nobody is looking at.
 *
 * If this fails, the fix is never to re-add the bridge. It is to point the call
 * site at the Nocturne token that replaced the name — the mapping is recorded in
 * the Gate F commit, and every replacement is a plain `--color-*` or `--ax-*`.
 */

const ROOT = process.cwd();
const BRIDGE = join(ROOT, "components", "nocturne", "legacy-bridge.css");
const SCAN = ["app", "components", "src"];

/**
 * The pre-reskin naming. Nocturne's own tokens are `--color-*`, `--ax-*` and
 * `--dv-*`, so the prefixes below cannot collide with them.
 *
 * The optional suffix matters: `--accent` and `--border` existed as bare names
 * alongside `--accent-text` and `--border-strong`, and a pattern that required a
 * suffix would miss the two most-used variables in the old codebase.
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

const referenced = new Map<string, string[]>();
for (const dir of SCAN) {
  for (const file of listFiles(join(ROOT, dir))) {
    const relative = file.replace(`${ROOT}/`, "");
    // The token layer is where Nocturne's own names are DEFINED.
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
  it("is deleted", () => {
    expect(
      existsSync(BRIDGE),
      "legacy-bridge.css is back — point the call site at its Nocturne token instead",
    ).toBe(false);
  });

  it("has no callers left anywhere in the app", () => {
    const offenders = [...referenced.entries()].map(
      ([name, files]) =>
        `${name}  (${files.slice(0, 3).join(", ")}${files.length > 3 ? ", …" : ""})`,
    );
    expect(
      offenders,
      "pre-reskin custom properties: nothing declares these any more, so they resolve to nothing",
    ).toEqual([]);
  });

  it("finds files to check — the guard must not pass vacuously", () => {
    // The check above is an empty-set assertion, which is exactly the shape that
    // passes when the walk is broken. This proves the walk actually ran.
    const scanned = SCAN.flatMap((dir) => listFiles(join(ROOT, dir)));
    expect(scanned.length).toBeGreaterThan(200);
    // And that the pattern still matches what it is supposed to match.
    expect("color: var(--text-muted)".match(LEGACY_RE)).toEqual(["--text-muted"]);
    expect("color: var(--ax-muted)".match(LEGACY_RE)?.filter((m) => !NOCTURNE_OWNED.test(m)) ?? []).toEqual([]);
  });
});
