// usage: node capture.mjs <distRoot> <outDir> <game,...>
// Static server + headless Chrome (real GPU, ANGLE/Metal) via loopback CDP. No Playwright.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const [dist, out, gamesArg, portArg] = process.argv.slice(2);
const WT = process.cwd();
const MAIN = "/Users/gurbakshchahal/platforms/aura3d";
const games = {
  "top-tennis": { route: "showcase-top-tennis", q: "", steps: [{ tick: 480 }, { key: "Space", tick: 210 }, { shot: "a" }] },
  "aura-hoops-3d": { route: "showcase-aura-hoops-3d", q: "", steps: [{ tick: 360 }, { click: "Quick Play", tick: 300 }, { shot: "a" }] },
  "aura-fc-3d": { route: "showcase-aura-fc-3d", q: "", steps: [{ tick: 360 }, { click: "Quick Play", tick: 360 }, { shot: "a" }] },
  "heatsink": { route: "showcase-heatsink", q: "", steps: [{ tick: 360 }, { key: "Enter", tick: 360 }, { shot: "a" }] },
  "roadster-rush": { route: "showcase-roadster-rush", q: "?seed=42&capture=1", steps: [{ tick: 840 }, { shot: "a" }] },
  "the-bellkeepers-walk": { route: "showcase-where-the-wind-wanders-port", q: "", steps: [{ tick: 480 }, { click: "Begin the walk", tick: 360 }, { shot: "a" }] }
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
const SHIM = fs.readFileSync("/tmp/fxc-shim.js", "utf8");
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
      else if (m.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(m.params.type)) logs.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 2500)}`);
      else if (m.method === "Runtime.exceptionThrown") logs.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 2500));
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJs = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
    await send("Runtime.enable"); await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM + "globalThis.__A3D_CONTACT_PROBE__=true;" + (process.env.OVERRIDE ? "globalThis.__A3D_CONTACT_OVERRIDE__=" + process.env.OVERRIDE + ";" : "") });
    await send("Page.navigate", { url: `http://127.0.0.1:${sport}/apps/${g.route}/${g.q}` });
    const info = {}; let ticked = false;
    for (const s of g.steps) {
      if (s.click) {
        const ok = await evalJs(`(() => { const el=[...document.querySelectorAll('button,a,[role=button]')].find(e=>e.textContent.trim().toLowerCase().includes(${JSON.stringify(s.click.toLowerCase())})); if(el){el.click();return true} return false })()`);
        info["click:" + s.click] = ok;
      }
      if (s.key) {
        for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: s.key === "Space" ? " " : s.key, code: s.key, windowsVirtualKeyCode: s.key === "Enter" ? 13 : 32 });
      }
      if (s.wait) await sleep(s.wait);
      if (s.tick) { if (!ticked) { await sleep(5000); ticked = true; } for (let k = 0; k < s.tick; k += 10) { await evalJs("(()=>{for(let i=0;i<10;i++)window.__vt.frame(1000/60)})()"); await sleep(12); } await sleep(600); await evalJs("window.__vt.frame(1000/60)"); }
      if (s.shot) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(shot.result.data, "base64"));
      }
    }
    info.contact = await evalJs(`(() => { try { const a = __AURA3D_LIVE_APPS__.all()[0]; const d = a.diagnostics(); const l = d.lighting ?? d; const c = (a.lighting && a.lighting.diagnostics ? a.lighting.diagnostics().contactShadows : null) ?? Object.keys(a).slice(0,60); return JSON.parse(JSON.stringify(c ?? Object.keys(d))); } catch (e) { return String(e); } })()`);
    const dump = await evalJs(`(() => { const d = globalThis.__A3D_CONTACT_MASK_DUMP__; if (!d) return null; let s = ''; const px = d.px; const out = new Uint8Array(d.w * d.h); for (let i = 0; i < out.length; i++) out[i] = px[i * 4]; for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode.apply(null, out.subarray(i, i + 8192)); return { w: d.w, h: d.h, b64: btoa(s) }; })()`);
    if (dump) { fs.writeFileSync(path.join(out, `${name}-mask.gray`), Buffer.from(dump.b64, "base64")); info.maskSize = [dump.w, dump.h]; }
    info.renderer = await evalJs(`(() => { const c=document.createElement('canvas').getContext('webgl2'); const e=c&&c.getExtension('WEBGL_debug_renderer_info'); return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'?' })()`);
    info.logs = [...new Set(logs)].slice(0, 12);
    report[name] = info;
    ws.close();
    await fetch(`http://127.0.0.1:${cdpPort}/json/close/${tab.id}`);
  }
} finally {
  fs.writeFileSync(path.join(out, "report-det.json"), JSON.stringify(report, null, 2));
  chrome.kill(); server.close();
}
console.log(JSON.stringify(report, null, 2));
