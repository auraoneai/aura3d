// usage: node dpr-probe.mjs <baseUrl> <out-dir> <mode: attenuated|fixed|stream>
// Renders the probe page at dpr 1 and dpr 2 (same 640x360 CSS canvas), screenshots, and reports the lit-pixel footprint.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [baseUrl, outDir, mode] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function lock() { for (;;) { try { fs.mkdirSync("/tmp/a3d-rea.lock"); return; } catch { await sleep(3000); } } }
const results = {};
for (const dpr of [1, 2]) {
  await lock();
  const port = 9300 + Math.floor(Math.random() * 300);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/buf515-dpr-${port}`, "--window-size=640,360", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
  try {
    let targets;
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let n = 0; const pend = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 640, height: 360, deviceScaleFactor: dpr, mobile: false });
    await send("Page.navigate", { url: `${baseUrl}/evidence/buffers-515/dpr-probe/index.html?mode=${mode}` });
    let done;
    for (let i = 0; i < 600 && !done; i++) { done = await ev("window.__done || null").catch(() => null); await sleep(100); }
    if (!done) throw new Error("probe did not finish");
    await sleep(300);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, `${mode}-dpr${dpr}.png`), Buffer.from(shot.result.data, "base64"));
    const stats = await ev(`(async () => {
      const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64,${shot.result.data}"; });
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0, sum = 0;
      for (let i = 0; i < d.length; i += 4) { const y = (d[i] + d[i + 1] + d[i + 2]) / 3; if (y > 64) lit++; sum += y; }
      return { imgW: img.width, imgH: img.height, lit, meanLuma: sum / (d.length / 4) };
    })()`);
    results[`dpr${dpr}`] = { ...done, ...stats, litCssPx: stats.lit / (dpr * dpr) };
    ws.close();
  } finally { chrome.kill(); try { fs.rmdirSync("/tmp/a3d-rea.lock"); } catch {} }
}
console.log(JSON.stringify({ mode, ...results, ratioLitCssPx: results.dpr2.litCssPx / results.dpr1.litCssPx }));
process.exit(0);
