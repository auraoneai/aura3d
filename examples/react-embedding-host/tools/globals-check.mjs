// R-02 real-GPU check: two embedded AuraCanvas apps with different shadow settings (`?dense=1` gives canvas B
// 1,200 instanced shadow casters), headless Chrome over loopback CDP (no Playwright).
// Usage: node examples/react-embedding-host/tools/globals-check.mjs <baseUrl> <outDir>
// Writes frame-dense.png and globals.json: every `__A3D*` / `__AURA*` page global while both apps are live and
// after the React root unmounts (both apps disposed), each app's own compile evidence, and the counters.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [base, outDir] = [process.argv[2], process.argv[3]];
if (!base || !outDir) throw new Error("usage: globals-check.mjs <baseUrl> <outDir>");
mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "react515-globals-"));
const proc = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1000,700",
  "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--no-first-run", "--hide-scrollbars", "about:blank"
], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === "page")) break; } catch { /* retry */ }
    await sleep(200);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result))); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  const url = `${base}/examples/react-embedding-host/index.html?live=0&value=0.1&dense=1`;
  await send("Page.navigate", { url });
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) { await sleep(400); ready = await evaluate("Boolean(window.__EMBED_HOST__ && window.__EMBED_HOST__.ready())").catch(() => false); }
  if (!ready) throw new Error("host never reported two live apps");
  await evaluate("new Promise((resolve) => { let n = 0; const tick = () => (++n >= 30 ? resolve(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick); })");
  await sleep(1500);
  const globals = `(() => Object.getOwnPropertyNames(window).filter((k) => /^__(A3D|AURA)/.test(k)).sort())()`;
  const dataset = `Object.keys(document.body.dataset).filter((k) => k.startsWith('aura3d'))`;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, "frame-dense.png"), Buffer.from(data, "base64"));
  const live = await evaluate(`({ url: location.href, canvases: document.querySelectorAll('canvas').length, pageGlobals: ${globals}, bodyAuraKeys: ${dataset},
    compileEvidence: window.__EMBED_HOST__.compileEvidence(), counters: { ...window.__EMBED_HOST__.counters } })`);
  await evaluate("window.__EMBED_HOST__.unmount()");
  await sleep(1500);
  const disposed = await evaluate(`({ canvases: document.querySelectorAll('canvas').length, pageGlobals: ${globals}, bodyAuraKeys: ${dataset},
    compileEvidence: window.__EMBED_HOST__.compileEvidence(), counters: { ...window.__EMBED_HOST__.counters } })`);
  const tapA = live.compileEvidence.a?.__A3D_SHADOW_TAP_TIER__;
  const tapB = live.compileEvidence.b?.__A3D_SHADOW_TAP_TIER__;
  const evidence = { url, live, disposed, verdicts: {
    twoLiveApps: live.canvases === 2 && live.counters.appsCreated - live.counters.appsDisposed === 2,
    noPageGlobalsWhileLive: live.pageGlobals.length === 0 && live.bodyAuraKeys.length === 0,
    perAppEvidenceRecorded: Boolean(tapA && tapB),
    perAppEvidenceDiffers: Boolean(tapA && tapB && JSON.stringify(tapA) !== JSON.stringify(tapB)),
    bothDisposed: disposed.canvases === 0 && disposed.counters.appsDisposed >= disposed.counters.appsCreated,
    noPageGlobalsAfterDispose: disposed.pageGlobals.length === 0 && disposed.bodyAuraKeys.length === 0
  } };
  writeFileSync(join(outDir, "globals.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  ws.close();
} finally {
  proc.kill("SIGKILL");
}
