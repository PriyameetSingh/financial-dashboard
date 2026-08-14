#!/usr/bin/env node
/**
 * Accessibility leg — WCAG 2.1 AA, in a real browser.
 *
 * The phase requires every new surface to pass a WCAG 2.1 AA check before it is
 * called done. This leg is that check, and it is a golden leg rather than a
 * one-off review because "it passed when I built it" and "it passes" are
 * different claims, and only the second one is worth anything six commits later.
 *
 * Why a real browser rather than a DOM shim: more than half of what AA asks
 * about is computed style, not markup. Contrast needs resolved colours —
 * `color-mix(in srgb, var(--color-text) 55%, transparent)` composited over
 * whatever is actually painted behind it. Target size needs layout. Focus
 * visibility needs `:focus-visible` to have matched. A jsdom run silently skips
 * every one of those rules and reports a clean pass over the ones that are left,
 * which is worse than not running it.
 *
 * So: `next dev`, a minted dev session, headless Chromium, axe-core injected
 * into the live page. Chromium is the one preinstalled in this environment; the
 * driver is `playwright-core`, which ships no browser of its own.
 *
 * WHAT IS COVERED. The component gallery, which renders every primitive in
 * every state. Four passes — the two themes crossed with the two densities —
 * because a contrast value that passes on the dark ground can fail on the light
 * one (three corrections in `tokens.css` came from exactly that), and because
 * density changes spacing, which changes what overlaps.
 *
 * WHAT IS NOT COVERED, and cannot be by any automated tool: axe finds roughly a
 * third of WCAG issues. It cannot judge whether alt text is accurate, whether a
 * heading structure is meaningful, or whether an interaction is usable. Those
 * need a person. This leg's job is to make sure a person never has to spend
 * their attention on the third a machine can find.
 *
 * Preconditions: a reachable dev database (.env.local) migrated and seeded, the
 * same as check-http-smoke.
 *
 * Run: node scripts/check-a11y.mjs
 */
import { spawn } from "node:child_process";
import { request } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);

const PORT = Number(process.env.A11Y_PORT ?? 8798);
const HOST = "odisha.airawat.test";
const BASE_PATH = "/hudd-dashboard";
const GALLERY = "/design-system";
const WATCHDOG_MS = Number(process.env.A11Y_WATCHDOG_MS ?? 300_000);

/** The browser this environment preinstalls. `playwright-core` ships none. */
const CHROMIUM = process.env.A11Y_CHROMIUM ?? "/opt/pw-browsers/chromium";

/**
 * The rule sets that define "WCAG 2.1 AA". `best-practice` is deliberately NOT
 * included: those rules are opinions, some of them contested, and a leg that
 * fails the build on an opinion gets disabled within a month.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** The gallery renders every primitive, so these four URLs cover the set. */
const VIEWS = [
  { name: "dark · comfortable", query: "?theme=dark&density=comfortable" },
  { name: "dark · compact", query: "?theme=dark&density=compact" },
  { name: "light · comfortable", query: "?theme=light&density=comfortable" },
  { name: "light · compact", query: "?theme=light&density=compact" },
];

const failures = [];

// `detached` so the whole process group can be signalled. `npx next dev` is a
// shim that forks the real server; killing only the shim leaves the server
// holding the port, and Next 16 refuses to start a second dev server at all —
// so a leaked child does not merely waste a port, it breaks every later run of
// this leg and of check-http-smoke.
const server = spawn("npx", ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
  env: { ...process.env, DEV_AUTH_ENABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let serverLog = "";
/**
 * Fail fast on the one startup error that otherwise costs three minutes of
 * retries and reports as a timeout: a dev server left behind by an earlier run
 * still holding the port. Next 16 refuses to start a second dev server at all,
 * so the message is unambiguous and worth surfacing as itself.
 */
function watchStartup(chunk) {
  serverLog += chunk;
  const text = String(chunk);
  if (text.includes("EADDRINUSE") || text.includes("Another next dev server is already running")) {
    console.error(
      `\ncheck-a11y: port ${PORT} is already in use — a dev server from an earlier run is still ` +
        `holding it. Stop it (the pid is in .next/dev/lock) and re-run.`,
    );
    shutdown();
    process.exit(1);
  }
}
server.stdout.on("data", watchStartup);
server.stderr.on("data", watchStartup);

function shutdown() {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    try {
      server.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}
process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

const watchdog = setTimeout(() => {
  console.error(`\ncheck-a11y: exceeded ${WATCHDOG_MS / 1000}s — aborting.\n${serverLog.slice(-2000)}`);
  shutdown();
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

/**
 * `node:http` rather than `fetch` for the session mint, for the same reason
 * check-http-smoke uses it: tenant resolution reads the Host header, and
 * `fetch` treats `host` as forbidden and drops it silently.
 */
function getOnce(path) {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port: PORT, path: `${BASE_PATH}${path}`, method: "GET", headers: { host: HOST } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"] ?? [], body }));
      },
    );
    req.setTimeout(30_000, () => req.destroy(new Error(`timeout after 30s: ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

async function get(path) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await getOnce(path);
    } catch (error) {
      lastError = error;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function mintSession() {
  const res = await get("/api/dev/session?tenant=odisha");
  let body;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = {};
  }
  if (res.status !== 200 || !body.minted) {
    throw new Error(
      `could not mint an odisha session (${res.status} ${res.body.slice(0, 160)}). ` +
        `Is the dev database migrated and seeded?`,
    );
  }
  const cookie = (res.setCookie[0] ?? "").split(";")[0];
  if (!cookie.startsWith("authjs.session-token=")) {
    throw new Error(`unexpected session cookie: ${String(res.setCookie[0]).slice(0, 80)}`);
  }
  const [name, ...rest] = cookie.split("=");
  return { name, value: rest.join("=") };
}

/** Renders one violation compactly enough to act on without opening a browser. */
function describe(violation) {
  const where = violation.nodes
    .slice(0, 3)
    .map((node) => {
      const target = node.target.join(" ");
      // `failureSummary` is where axe explains the specific measurement — the
      // contrast ratio it computed, the missing attribute — so it is the part
      // worth keeping.
      const why = (node.failureSummary ?? "").split("\n").filter(Boolean).slice(1).join(" ");
      return `      ${target}\n        ${why}`;
    })
    .join("\n");
  const more = violation.nodes.length > 3 ? `\n      … and ${violation.nodes.length - 3} more` : "";
  return `    [${violation.impact ?? "unknown"}] ${violation.id} — ${violation.help}\n${where}${more}\n      ${violation.helpUrl}`;
}

async function main() {
  console.log(`  · booting next dev on :${PORT}`);
  const cookie = await mintSession();

  const axeSource = readFileSync(require.resolve("axe-core"), "utf8");

  // The browser must send the tenant's own Host header — tenant resolution reads
  // it, and Chromium will not let a client override `Host` on a navigation. So
  // the page is requested at the real hostname and the resolver is pointed at
  // the loopback server, which is the only way to exercise the same code path a
  // browser on that domain would.
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`],
  });
  try {
    const context = await browser.newContext({
      // The gallery is a desktop surface, but the viewport is narrow enough
      // that reflow (WCAG 1.4.10) is exercised rather than assumed.
      viewport: { width: 1280, height: 900 },
    });
    await context.addCookies([
      { name: cookie.name, value: cookie.value, domain: HOST, path: "/", httpOnly: true, sameSite: "Lax" },
    ]);

    for (const view of VIEWS) {
      const page = await context.newPage();
      const url = `http://${HOST}:${PORT}${BASE_PATH}${GALLERY}${view.query}`;
      // `load` rather than `networkidle`: the dev server holds a hot-reload
      // socket open for the life of the page, so "idle" is not a state it
      // reliably reaches. The specimen wait below is the real readiness signal.
      const response = await page.goto(url, { waitUntil: "load", timeout: 120_000 });

      if (!response || response.status() !== 200) {
        failures.push(`${view.name}: gallery returned ${response ? response.status() : "no response"}`);
        console.log(`  ✗ ${view.name} — HTTP ${response ? response.status() : "none"}`);
        await page.close();
        continue;
      }

      // A guard against the whole leg passing vacuously: if the page rendered
      // an error boundary or an empty shell, axe would find nothing wrong with
      // it and report a clean run.
      // The gallery body is a client component, so the specimens arrive on
      // hydration rather than in the server HTML.
      await page.locator(".noct .ax-panel").first().waitFor({ timeout: 60_000 }).catch(() => {});
      const specimens = await page.locator(".noct .ax-panel").count();
      if (specimens < 6) {
        const landed = page.url();
        failures.push(
          `${view.name}: only ${specimens} specimen panels rendered — the gallery did not load (landed on ${landed})`,
        );
        console.log(`  ✗ ${view.name} — ${specimens} specimen panels (expected ≥ 6), landed on ${landed}`);
        await page.close();
        continue;
      }

      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(
        async (tags) => await window.axe.run(document, { runOnly: { type: "tag", values: tags } }),
        TAGS,
      );

      if (result.violations.length === 0) {
        console.log(
          `  ✓ ${view.name} — ${result.passes.length} rule checks passed, ` +
            `${specimens} specimen panels, 0 violations`,
        );
      } else {
        const total = result.violations.reduce((sum, v) => sum + v.nodes.length, 0);
        console.log(`  ✗ ${view.name} — ${result.violations.length} violations across ${total} elements`);
        for (const violation of result.violations) console.log(describe(violation));
        failures.push(`${view.name}: ${result.violations.map((v) => v.id).join(", ")}`);
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main()
  .then(() => {
    clearTimeout(watchdog);
    shutdown();
    if (failures.length > 0) {
      console.error(`\ncheck-a11y: FAILED\n${failures.map((f) => `  - ${f}`).join("\n")}`);
      process.exit(1);
    }
    console.log(
      `check-a11y: ok (WCAG 2.1 AA — ${TAGS.join(", ")} — over ${VIEWS.length} theme/density views of the gallery)`,
    );
    process.exit(0);
  })
  .catch((error) => {
    clearTimeout(watchdog);
    shutdown();
    console.error(`\ncheck-a11y: ${error.message}\n${serverLog.slice(-2000)}`);
    process.exit(1);
  });
