// Deterministic real-GPU frame capture of live games: virtual clock (shim.js), headless Chrome on Metal via loopback CDP.
// usage: node capture-games.mjs <out-dir> <label> <baseUrl> <game-slug>[,<game-slug>...] [frames=240] [hz=60]
// Each frame is verified to be a real game frame: right URL, a visible canvas >= 600 px wide, not black (mean luma and
// stddev over the screenshot) and a page that is not the marketing site. Holds /tmp/a3d-rea.lock only while one game is captured.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [outDir, label, baseUrl, slugs] = process.argv.slice(2);
const FRAMES = Number(process.argv[6] || 240), HZ = Number(process.argv[7] || 60);
const W = 1280, H = 720, dt = 1000 / HZ;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });
async function lock() { for (;;) { try { fs.mkdirSync("/tmp/a3d-rea.lock"); return; } catch { await sleep(3000); } } }
function unlock() { try { fs.rmdirSync("/tmp/a3d-rea.lock"); } catch {} }

async function captureOne(slug) {
  await lock();
  const port = 9700 + Math.floor(Math.random() * 250);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/buf515-chrome-${port}`, `--window-size=${W},${H}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0; const pend = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
    const consoleErrors = [];
    const rawOnMessage = ws.onmessage;
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.method === "Runtime.consoleAPICalled" && (d.params.type === "error" || d.params.type === "warning")) consoleErrors.push(`${d.params.type}: ` + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
      if (d.method === "Runtime.exceptionThrown") consoleErrors.push("exception: " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 600));
      rawOnMessage(m);
    };
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
    await send("Page.navigate", { url: `${baseUrl}/apps/${slug}/` });
    // Assets load in real time while the virtual clock advances; then an exact frame count is stepped.
    for (let i = 0; i < 400; i++) { await ev(`window.__vt && window.__vt.frame(${dt})`).catch(() => {}); await sleep(25); }
    for (let i = 0; i < FRAMES; i++) { await ev(`window.__vt.frame(${dt})`); if (i % 8 === 0) await sleep(5); }
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const png = shot.result.data;
    const verdict = await ev(`(async () => {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64,${png}"; });
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += y; s2 += y * y; }
      const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      const cv = [...document.querySelectorAll("canvas")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      // Central 40% x 40% of the screenshot: the game view, away from edge HUD panels.
      const x0 = Math.floor(c.width * 0.3), y0 = Math.floor(c.height * 0.3), cw = Math.floor(c.width * 0.4), ch = Math.floor(c.height * 0.4);
      const cd = g.getImageData(x0, y0, cw, ch).data; let cs = 0, cs2 = 0; const cn = cd.length / 4;
      for (let i = 0; i < cd.length; i += 4) { const y = 0.2126 * cd[i] + 0.7152 * cd[i + 1] + 0.0722 * cd[i + 2]; cs += y; cs2 += y * y; }
      const cmean = cs / cn, csd = Math.sqrt(Math.max(0, cs2 / cn - cmean * cmean));
      return { href: location.href, title: document.title, canvases: cv, mean, sd, centerMean: cmean, centerSd: csd, vnow: window.__vt.now };
    })()`);
    verdict.slug = slug; verdict.label = label; verdict.frames = FRAMES; verdict.hz = HZ;
    verdict.consoleErrors = consoleErrors.slice(0, 12);
    verdict.real = verdict.href.includes(`/apps/${slug}/`) && verdict.canvases.some(([w, h]) => w >= 600 && h >= 300) && verdict.centerMean > 4 && verdict.centerSd > 6;
    fs.writeFileSync(path.join(outDir, `${slug}.${label}.png`), Buffer.from(png, "base64"));
    fs.writeFileSync(path.join(outDir, `${slug}.${label}.json`), JSON.stringify(verdict, null, 1));
    console.log(JSON.stringify(verdict));
    ws.close();
  } finally { chrome.kill(); unlock(); }
}
for (const slug of slugs.split(",")) { try { await captureOne(slug); } catch (e) { console.log(JSON.stringify({ slug, label, error: String(e).slice(0, 300) })); } }
process.exit(0);
