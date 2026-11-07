// A4 GLSL-vs-portable pixel-diff harness. Real GPU (headless Chrome, ANGLE/Metal) over loopback CDP, virtual clock (shim.js).
// usage: node run.mjs <pilot> <baseUrl> <readyExpr> <settleExpr> <outDir> [extraFlags="--enable-gpu --use-angle=metal"] [region=x,y,w,h] [variants=glsl,glsl2,portable]
//  variants: glsl = url as given, glsl2 = same url again (noise floor), portable = url + &portable=1 (`+extra` appends e.g. backend=webgpu)
// Each variant runs in a fresh Chrome with the same virtual clock schedule, so the only difference is the material.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [pilot, baseUrl, readyExpr, settleArg, outDir] = process.argv.slice(2);
// a settle argument starting with "@" is a file of page JavaScript (relative to this tools dir or absolute)
const settleExpr = settleArg.startsWith("@") ? fs.readFileSync(path.resolve(here, settleArg.slice(1)), "utf8") : settleArg;
const extraFlags = (process.argv[7] || "--enable-gpu --use-angle=metal").split(" ").filter(Boolean);
const region = (process.argv[8] || "").split(",").map(Number);
const variants = (process.argv[9] || "glsl,glsl2,portable").split(",");
const W = 1280, H = 720, DT = 1000 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

async function session(fn, extra = []) {
  const port = 9700 + Math.floor(Math.random() * 250);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/a4-chrome-${port}`, `--window-size=${W},${H}`, "--ignore-gpu-blocklist", "--no-first-run", ...extraFlags, ...extra, "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0; const pend = new Map(); const logs = [];
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled") logs.push(d.params.type + ": " + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)); else if (d.method === "Runtime.exceptionThrown") logs.push("EXC: " + JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
    const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
    await send("Runtime.enable"); await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    return await fn({ send, ev, logs, ws });
  } finally { chrome.kill(); }
}

const shots = {}, probes = {};
for (const v of variants) {
  const url = v === "portable" ? baseUrl + (baseUrl.includes("?") ? "&" : "?") + "portable=1" : v.startsWith("portable+") ? baseUrl + "&portable=1&" + v.slice(9) : baseUrl;
  await session(async ({ send, ev, logs }) => {
    await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(here, "shim.js"), "utf8") });
    await send("Page.navigate", { url });
    let ok = false;
    for (let i = 0; i < 6000; i++) {
      ok = await ev(`(window.__vt.frame(${DT}), !!(${readyExpr}))`).catch(() => false);
      if (ok) break; await sleep(i < 50 ? 50 : 8);
    }
    if (!ok) { console.error(v, "NOT READY", logs.slice(-6)); }
    await ev(`(async()=>{ ${settleExpr} })()`);
    // equalise the virtual clock: every variant is captured at the same absolute virtual time (frame-count differences before ready cannot leak in)
    while (await ev(`window.__vt.now`) < 5000) { await ev(`window.__vt.frame(${DT})`); await sleep(3); }
    await sleep(1500);
    const info = await ev(`(() => { const c = document.querySelector("canvas"); return { backend: window.__a4backend || null, canvases: document.querySelectorAll("canvas").length, vt: window.__vt.now }; })()`);
    if (process.env.A4_PROBE) { const pr = await ev(fs.readFileSync(path.resolve(here, process.env.A4_PROBE), "utf8")).catch((e) => String(e).slice(0, 300)); probes[v] = pr; console.error(v, "probe", JSON.stringify(pr).slice(0, 600)); }
    const s = await send("Page.captureScreenshot", { format: "png" });
    shots[v] = s.result.data;
    fs.writeFileSync(path.join(outDir, `${pilot}-${v.replace("+", "_")}.png`), Buffer.from(s.result.data, "base64"));
    const errs = logs.filter((l) => /^(EXC|error|warning)/.test(l)).slice(-8);
    console.error(v, "captured", JSON.stringify(info), errs.length ? JSON.stringify(errs) : "");
  });
}

// pixel diff in a fresh page (decode both PNGs on a canvas)
const names = Object.keys(shots);
const base = shots.glsl;
const result = { pilot, baseUrl, probes, size: [W, H], clock: `virtual ${DT.toFixed(3)} ms frames`, compare: {} };
await session(async ({ ev }) => {
  for (const other of names.filter((n) => n !== "glsl")) {
    result.compare[`glsl-vs-${other}`] = await ev(`(async () => {
      const load = (b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + b; });
      const px = async (b) => { const i = await load(b); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: g.getImageData(0, 0, i.width, i.height).data }; };
      const A = await px(${JSON.stringify(base)}), B = await px(${JSON.stringify(shots[other])});
      const reg = ${JSON.stringify(region)};
      const stat = (x0, y0, x1, y1) => { let sum = 0, max = 0, n = 0, changed = 0, over4 = 0, over16 = 0, sumChanged = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * A.w + x) * 4; let m = 0; for (let k = 0; k < 3; k++) { const d = Math.abs(A.d[i + k] - B.d[i + k]); sum += d; if (d > m) m = d; } n++; if (m > max) max = m; if (m > 0) { changed++; sumChanged += m; } if (m > 4) over4++; if (m > 16) over16++; } return { pixels: n, meanAbsDiff255: +(sum / (n * 3)).toFixed(4), maxDiff255: max, changedPct: +(100 * changed / n).toFixed(3), over4Pct: +(100 * over4 / n).toFixed(3), over16Pct: +(100 * over16 / n).toFixed(3) }; };
      const out = { full: stat(0, 0, A.w, A.h) };
      if (reg.length === 4 && !reg.some(Number.isNaN)) out.region = Object.assign({ rect: reg }, stat(reg[0], reg[1], reg[0] + reg[2], reg[1] + reg[3]));
      const dc = document.createElement("canvas"); dc.width = A.w; dc.height = A.h; const dg = dc.getContext("2d"); const di = dg.createImageData(A.w, A.h);
      for (let i = 0; i < A.d.length; i += 4) { for (let k = 0; k < 3; k++) di.data[i + k] = Math.min(255, Math.abs(A.d[i + k] - B.d[i + k]) * 8); di.data[i + 3] = 255; }
      dg.putImageData(di, 0, 0); out.diffPng = dc.toDataURL("image/png").split(",")[1];
      return out; })()`);
    fs.writeFileSync(path.join(outDir, `${pilot}-diffx8-${other.replace("+", "_")}.png`), Buffer.from(result.compare[`glsl-vs-${other}`].diffPng, "base64")); delete result.compare[`glsl-vs-${other}`].diffPng;
  }
});
fs.writeFileSync(path.join(outDir, `${pilot}-diff.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(0);
