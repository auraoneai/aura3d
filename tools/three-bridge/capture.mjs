// Paired-frame capture (adapted from the census driver): one headless Chrome (ANGLE Metal, real GPU) per page,
// waits for window.__BRIDGE_READY__, screenshots, logs console errors.
// usage: node capture.mjs <baseUrl> <outDir> <cdpPort> [recipe...]
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const [base, out, port, ...only] = process.argv.slice(2);
const recipes = only.length ? only : ["tree-grove", "city-block", "stylized-car", "windmill", "shader-kiosk"];
// PAIR_TIME=1: capture the Aura3D side first, read the clock it froze at (window.__BRIDGE_TIME__), and pose the
// three.js original at that time (?t=), so animated pairs compare the same instant. SUFFIX names a capture set.
const pairTime = process.env.PAIR_TIME === "1";
const suffix = process.env.SUFFIX ? `.${process.env.SUFFIX}` : "";
const query = process.env.QUERY ? `&${process.env.QUERY}` : "";
const sides = (process.env.SIDES ?? "three,aura").split(",");
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(url, file) {
  const prof = `/tmp/three-bridge-prof-${port}`;
  rmSync(prof, { recursive: true, force: true });
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", "--window-size=960,540",
    "--use-angle=metal", "--ignore-gpu-blocklist", "--disable-extensions", "--no-first-run", ...(process.env.CHROME_EXTRA ? process.env.CHROME_EXTRA.split(" ") : []), "about:blank"], { stdio: "ignore", detached: true });
  const kill = () => { try { process.kill(-chrome.pid, "SIGKILL"); } catch {} };
  try {
    let targets = [];
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(250); }
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const pend = new Map(); const errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
      if (d.method === "Network.loadingFailed") errors.push(`netfail: ${d.params.errorText} ${d.params.requestId}`);
      if (d.method === "Network.responseReceived" && d.params.response.status >= 400) errors.push(`http ${d.params.response.status} ${d.params.response.url}`);
      if (d.method === "Log.entryAdded") errors.push(`log ${d.params.entry.level}: ${d.params.entry.text.slice(0, 200)}`);
      if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
      if (d.method === "Runtime.consoleAPICalled" && (process.env.ALLLOG || d.params.type === "error" || d.params.type === "warning")) errors.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300)}`);
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable"); await send("Log.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    let ready = false;
    const t0 = Date.now(); for (let i = 0; i < Number(process.env.WAIT_TICKS ?? 360) && !ready; i++) { await sleep(250); ready = (await send("Runtime.evaluate", { expression: "window.__BRIDGE_READY__ === true", returnByValue: true })).result?.result?.value === true; }
    await sleep(500);
    if (!ready) errors.push("NOT READY: " + (await send("Runtime.evaluate", { expression: "JSON.stringify({canvases:document.querySelectorAll('canvas').length,html:document.body.innerHTML.slice(0,400),state:window.__BRIDGE_STATE__??null,diag:(()=>{try{const a=window.__app;const d=a.diagnostics?.();return JSON.stringify({renderer:d.renderer,renderPath:d.renderPath,frame:d.frame,frameTiming:d.frameTiming,quality:d.quality,resolution:d.resolution}).slice(0,4000)}catch(e){return String(e)}})()})", returnByValue: true })).result?.result?.value);
    const gpu = (await send("Runtime.evaluate", { expression: "(()=>{const g=document.createElement('canvas').getContext('webgl2');const e=g&&g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):''})()", returnByValue: true })).result?.result?.value;
    if (process.env.DIAG_EXPR) errors.push("diag: " + (await send("Runtime.evaluate", { expression: process.env.DIAG_EXPR, returnByValue: true })).result?.result?.value);
    const time = (await send("Runtime.evaluate", { expression: "window.__BRIDGE_TIME__ ?? null", returnByValue: true })).result?.result?.value;
    const clips = (await send("Runtime.evaluate", { expression: "JSON.stringify(window.__BRIDGE_CLIPS__ ?? {})", returnByValue: true })).result?.result?.value;
    const animation = (await send("Runtime.evaluate", { expression: "JSON.stringify(window.__BRIDGE_ANIMATION__ ?? null)", returnByValue: true })).result?.result?.value;
    const png = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(png.result.data, "base64"));
    ws.close();
    return { url, ready, gpu, errors, readyMs: Date.now() - t0, time, clips, animation };
  } finally { kill(); }
}

const log = [];
for (const recipe of recipes) {
  let t = 0, clips = "{}";
  for (const side of pairTime ? ["aura", "three"] : sides) {
    const r = await shot(`${base}/${side}.html?recipe=${recipe}${query}${side === "three" && pairTime ? `&t=${t}&clips=${encodeURIComponent(clips)}` : ""}`, `${out}/${recipe}${suffix}.${side}.png`);
    if (side === "aura" && typeof r.time === "number") { t = r.time; clips = r.clips ?? "{}"; }
    log.push({ recipe, side, ...r });
    console.log(recipe, side, "ready", r.ready, `${r.readyMs}ms`, "gpu", String(r.gpu).slice(0, 50), "errors", r.errors.length, r.errors.slice(0, 3).join(" | ").slice(0, 400));
  }
}
writeFileSync(`${out}/capture${suffix}.json`, JSON.stringify(log, null, 1));
process.exit(0);
