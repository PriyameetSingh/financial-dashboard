import { spawn } from "node:child_process";
import { request } from "node:http";
import { chromium } from "playwright-core";
const PORT = 8796, HOST = "demo.airawat.test", BASE = "/hudd-dashboard";
const server = spawn("npx", ["next", "dev", "-p", String(PORT)], { detached: true, stdio: ["ignore","pipe","pipe"] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = (p, host = HOST) => new Promise((res, rej) => {
  const r = request({ hostname:"127.0.0.1", port:PORT, path:BASE+p, headers:{host} }, x => {
    let b=""; x.setEncoding("utf8"); x.on("data",c=>b+=c);
    x.on("end",()=>res({status:x.statusCode, body:b, setCookie:x.headers["set-cookie"]??[]}));
  }); r.on("error",rej); r.setTimeout(60000,()=>r.destroy(new Error("t"))); r.end();
});
try {
  for (let i=0;i<120;i++){ try { if ((await get("/api/health")).status===200) break; } catch {} await sleep(1000); }
  const s = await get("/api/dev/session?tenant=demo");
  const c = (s.setCookie[0]??"").split(";")[0];
  const [n, ...rest] = c.split("=");
  const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium",
    args:[`--host-resolver-rules=MAP *.airawat.test 127.0.0.1`,"--proxy-server=direct://","--proxy-bypass-list=*"] });
  const ctx = await b.newContext();
  await ctx.addCookies([{name:n, value:rest.join("="), domain:HOST, path:"/", httpOnly:true, sameSite:"Lax"}]);
  for (const path of ["/kpis/entry","/financial/entry/scheme","/financial/entry/bulk"]) {
    const page = await ctx.newPage();
    await page.goto(`http://${HOST}:${PORT}${BASE}${path}`, {waitUntil:"load", timeout:120000});
    await sleep(6000);
    const info = await page.evaluate(() => {
      const main = document.querySelector(".noct main") || document.querySelector("main");
      const text = (main?.innerText ?? "").replace(/\s+/g," ").slice(0, 220);
      const tags = {};
      for (const el of main?.querySelectorAll("*") ?? []) tags[el.tagName] = (tags[el.tagName]??0)+1;
      const top = Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,8);
      return { url: location.pathname, text, top };
    });
    console.log(JSON.stringify(info));
    await page.close();
  }
  await b.close();
} catch(e){ console.error("ERR", e.message); }
finally { try { process.kill(-server.pid); } catch {} }
