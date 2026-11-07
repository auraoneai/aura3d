// Real-GPU (headless Chrome, ANGLE Metal, loopback CDP) frames of the Cross Hop theme ambient emitters, "base" (the
// lane merge-base e5387f3b0 = origin/main before the 5.0.3 merges: 5.0.2 particle lowering, same game and engine
// otherwise) vs the lane branch, with-vs-without the emitter (?diag=1&qaNoAmbient=1). Current origin/main is 89
// commits ahead (5.0.3 engine changes), so the merge-base isolates the lane change.
// "branchpoint" = branch with ?diag=1&qaAmbientPoint=1 (shape/shapeSize dropped: lowers identically to base); that switch
// was temporary and is gone now that ambientNode never authors shape/shapeSize ("branch" on lane HEAD = "branchfixed").
// "branch" frames were captured with the pre-fix authoring (box volume).
// The ambient emitter is mounted only in the diorama look (buildDioramaScene / swapDioramaLook), so every shot forces
// ?look=diorama; the default (vivid) look has no ambient emitter at all, which is why the r2 equal-time frames matched.
// Safe-port pattern from lane/511-look-defaults cap.mjs: Chrome picks its own debugging port in a fresh profile, and a
// frame is refused unless the page URL is the requested route. Virtual clock: games/shim.js (lane/504-bellkeeper).
// usage: node capture-crosshop-ambient.mjs <outDir> <basePort> <branchPort> [themes=0,2,3,4,5] [variants]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [out, basePort, branchPort] = process.argv.slice(2);
const THEMES = (process.argv[5] ?? "0,2,3,4,5").split(",").map(Number);
const VARIANTS = (process.argv[6] ?? "base,base2,basenoamb,branch,branch2,branchnoamb,branchpoint").split(",");
const POST = Number(process.env.POST ?? 300);
fs.mkdirSync(out, { recursive: true });
const shim = fs.readFileSync(new URL("../games/shim.js", import.meta.url), "utf8");
const seed = `(()=>{let s=0x9e3779b9;Math.random=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};})();`;
const AMBIENT = { 0: "pollen", 2: "fireflies", 3: "embers", 4: "rain", 5: "confetti" };
// CAM=near: a free diag camera 7 m in front of the emitter origin, looking at it (?qaCamEye/qaCamAt), so the
// particles are large enough to see; otherwise the gameplay diorama camera.
const ORIGIN_Y = { 0: 1.6, 2: 0.8, 3: 0.3, 4: 7, 5: 4 };
const cam = (t) => (process.env.CAM === "near" ? `&qaCamEye=0,${ORIGIN_Y[t] + 0.8},-1&qaCamAt=0,${ORIGIN_Y[t]},-8&qaCamFov=50` : "");
const extra = (v) => (v.includes("noamb") ? "&qaNoAmbient=1" : v.includes("point") ? "&qaAmbientPoint=1" : "");
const portOf = (v) => (v.startsWith("base") ? basePort : branchPort);
const profile = fs.mkdtempSync("/tmp/fx520-chrome-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1280,720", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
process.on("SIGTERM", () => { chrome.kill(); process.exit(143); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port;
for (let i = 0; i < 100 && !port; i++) { try { port = Number(fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]) || undefined; } catch {} if (!port) await sleep(100); }
if (!port) { chrome.kill(); throw new Error("Chrome did not report a DevTools port"); }
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Page.javascriptDialogOpening") ws.send(JSON.stringify({ id: 1e9 + (++n), method: "Page.handleJavaScriptDialog", params: { accept: true } })); if (d.method === "Runtime.exceptionThrown" || (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")) logs.push(JSON.stringify(d.params).slice(0, 300)); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r, j) => { const id = ++n; const t = setTimeout(() => { pend.delete(id); j(new Error(`CDP timeout ${method}`)); }, 60000); pend.set(id, (d) => { clearTimeout(t); r(d); }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const READY = "document.body&&document.body.dataset.aura3dReady==='true'";
const report = {};
try {
  for (const theme of THEMES) {
    const name = `cross-hop-diorama-t${theme}-${AMBIENT[theme] ?? "none"}${process.env.CAM === "near" ? "-near" : ""}`;
    for (const variant of VARIANTS) {
      const { result: { identifier } } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `${seed}${shim}` });
      const route = `/apps/showcase-cross-hop/index.html`;
      const url = `http://127.0.0.1:${portOf(variant)}${route}?look=diorama&theme=${theme}&seed=7&diag=1${cam(theme)}${extra(variant)}&autostart=1`;
      await send("Page.navigate", { url });
      let ready = false; let boot = 0;
      for (let i = 0; i < 600; i++) {
        if (await ev(READY)) { ready = true; break; }
        await ev("window.__vt&&window.__vt.frame(16.667)"); boot++;
        await sleep(250);
      }
      await sleep(3000);
      // Exactly POST virtual frames after ready; boot frames vary by a few between runs, so vnow is logged per frame.
      for (let i = 0; i < POST; i++) { await ev("window.__vt.frame(16.667)"); if (i % 10 === 0) await sleep(40); }
      await sleep(400); await ev("window.__vt.frame(16.667)"); await sleep(300);
      const info = JSON.parse((await ev("JSON.stringify({state:(window.__AURA3D_GAME__&&window.__AURA3D_GAME__.state)||null,vnow:window.__vt.now,title:document.title,url:location.pathname+location.search,host:location.host})")) ?? "{}");
      // Refuse to save a frame of any page other than the requested route on the requested server.
      if (info.url !== `${route}${new URL(url).search}` || info.host !== `127.0.0.1:${portOf(variant)}`) throw new Error(`captured page ${info.host}${info.url} is not the requested ${url}`);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`${out}/${name}-${variant}.png`, Buffer.from(shot.result.data, "base64"));
      (report[name] ??= {})[variant] = { ready, bootFrames: boot, info, errors: logs.splice(0).slice(0, 5) };
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
      console.log(name, variant, ready, boot, JSON.stringify(info), JSON.stringify(report[name][variant].errors).slice(0, 400));
    }
  }
} finally {
  fs.writeFileSync(`${out}/capture-report-${THEMES.join("_")}-${VARIANTS.join("_")}.json`, JSON.stringify(report, null, 2));
  ws.close(); chrome.kill();
  await sleep(800);
  fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
