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
 * WHAT IS COVERED. Every net-new surface, listed in `SURFACES` below. Each one
 * is audited in its own right rather than assumed to inherit the gallery's pass:
 * the primitives being accessible does not make a page built from them
 * accessible, because heading order, landmarks, link purpose, skip links and
 * reflow are properties of the page, not of its parts. A surface added to this
 * phase without an entry here is a surface nothing checks.
 *
 * Each surface declares its own views. Themes are always crossed, because a
 * contrast value that passes on the dark ground can fail on the light one —
 * three corrections in `tokens.css` came from exactly that. Beyond that, a
 * surface asks for what it needs: the gallery crosses densities, the public
 * landing is also loaded at a phone viewport, since reflow (1.4.10) is a real
 * requirement for a page whose readers are on their phones.
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
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);

const PORT = Number(process.env.A11Y_PORT ?? 8798);
const HOST = "odisha.airawat.test";
const BASE_PATH = "/hudd-dashboard";
const WATCHDOG_MS = Number(process.env.A11Y_WATCHDOG_MS ?? 600_000);

/** The browser this environment preinstalls. `playwright-core` ships none. */
const CHROMIUM = process.env.A11Y_CHROMIUM ?? "/opt/pw-browsers/chromium";

/**
 * The rule sets that define "WCAG 2.1 AA". `best-practice` is deliberately NOT
 * included: those rules are opinions, some of them contested, and a leg that
 * fails the build on an opinion gets disabled within a month.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const DESKTOP = { width: 1280, height: 900 };
/** iPhone SE — the narrowest screen this product has to work on. */
const PHONE = { width: 375, height: 780 };

/**
 * Every surface this phase adds, with the views each one is audited in and a
 * selector that proves the page actually rendered.
 *
 * `readySelector` and `minMatches` are the non-vacuity guard. Without them a
 * page that failed to render — an error boundary, an empty shell, a redirect to
 * sign-in — has nothing for axe to find fault with, and the leg reports a clean
 * pass over nothing at all. That is not hypothetical: it happened twice while
 * this leg was being written, and the guard is why it was noticed.
 */
const SURFACES = [
  {
    name: "component gallery",
    path: "/design-system",
    // A dev/internal surface behind a session.
    authenticated: true,
    readySelector: ".noct .ax-panel",
    minMatches: 6,
    views: [
      { name: "dark · comfortable", query: "?theme=dark&density=comfortable", viewport: DESKTOP },
      { name: "dark · compact", query: "?theme=dark&density=compact", viewport: DESKTOP },
      { name: "light · comfortable", query: "?theme=light&density=comfortable", viewport: DESKTOP },
      { name: "light · compact", query: "?theme=light&density=compact", viewport: DESKTOP },
    ],
  },
  {
    name: "platform landing (S1)",
    path: "/platform",
    // Public. Audited WITHOUT a session on purpose — that is how a visitor
    // arrives, and auditing it signed-in would silently test a different page
    // if the proxy ever started redirecting it.
    authenticated: false,
    readySelector: ".noct .ax-lp-root section",
    minMatches: 5,
    views: [
      { name: "dark · desktop", query: "?theme=dark", viewport: DESKTOP },
      { name: "light · desktop", query: "?theme=light", viewport: DESKTOP },
      { name: "dark · phone", query: "?theme=dark", viewport: PHONE },
      { name: "light · phone", query: "?theme=light", viewport: PHONE },
    ],
  },
  {
    name: "sign-in (reskin A)",
    path: "/login",
    // Unauthenticated by design — that is the page.
    authenticated: false,
    readySelector: ".noct .btn-primary",
    minMatches: 1,
    views: [
      { name: "dark · desktop", query: "", viewport: DESKTOP },
      { name: "dark · phone", query: "", viewport: PHONE },
    ],
  },
  {
    name: "sign-in problem (reskin A)",
    path: "/auth/error",
    /*
     * Audited SIGNED IN, which is not what this page is for.
     *
     * `/auth/error` is the page `auth.ts` names as NextAuth's error target, so a
     * visitor reaches it when their sign-in FAILED — with no session, by
     * definition. But `PUBLIC_AUTH_PATHS` lists only `/login`, so the proxy
     * bounces an anonymous request to `/login?redirect=/auth/error` and the page
     * never renders for the audience it was written for. That is pre-existing
     * routing, not something the reskin introduced, and routing is explicitly
     * out of scope here — so the audit signs in to reach the markup rather than
     * quietly widening the public path set to make itself pass.
     *
     * Reported as a Gate A finding. When the path is made public, drop the flag.
     */
    authenticated: true,
    readySelector: ".noct .btn-primary",
    minMatches: 1,
    views: [{ name: "dark · desktop", query: "?error=AccessDenied", viewport: DESKTOP }],
  },
  {
    name: "app shell (reskin A)",
    path: "/profile",
    authenticated: true,
    // The sidebar's nav items. Waiting for one also proves the entitlement-driven
    // nav resolved, rather than the shell rendering an empty rail.
    readySelector: ".noct .ax-nav .ax-nav-item",
    minMatches: 3,
    /**
     * SCOPED. The frame is reskinned at this gate; the screen inside it is not
     * until its own tranche. Auditing the whole page would report the unreskinned
     * body's problems as this gate's, and — worse — would go green later for
     * reasons that have nothing to do with the shell. So axe is pointed at the
     * chrome only, and the page's own audit arrives with its tranche.
     */
    axeInclude: [[".noct .ax-nav"], [".noct .ax-app-topbar"]],
    views: [
      { name: "dark · desktop", query: "", viewport: DESKTOP },
      { name: "light · desktop", query: "", viewport: DESKTOP, theme: "light" },
      { name: "dark · phone", query: "", viewport: PHONE },
    ],
  },
  {
    name: "design-system configurator (S3)",
    path: "/admin/design-system",
    // A tenant-admin surface: behind a session AND `MANAGE_TENANT_CONFIG`, which
    // the odisha dev-auth user holds.
    authenticated: true,
    readySelector: ".noct .ax-cfg-group",
    minMatches: 4,
    views: [
      { name: "desktop", query: "", viewport: DESKTOP },
      { name: "phone", query: "", viewport: PHONE },
    ],
  },
  {
    name: "menu-card configurator (S3)",
    path: "/admin/menu-card",
    authenticated: true,
    // Its content arrives from the entitlements API after mount, so waiting for
    // a capability card also proves the fetch resolved — a screen stuck on its
    // loading row would otherwise audit clean.
    readySelector: ".noct .ax-cap",
    minMatches: 20,
    views: [
      { name: "desktop", query: "", viewport: DESKTOP },
      { name: "phone", query: "", viewport: PHONE },
    ],
  },
  {
    name: "onboarding code gate (S2)",
    path: "/onboarding",
    authenticated: false,
    readySelector: ".noct #onboarding-code",
    minMatches: 1,
    views: [
      { name: "desktop", query: "", viewport: DESKTOP },
      { name: "phone", query: "", viewport: PHONE },
    ],
  },
];

/**
 * The wizard's eight steps, audited one at a time.
 *
 * Loading `/onboarding` and running axe once would audit the code gate and
 * nothing else — the steps do not exist in the DOM until a code is accepted,
 * and each step replaces the last. So this drives the real thing: a real code,
 * real typing, real Continue clicks, and a real launch at the end so the
 * confirmation screen is audited too.
 *
 * Every step is worth its own pass because each introduces markup the others do
 * not have: choice cards, a colour picker, module switches, a password field, a
 * native select, a review table.
 */
const WIZARD_STEPS = [
  { name: "1 org profile", ready: "#wz-org-name" },
  { name: "2 branding", ready: "#wz-brand-custom" },
  { name: "3 localization", ready: "#wz-locale" },
  { name: "4 modules", ready: "[id^=\"wz-mod-\"]" },
  // The choice cards hide their radio visually and paint the label, so the
  // readiness selector has to name the label — a hidden input never becomes
  // "visible" and the wait would run to its timeout on a page that is fine.
  { name: "5 AI setup", ready: 'label:has(input[name="wz-ai-mode"])' },
  { name: "6 starter data", ready: 'label:has(input[name="wz-starter"])' },
  { name: "7 people", ready: "#wz-invite-email-0" },
  { name: "8 review", ready: ".ax-wz-review-row" },
];

/**
 * Database access, for the onboarding wizard only.
 *
 * The wizard is eight screens behind an authorization gate, and auditing only
 * the gate would leave the eight unchecked. So this leg mints a real onboarding
 * code, drives the wizard through every step, and launches a real workspace so
 * the final screen can be audited too — then removes what it created.
 *
 * Requires DATABASE_URL, which is why run-golden invokes this leg with
 * `--env-file=.env.local`.
 */
const db = new PrismaClient();

/** Removed in `finally`, whatever happens in between. */
const createdTenantIds = [];
const createdTokenHashes = [];

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

/**
 * Injects axe, runs it, prints the outcome and records a failure if there is
 * one. Shared by the static surfaces and the wizard driver so both report the
 * same way and neither can quietly skip the recording step.
 */
async function audit(page, axeSource, label, note, include) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(
    async ({ tags, include }) =>
      await window.axe.run(include ? { include } : document, {
        runOnly: { type: "tag", values: tags },
      }),
    { tags: TAGS, include: include ?? null },
  );

  if (result.violations.length === 0) {
    console.log(`    ✓ ${note} — ${result.passes.length} rule checks passed, 0 violations`);
    return true;
  }
  const total = result.violations.reduce((sum, v) => sum + v.nodes.length, 0);
  console.log(`    ✗ ${note} — ${result.violations.length} violations across ${total} elements`);
  for (const violation of result.violations) console.log(describe(violation));
  failures.push(`${label}: ${result.violations.map((v) => v.id).join(", ")}`);
  return false;
}

/** Mints a real onboarding code. Only the hash is stored, as in production. */
async function mintOnboardingCode() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  createdTokenHashes.push(tokenHash);
  await db.onboardingToken.create({
    data: {
      tokenHash,
      tier: "standard",
      label: "a11y audit",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return token;
}

/**
 * Walks the wizard, auditing every step and the launch screen.
 *
 * Runs at the phone viewport, which is the harder of the two: the step rail
 * moves above the body, the person rows collapse to one column, and anything
 * that overlaps only at a narrow width overlaps here.
 */
async function auditWizard(context, axeSource, viewport) {
  const label = `onboarding wizard (S2) — ${viewport.width}px`;
  const page = await context.newPage();
  await page.setViewportSize(viewport);

  const token = await mintOnboardingCode();
  const slug = `a11y-${randomBytes(4).toString("hex")}`;

  await page.goto(`http://${HOST}:${PORT}${BASE_PATH}/onboarding`, { waitUntil: "load", timeout: 120_000 });
  // The wizard sets `data-hydrated` on mount. Before that the form is server
  // markup: clicking "Continue" performs a native submit and reloads the page.
  await page.locator('[data-hydrated="1"]').waitFor({ timeout: 60_000 });
  await page.fill("#onboarding-code", token);
  await page.getByRole("button", { name: "Continue" }).click();

  for (const [index, step] of WIZARD_STEPS.entries()) {
    await page.locator(step.ready).first().waitFor({ timeout: 30_000 });

    // Fill what the step needs before auditing, so the audit sees the screen in
    // the state a person actually leaves it in — including an error message,
    // which is markup nothing else on the page produces.
    if (index === 0) {
      await page.fill("#wz-org-name", "Accessibility Test Authority");
      await page.fill("#wz-slug", slug);
    }
    if (index === 4) {
      // Click the label, not the input: the input is visually hidden, and
      // clicking a hidden element is exactly what a real user cannot do either.
      await page.locator('label:has(input[name="wz-ai-mode"][value="byok"])').click();
      await page.fill("#wz-ai-key", "sk-a11y-not-a-real-key");
    }
    if (index === 6) {
      await page.fill("#wz-invite-email-0", "admin@example.test");
    }

    await audit(page, axeSource, label, `${step.name} at ${viewport.width}px`);

    if (index < WIZARD_STEPS.length - 1) {
      await page.getByRole("button", { name: "Continue" }).click();
    }
  }

  // Launch for real, so the confirmation screen is audited rather than assumed.
  await page.getByRole("button", { name: "Launch the workspace" }).click();
  await page.getByText("is live").first().waitFor({ timeout: 60_000 });

  const tenant = await db.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (tenant) createdTenantIds.push(tenant.id);
  else failures.push(`${label}: the wizard reported a launch but no tenant row exists`);

  await audit(page, axeSource, label, `9 launched at ${viewport.width}px`);
  await page.close();
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
    args: [
      `--host-resolver-rules=MAP ${HOST} 127.0.0.1`,
      // This environment exports HTTPS_PROXY for outbound traffic, and Chromium
      // honours it. Without these two, requests for the tenant hostname go to
      // the proxy, which knows nothing about it: the HTML document happened to
      // arrive anyway, but the JavaScript chunks did not, so every page audited
      // as server-rendered markup with no client behaviour attached. That is a
      // silent way to audit the wrong thing — the wizard could not be driven at
      // all, which is how it was noticed.
      "--proxy-server=direct://",
      "--proxy-bypass-list=*",
    ],
  });

  // Two contexts, not one. A public surface must be audited by a visitor with no
  // session — that is who reads it — and sharing one cookie jar would quietly
  // audit a signed-in variant of a page that is supposed to work signed-out.
  const signedIn = await browser.newContext();
  await signedIn.addCookies([
    { name: cookie.name, value: cookie.value, domain: HOST, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  const anonymous = await browser.newContext();

  try {
    for (const surface of SURFACES) {
      console.log(`  · ${surface.name}`);
      const context = surface.authenticated ? signedIn : anonymous;

      for (const view of surface.views) {
        const label = `${surface.name} — ${view.name}`;
        const page = await context.newPage();
        await page.setViewportSize(view.viewport);

        // The authenticated app's theme is the reader's own preference, stored
        // per browser. Seeding it before navigation is how this leg audits both
        // grounds without driving the toggle.
        if (view.theme) {
          await page.addInitScript((theme) => {
            window.localStorage.setItem("airawat-theme", theme);
          }, view.theme);
        }

        const url = `http://${HOST}:${PORT}${BASE_PATH}${surface.path}${view.query}`;
        // `load` rather than `networkidle`: the dev server holds a hot-reload
        // socket open for the life of the page, so "idle" is not a state it
        // reliably reaches. The readiness selector below is the real signal.
        const response = await page.goto(url, { waitUntil: "load", timeout: 120_000 });

        if (!response || response.status() !== 200) {
          failures.push(`${label}: returned ${response ? response.status() : "no response"}`);
          console.log(`    ✗ ${view.name} — HTTP ${response ? response.status() : "none"}`);
          await page.close();
          continue;
        }

        // Non-vacuity: a page that did not render has no violations either.
        await page
          .locator(surface.readySelector)
          .first()
          .waitFor({ timeout: 60_000 })
          .catch(() => {});
        const found = await page.locator(surface.readySelector).count();
        if (found < surface.minMatches) {
          failures.push(
            `${label}: only ${found} of ${surface.minMatches} expected elements ` +
              `("${surface.readySelector}") — the page did not render (landed on ${page.url()})`,
          );
          console.log(`    ✗ ${view.name} — ${found}/${surface.minMatches} expected elements`);
          await page.close();
          continue;
        }

        // A public page audited signed-out must still be the public page. If the
        // proxy ever started bouncing it to sign-in, the readiness selector might
        // still match something and the audit would pass on the wrong document.
        if (!surface.authenticated && new URL(page.url()).pathname !== `${BASE_PATH}${surface.path}`) {
          failures.push(`${label}: redirected to ${page.url()} — public surfaces must render signed-out`);
          console.log(`    ✗ ${view.name} — redirected to ${page.url()}`);
          await page.close();
          continue;
        }

        await audit(
          page,
          axeSource,
          label,
          `${view.name} — ${found} elements at ${view.viewport.width}px`,
          surface.axeInclude,
        );
        await page.close();
      }
    }

    console.log("  · onboarding wizard (S2)");
    await auditWizard(anonymous, axeSource, PHONE);
  } finally {
    await browser.close();
  }
}

async function cleanup() {
  try {
    for (const tenantId of createdTenantIds) {
      await db.tenantConfigEntry.deleteMany({ where: { tenantId } });
      await db.tenantEntitlement.deleteMany({ where: { tenantId } });
      await db.tenant.delete({ where: { id: tenantId } });
    }
    for (const tokenHash of createdTokenHashes) {
      await db.onboardingToken.deleteMany({ where: { tokenHash } });
    }
  } catch (error) {
    failures.push(`cleanup failed: ${error?.message ?? error}`);
  }
  await db.$disconnect().catch(() => {});
}

main()
  .then(cleanup)
  .then(() => {
    clearTimeout(watchdog);
    shutdown();
    if (failures.length > 0) {
      console.error(`\ncheck-a11y: FAILED\n${failures.map((f) => `  - ${f}`).join("\n")}`);
      process.exit(1);
    }
    const views =
      SURFACES.reduce((sum, surface) => sum + surface.views.length, 0) + WIZARD_STEPS.length + 1;
    console.log(
      `check-a11y: ok (WCAG 2.1 AA — ${TAGS.join(", ")} — ` +
        `${SURFACES.length + 1} surfaces, ${views} views, wizard driven end to end)`,
    );
    process.exit(0);
  })
  .catch(async (error) => {
    await cleanup();
    clearTimeout(watchdog);
    shutdown();
    console.error(`\ncheck-a11y: ${error.message}\n${serverLog.slice(-2000)}`);
    process.exit(1);
  });
