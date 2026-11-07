// Real-GPU (headless Chrome, ANGLE Metal) main-vs-branch frames, pinned for determinism (re-review 2026-11-07).
// Two dev servers: origin/main (5.0.2 particle lowering) and the lane branch, each running its own engine + game source.
// Virtual clock (shim.js, from lane/504-bellkeeper) + seeded Math.random. No vt frames are advanced while the page boots;
// after the route reports ready, exactly POST virtual frames are stepped, so every variant sits at the same game frame.
// Variants: main, branch, main2, branch2 (main-vs-main2 and branch-vs-branch2 are the noise floor); a variant containing
// "norain" adds the Hoops ?qaNoRain=1 diag switch (rain nodes dropped) so with-minus-without isolates the curtain pixels;
// "branchhead" is the branch server run while courtRigs.ts holds the lane HEAD authoring (box/stretch/curve curtains).
// usage: node capture-games3.mjs <outDir> <mainPort> <branchPort> <filter> [postFrames]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [out, mainPort, branchPort, filter] = process.argv.slice(2); const POST = Number(process.argv[6] ?? 240);
mkdirSync(out, { recursive: true });
const shim = readFileSync(new URL("../games/shim.js", import.meta.url), "utf8");
const seed = `(()=>{let s=0x9e3779b9;Math.random=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};})();`;
const SHOTS = [
  ["hoops-manila-wide", "showcase-aura-hoops-3d/index.html?court=manila&diag=1&qaCam=wide"],
  // East rain curtain emitter at (19, 4.5, 3): from the court looking out over the east stand, and from above outside.
  ["hoops-manila-curtain-in", "showcase-aura-hoops-3d/index.html?court=manila&diag=1&qaCamEye=8,5.2,3&qaCamAt=19,4,3&qaCamFov=30"],
  ["hoops-manila-curtain-top", "showcase-aura-hoops-3d/index.html?court=manila&diag=1&qaCamEye=26,9,3&qaCamAt=19,3.5,3&qaCamFov=30"],
  ["cross-hop-t3", "showcase-cross-hop/index.html?theme=3&seed=7"],
  ["cross-hop-t0", "showcase-cross-hop/index.html?theme=0&seed=7"],
  // No still=1: it sets reduced motion, which drops the chapter-1 dust motes (the only 5.1-option emitter here).
  ["slingshot-ch1", "showcase-slingshot-siege/index.html?level=5&intro=0&seed=7"]
].filter(([n]) => !filter || filter.split(",").some((f) => n.includes(f)));
const VARIANTS = (process.env.VARIANTS ?? "main,branch,main2,branch2").split(",");
const portOf = (v) => (v.startsWith("main") ? mainPort : branchPort);
const port = 9600 + Math.floor(Math.random() * 100);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/fx516-engineapi-chrome-${port}`, "--window-size=1280,720", "--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(300); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown" || (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")) logs.push(JSON.stringify(d.params).slice(0, 300)); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const READY = "(document.body&&document.body.dataset.aura3dReady==='true')||!!(window.__AURA3D_GAME__&&/playing|aiming|ready/.test(window.__AURA3D_GAME__.state||''))";
const report = {};
try {
  for (const [name, path] of SHOTS) {
    for (const variant of VARIANTS) {
      const { result: { identifier } } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `${seed}${shim}` });
      await send("Page.navigate", { url: `http://localhost:${portOf(variant)}/apps/${path}${variant.includes("norain") ? "&qaNoRain=1" : ""}&autostart=1` });
      // Boot: step one vt frame per 250 ms of real time (some routes need rAF to finish mounting) until ready.
      let ready = false; let boot = 0;
      for (let i = 0; i < Number(process.env.BOOTMAX ?? 600); i++) {
        if (await ev(READY)) { ready = true; break; }
        await ev("window.__vt&&window.__vt.frame(16.667)"); boot++;
        await sleep(250);
      }
      // Let async decodes/texture upgrades land in real time before stepping the pinned frames.
      await sleep(3000);
      for (let i = 0; i < POST; i++) { await ev("window.__vt.frame(16.667)"); if (i % 10 === 0) await sleep(40); }
      await sleep(400); await ev("window.__vt.frame(16.667)"); await sleep(300);
      const info = await ev("JSON.stringify({state:(window.__AURA3D_GAME__&&window.__AURA3D_GAME__.state)||null,beaconFrame:(window.__AURA3D_GAME__&&window.__AURA3D_GAME__.frame)||null,vnow:window.__vt.now,title:document.title,url:location.pathname+location.search})");
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${out}/${name}-${variant}.png`, Buffer.from(shot.result.data, "base64"));
      (report[name] ??= {})[variant] = { ready, bootFrames: boot, postFrames: POST + 1, info: JSON.parse(info ?? "{}"), errors: logs.splice(0).slice(0, 5) };
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
      console.log(name, variant, ready, boot, info, JSON.stringify(report[name][variant].errors).slice(0, 600));
    }
  }
} finally {
  writeFileSync(`${out}/capture-report-${`${filter ?? "all"}-${VARIANTS.join("-")}`.replace(/[^a-z0-9]+/gi, "_")}.json`, JSON.stringify(report, null, 2));
  ws.close(); chrome.kill();
}
process.exit(0);
