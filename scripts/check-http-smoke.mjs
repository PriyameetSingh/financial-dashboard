#!/usr/bin/env node
/**
 * HTTP smoke leg — the middleware/priming layer, over a real socket.
 *
 * Every other golden leg is either static analysis or a DB-level assertion that
 * establishes tenant scope through `withTenantContext` (AsyncLocalStorage).
 * Neither shape can see the layer between the socket and the query, and TWO
 * production defects have now lived exactly there:
 *
 *   1. The app root never entered proxy.ts at all (the matcher's trailing group
 *      is required, so `/hudd-dashboard` matched nothing) — it bypassed the
 *      Phase 2 tenant-session binding.
 *   2. The request-scoped holder is backed by React `cache()`, which does not
 *      memoise outside a render scope. In Route Handlers the resolver primed a
 *      throwaway object, so EVERY authenticated /api/v1 request died with
 *      TenantScopeError. The suite never saw it because it primes via ALS.
 *
 * So this leg boots the app and drives it with real cookies:
 *
 *   A. unauthenticated app root       → redirect to /login  (proxy runs at all)
 *   B. primed request, allowed route  → 200 AND tenant-correct payload
 *   C. primed request, disabled module→ 404 on API and page (entitlement gate)
 *   D. interleaved concurrent requests→ no cross-tenant bleed
 *   E. generated PDF/XLSX            → carry the REQUESTING tenant's branding,
 *                                      not the Odisha defaults (report filename
 *                                      prefix and PDF header line), which is
 *                                      what proves `withRequestTenantScope`
 *                                      repairs the sync `tenantConfig()` reads
 *                                      buried in the document renderers
 *
 * Sessions come from the dev-only minting route (app/api/v1/../api/dev/session),
 * which is why this runs `next dev`: `process.env.NODE_ENV` is inlined at build
 * time, so that route is dead-code-eliminated from a production build. That is
 * a deliberate safety property, not a workaround — the endpoint cannot exist in
 * a deployed artifact.
 *
 * Preconditions: a reachable dev database (.env.local) seeded with BOTH tenants
 * — `prisma migrate deploy` then `node --env-file=.env.local
 * prisma/seed_demo_tenant.js`.
 *
 * Run: node scripts/check-http-smoke.mjs
 */
import { spawn } from "node:child_process";
import { request } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { extractPdfText } from "./lib/pdf-text.mjs";

const PORT = Number(process.env.SMOKE_PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}/hudd-dashboard`;
const ODISHA_HOST = "odisha.airawat.test";
const DEMO_HOST = "demo.airawat.test";
/** Disabled for the demo tenant by prisma/seed_demo_tenant.js. */
const DISABLED_API = "/api/v1/notifications";
const DISABLED_PAGE = "/admin/notifications";
const ALLOWED_API = "/api/v1/kpis/definitions";
const WATCHDOG_MS = Number(process.env.SMOKE_WATCHDOG_MS ?? 300_000);

const failures = [];
function check(name, ok, detail) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name} — ${detail}`);
    failures.push(`${name}: ${detail}`);
  }
}

// `detached` so the whole process group can be signalled on the way out. `npx
// next dev` is a shim that forks the real server, and killing only the shim
// leaves `next-server` alive holding the port. That was survivable while this
// was the last leg of the golden; it is not survivable now that check-a11y runs
// after it and boots a dev server of its own, because Next 16 refuses to start
// a second one while any is running.
const server = spawn(
  "npx",
  ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"],
  { env: { ...process.env, DEV_AUTH_ENABLED: "1" }, stdio: ["ignore", "pipe", "pipe"], detached: true },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

function shutdown() {
  try {
    // Negative pid: the whole process group, not just the shim.
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

// Overall watchdog. A golden leg must fail rather than stall the harness.
const watchdog = setTimeout(() => {
  console.error(`\ncheck-http-smoke: exceeded ${WATCHDOG_MS / 1000}s — aborting.\n${serverLog.slice(-2000)}`);
  shutdown();
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

/**
 * `node:http` rather than `fetch`: tenant resolution is driven by the Host
 * header, and `fetch` treats `host` as a forbidden header and silently drops
 * it — every request would resolve to no tenant and 401, testing nothing.
 */
/**
 * `next dev` compiles each route on first hit and can drop the socket while it
 * does, so transient resets are retried. A retry cannot mask a real failure
 * here: every assertion is about a status code or a payload, both of which come
 * from a completed response.
 */
async function get(path, opts = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await getOnce(path, opts);
    } catch (error) {
      lastError = error;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

function getOnce(path, { host, cookie } = {}) {
  const headers = { host: host ?? ODISHA_HOST };
  if (cookie) headers.cookie = cookie;
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port: PORT, path: `/hudd-dashboard${path}`, method: "GET", headers },
      (res) => {
        // latin1, not utf8: PDF/XLSX bodies are binary, and latin1 keeps
        // every byte addressable so embedded ASCII text stays greppable.
        let body = "";
        res.setEncoding("latin1");
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            disposition: res.headers["content-disposition"],
            setCookie: res.headers["set-cookie"] ?? [],
            body,
            json: () => {
              try {
                return JSON.parse(body);
              } catch {
                return null;
              }
            },
          }),
        );
      },
    );
    // node:http has NO default timeout: without this a server that accepts the
    // socket and never answers would hang the golden forever.
    req.setTimeout(30_000, () => {
      req.destroy(new Error(`timeout after 30s: ${path}`));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Mint a session and return the Cookie header value. */
async function mint(host, tenant) {
  const res = await get(`/api/dev/session?tenant=${tenant}`, { host });
  const body = res.json() ?? {};
  if (res.status !== 200 || !body.minted) {
    throw new Error(
      `could not mint a ${tenant} session (${res.status} ${res.body.slice(0, 160)}). ` +
        `Is the dev database migrated and seeded with both tenants?`,
    );
  }
  const value = (res.setCookie[0] ?? "").split(";")[0];
  if (!value.startsWith("authjs.session-token=")) {
    throw new Error(`unexpected session cookie: ${String(res.setCookie[0]).slice(0, 80)}`);
  }
  return value;
}

async function waitForReady() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited early:\n${serverLog.slice(-2000)}`);
    try {
      const res = await getOnce("/api/health");
      if (res.status === 200) return;
    } catch {
      /* not listening yet */
    }
    await sleep(1000);
  }
  throw new Error(`next dev did not become ready on :${PORT}\n${serverLog.slice(-2000)}`);
}

try {
  await waitForReady();

  // ── A. The proxy runs at all, including on the app root ──────────────────
  const root = await get("");
  check(
    "app root redirects to /login when unauthenticated",
    root.status === 307 && (root.location ?? "").includes("/login"),
    `got ${root.status} → ${root.location}`,
  );

  const odisha = await mint(ODISHA_HOST, "odisha");
  const demo = await mint(DEMO_HOST, "demo");

  // ── B. A primed request reaches the handler AND is tenant-scoped ─────────
  const allowed = await get(ALLOWED_API, { host: ODISHA_HOST, cookie: odisha });
  check(
    "primed request to an allowed route returns 200",
    allowed.status === 200,
    `got ${allowed.status} (a 500 here means the request-scoped tenant did not reach the chokepoint)`,
  );

  const meOdisha = (await get("/api/v1/rbac/me", { host: ODISHA_HOST, cookie: odisha })).json();
  const meDemo = (await get("/api/v1/rbac/me", { host: DEMO_HOST, cookie: demo })).json();
  check(
    "each tenant sees its own directory row",
    meOdisha?.user?.dbId && meDemo?.user?.dbId && meOdisha.user.dbId !== meDemo.user.dbId,
    `odisha=${meOdisha?.user?.dbId} demo=${meDemo?.user?.dbId}`,
  );
  check(
    "entitlements are per-tenant (demo lacks the module Odisha has)",
    Array.isArray(meOdisha?.enabledModules) &&
      meOdisha.enabledModules.includes("MOD-NOTIF") &&
      Array.isArray(meDemo?.enabledModules) &&
      !meDemo.enabledModules.includes("MOD-NOTIF"),
    `odisha=${JSON.stringify(meOdisha?.enabledModules)} demo=${JSON.stringify(meDemo?.enabledModules)}`,
  );

  // ── C. The entitlement gate denies, on both surfaces ─────────────────────
  const deniedApi = await get(DISABLED_API, { host: DEMO_HOST, cookie: demo });
  check("disabled module 404s on the API surface", deniedApi.status === 404, `got ${deniedApi.status}`);

  const deniedPage = await get(DISABLED_PAGE, { host: DEMO_HOST, cookie: demo });
  check(
    "disabled module 404s by direct URL on the page surface",
    deniedPage.status === 404,
    `got ${deniedPage.status}`,
  );

  const allowedForOther = await get(DISABLED_API, { host: ODISHA_HOST, cookie: odisha });
  check(
    "the same route is reachable for a tenant that has the module",
    allowedForOther.status === 200,
    `got ${allowedForOther.status}`,
  );

  // ── D. Concurrency: request scope must not bleed between tenants ─────────
  // The tenant now travels on a per-request header, so interleaved traffic is
  // the assertion that matters most.
  const N = 12;
  const interleaved = await Promise.all(
    Array.from({ length: N * 2 }, (_, i) =>
      i % 2 === 0
        ? get("/api/v1/rbac/me", { host: ODISHA_HOST, cookie: odisha }).then((r) => ({ want: "odisha", id: r.json()?.user?.dbId }))
        : get("/api/v1/rbac/me", { host: DEMO_HOST, cookie: demo }).then((r) => ({ want: "demo", id: r.json()?.user?.dbId })),
    ),
  );
  // ── E. Generated artifacts carry the RIGHT TENANT'S branding ─────────────
  // The report routes render through sync `tenantConfig()` reads, deep inside
  // PDF/XLSX builders. Those reads are only correct because the handler wraps
  // its body in withRequestTenantScope — a plain Route Handler cannot hold a
  // request-scoped config. This asserts the wrap, end to end, for a tenant
  // whose branding differs from the Odisha defaults on every key.
  const meetings = (await get("/api/v1/meetings", { host: DEMO_HOST, cookie: demo })).json();
  const meetingId = Array.isArray(meetings) ? meetings[0]?.id : meetings?.meetings?.[0]?.id;
  check("demo tenant has a meeting to report on", Boolean(meetingId), `got ${JSON.stringify(meetings)?.slice(0, 120)}`);

  if (meetingId) {
    const pdf = await get(`/api/v1/reports/meeting/${meetingId}/pdf`, { host: DEMO_HOST, cookie: demo });
    check("report PDF renders for the demo tenant", pdf.status === 200, `got ${pdf.status}`);
    check(
      "PDF filename carries the TENANT's prefix, not the Odisha default",
      (pdf.disposition ?? "").includes("SURYAPUR-meeting-report") &&
        !(pdf.disposition ?? "").includes("HUDD-"),
      `Content-Disposition: ${pdf.disposition}`,
    );
    // PDF text is Flate-compressed, so the raw bytes are not greppable —
    // inflate with the same extractor the vitest branding assertions use.
    const pdfText = extractPdfText(Buffer.from(pdf.body, "latin1"));
    check(
      "PDF body carries the tenant's header line, not Odisha's",
      pdfText.includes("Suryapur Development Authority") && !pdfText.includes("Government of Odisha"),
      `extracted ${pdfText.length} chars; Odisha text present: ${pdfText.includes("Government of Odisha")}`,
    );

    const xlsx = await get(`/api/v1/reports/meeting/${meetingId}/xlsx`, { host: DEMO_HOST, cookie: demo });
    check(
      "XLSX filename carries the tenant's prefix",
      xlsx.status === 200 && (xlsx.disposition ?? "").includes("SURYAPUR-meeting-report"),
      `${xlsx.status} / Content-Disposition: ${xlsx.disposition}`,
    );
  }

  const bled = interleaved.filter((r) =>
    r.want === "odisha" ? r.id !== meOdisha.user.dbId : r.id !== meDemo.user.dbId,
  );
  check(
    `${N * 2} interleaved cross-tenant requests stay scoped`,
    bled.length === 0,
    `${bled.length} response(s) carried the wrong tenant's user`,
  );
} catch (error) {
  failures.push(String(error?.message ?? error));
  console.log(`  ✗ ${error?.message ?? error}`);
} finally {
  shutdown();
}

clearTimeout(watchdog);

if (failures.length > 0) {
  console.error(`\ncheck-http-smoke: FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-http-smoke: ok (proxy reached, request scope primed, entitlement gate enforced, no cross-tenant bleed)");
