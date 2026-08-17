import { spawn } from "node:child_process";
import { request } from "node:http";
import { chromium } from "playwright-core";
const PORT = 8797, HOST = "odisha.airawat.test", BASE = "/hudd-dashboard";
const server = spawn("npx", ["next", "dev", "-p", String(PORT)], { detached: true, stdio: ["ignore","pipe","pipe"] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = (p) => new Promise((res, rej) => {
  const r = request({ hostname: "127.0.0.1", port: PORT, path: BASE + p, headers: { host: HOST } }, (x) => {
    let b = ""; x.setEncoding("utf8"); x.on("data", c => b += c);
    x.on("end", () => res({ status: x.statusCode, body: b, setCookie: x.headers["set-cookie"] ?? [] }));
  }); r.on("error", rej); r.setTimeout(30000, () => r.destroy(new Error("t"))); r.end();
});
try {
  for (let i = 0; i < 90; i++) { try { if ((await get("/api/health")).status === 200) break; } catch {} await sleep(1000); }
  const s = await get("/api/dev/session?tenant=odisha");
  const c = (s.setCookie[0] ?? "").split(";")[0];
  const [name, ...rest] = c.split("=");
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: [`--host-resolver-rules=MAP *.airawat.test 127.0.0.1`, "--proxy-server=direct://", "--proxy-bypass-list=*"] });
  const ctx = await b.newContext();
  await ctx.addCookies([{ name, value: rest.join("="), domain: HOST, path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  await page.addInitScript(() => window.localStorage.setItem("airawat-theme", "light"));
  await page.goto(`http://${HOST}:${PORT}${BASE}/admin/masters`, { waitUntil: "load", timeout: 120000 });
  await page.locator(".noct .ax-nav .ax-nav-item").first().waitFor({ timeout: 60000 }).catch(()=>{});
  await sleep(2000);
  const out = await page.evaluate(() => {
    const el = document.querySelector('[class*="sidebar-active-bg"] .truncate');
    if (!el) return "not found";
    const cs = getComputedStyle(el);
    const aside = document.querySelector("aside[data-theme]");
    const asideCs = aside ? getComputedStyle(aside) : null;
    return {
      color: cs.color,
      inherited: getComputedStyle(el.parentElement).color,
      sidebarTextPrimary: asideCs?.getPropertyValue("--sidebar-text-primary"),
      colorTextAtAside: asideCs?.getPropertyValue("--color-text"),
      asideTheme: aside?.getAttribute("data-theme"),
      linkColor: getComputedStyle(el.closest("a")).color,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
} catch (e) { console.error("ERR", e.message); }
finally { try { process.kill(-server.pid); } catch {} }
