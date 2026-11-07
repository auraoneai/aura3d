// usage: node capture.mjs <distRoot> <outDir> <game,...>
// Static server + headless Chrome (real GPU, ANGLE/Metal) via loopback CDP. No Playwright.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const [dist, out, gamesArg, portArg] = process.argv.slice(2);
const WT = "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_0a753117-9f6-2";
const MAIN = "/Users/gurbakshchahal/platforms/aura3d";
const games = {
  "top-tennis": { route: "showcase-top-tennis", q: "", steps: [{ wait: 8000 }, { key: "Space", wait: 3500 }, { shot: "a" }] },
  "aura-hoops-3d": { route: "showcase-aura-hoops-3d", q: "", steps: [{ wait: 6000 }, { click: "Quick Play", wait: 5000 }, { shot: "a" }] },
  "aura-fc-3d": { route: "showcase-aura-fc-3d", q: "", steps: [{ wait: 6000 }, { click: "Quick Play", wait: 6000 }, { shot: "a" }] },
  "heatsink": { route: "showcase-heatsink", q: "", steps: [{ wait: 6000 }, { key: "Enter", wait: 6000 }, { shot: "a" }] },
  "roadster-rush": { route: "showcase-roadster-rush", q: "?seed=42&capture=1", steps: [{ wait: 14000 }, { shot: "a" }] },
  "the-bellkeepers-walk": { route: "showcase-where-the-wind-wanders-port", q: "", steps: [{ wait: 8000 }, { click: "Begin the walk", wait: 6000 }, { shot: "a" }] }
};
const gameRoute = Object.values(games).find(g => dist.endsWith(g.route))?.route;
const roots = [dist, ...(gameRoute ? [path.join(MAIN, "apps", gameRoute, "public"), path.join(WT, "apps", gameRoute, "public")] : []), path.join(MAIN, "public"), path.join(WT, "public"), path.join(WT, "marketing/public"), path.join(MAIN, "fixtures")];
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".hdr": "application/octet-stream", ".woff2": "font/woff2", ".ktx2": "application/octet-stream" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const r of roots) {
    let f = path.join(r, p);
    if (!f.startsWith(r)) continue;
    try {
      if (fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
      const buf = fs.readFileSync(f);
      if (buf.length < 200 && buf.toString().startsWith("version https://git-lfs")) continue;
      res.writeHead(200, { "content-type": mime[path.extname(f)] ?? "application/octet-stream", "cache-control": "no-store" });
      return res.end(buf);
    } catch {}
  }
  res.writeHead(404); res.end("nf");
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const sport = server.address().port;
const cdpPort = Number(portArg ?? 9322);
const profile = fs.mkdtempSync("/tmp/contact-chrome-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal",
  "--window-size=1280,800", "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ver;
for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json(); break; } catch { await sleep(200); } }
fs.mkdirSync(out, { recursive: true });
const report = {};
try {
  for (const name of gamesArg.split(",")) {
    const g = games[name];
    const tab = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener("open", r));
    let id = 0; const pend = new Map(); const logs = [];
    ws.addEventListener("message", e => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      else if (m.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(m.params.type)) logs.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
      else if (m.method === "Runtime.exceptionThrown") logs.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJs = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
    await send("Runtime.enable"); await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: `http://127.0.0.1:${sport}/apps/${g.route}/${g.q}` });
    const info = {};
    for (const s of g.steps) {
      if (s.click) {
        const ok = await evalJs(`(() => { const el=[...document.querySelectorAll('button,a,[role=button]')].find(e=>e.textContent.trim().toLowerCase().includes(${JSON.stringify(s.click.toLowerCase())})); if(el){el.click();return true} return false })()`);
        info["click:" + s.click] = ok;
      }
      if (s.key) {
        for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: s.key === "Space" ? " " : s.key, code: s.key, windowsVirtualKeyCode: s.key === "Enter" ? 13 : 32 });
      }
      if (s.wait) await sleep(s.wait);
      if (s.shot) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(shot.result.data, "base64"));
      }
    }
    info.renderer = await evalJs(`(() => { const c=document.createElement('canvas').getContext('webgl2'); const e=c&&c.getExtension('WEBGL_debug_renderer_info'); return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'?' })()`);
    info.logs = [...new Set(logs)].slice(0, 12);
    report[name] = info;
    ws.close();
    await fetch(`http://127.0.0.1:${cdpPort}/json/close/${tab.id}`);
  }
} finally {
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  chrome.kill(); server.close();
}
console.log(JSON.stringify(report, null, 2));
