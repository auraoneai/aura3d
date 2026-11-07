// No-regression frames: for each game dist, capture base#1, base#2 (noise floor) and branch under the virtual-clock shim on a
// real GPU (headless Chrome, ANGLE/Metal, loopback CDP), then report mean absolute pixel difference.
// usage: node regress.mjs <baseRoot> <branchRoot> <outDir> <game> [game...]   (needs apps/<game>/dist built in both roots)
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const here = path.dirname(fileURLToPath(import.meta.url));
const [baseRoot, branchRoot, outArg, ...games] = process.argv.slice(2);
const outDir = path.resolve(outArg);
fs.mkdirSync(outDir, { recursive: true });
const shim = fs.readFileSync(path.join(here, "shim.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ktx2": "application/octet-stream", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav" };

function serve(dist) {
  const server = http.createServer((req, res) => {
    let p = path.join(dist, decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, ""));
    if (!p.startsWith(dist) || !fs.existsSync(p) || !fs.statSync(p).isFile()) p = path.join(dist, "index.html");
    res.setHeader("content-type", MIME[path.extname(p)] || "application/octet-stream");
    fs.createReadStream(p).pipe(res);
  }).listen(0, "127.0.0.1");
  return new Promise((r) => server.once("listening", () => r({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

async function capture(url, outFile) {
  const port = 9950 + Math.floor(Math.random() * 400);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/reg515-chrome-${port}`, "--window-size=1280,720", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0; const pend = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) return undefined; return r.result.result.value; };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: shim });
    await send("Page.navigate", { url });
    const t0 = Date.now();
    let frames = 0;
    while (Date.now() - t0 < 16000 || frames < 600) { await ev("(() => { for (let i = 0; i < 4; i++) window.__vt.frame(16.667); return 1; })()"); frames += 4; await sleep(12); }
    await ev("(() => { for (let i = 0; i < 240; i++) window.__vt.frame(16.667); return 1; })()");
    const info = await ev("({ title: document.title, canvases: document.querySelectorAll('canvas').length, canvasW: document.querySelector('canvas')?.width, canvasH: document.querySelector('canvas')?.height, text: document.body.innerText.slice(0, 120) })");
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
    ws.close();
    return info;
  } finally { chrome.kill(); }
}

async function raw(file) { const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]); return s / a.data.length; };
function stats(a) {
  let luma = 0, m2 = 0; const n = a.data.length / 3; const colors = new Set();
  for (let i = 0; i < a.data.length; i += 3) { const l = 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2]; luma += l; m2 += l * l; colors.add(((a.data[i] >> 4) << 8) | ((a.data[i + 1] >> 4) << 4) | (a.data[i + 2] >> 4)); }
  const mean = luma / n; return { meanLuma: +mean.toFixed(2), lumaStd: +Math.sqrt(Math.max(0, m2 / n - mean * mean)).toFixed(2), quantizedColors: colors.size };
}

const results = [];
for (const game of games) {
  const base = await serve(path.join(baseRoot, "apps", game, "dist"));
  const branch = await serve(path.join(branchRoot, "apps", game, "dist"));
  const lock = "/tmp/a3d-rea.lock";
  while (true) { try { fs.mkdirSync(lock); break; } catch { await sleep(5000); } }
  const row = { game };
  try {
    row.infoBase1 = await capture(base.url, path.join(outDir, `${game}-base1.png`));
    row.infoBase2 = await capture(base.url, path.join(outDir, `${game}-base2.png`));
    row.infoBranch = await capture(branch.url, path.join(outDir, `${game}-branch.png`));
  } finally { fs.rmSync(lock, { recursive: true, force: true }); base.server.close(); branch.server.close(); }
  const [b1, b2, br] = await Promise.all(["base1", "base2", "branch"].map((k) => raw(path.join(outDir, `${game}-${k}.png`))));
  row.statsBase1 = stats(b1);
  row.statsBranch = stats(br);
  row.madBaseVsBase = +mad(b1, b2).toFixed(4);
  row.madBaseVsBranch = +mad(b1, br).toFixed(4);
  row.madBase2VsBranch = +mad(b2, br).toFixed(4);
  row.realFrame = row.infoBranch?.canvases > 0 && row.statsBranch.lumaStd > 5 && row.statsBranch.quantizedColors > 40 && row.statsBranch.meanLuma > 3;
  console.log(JSON.stringify({ game, title: row.infoBranch?.title, canvases: row.infoBranch?.canvases, ...row.statsBranch, madBaseVsBase: row.madBaseVsBase, madBaseVsBranch: row.madBaseVsBranch, realFrame: row.realFrame }));
  results.push(row);
}
fs.writeFileSync(path.join(outDir, "regression.json"), JSON.stringify(results, null, 2));
process.exit(0);
