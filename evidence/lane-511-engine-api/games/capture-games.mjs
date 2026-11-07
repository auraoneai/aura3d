// Real-GPU (headless Chrome, ANGLE Metal) before/after frames for games that author the 5.1 particle options.
// "before" sets globalThis.__A3D_NO_EMITTER_EXTRAS (temporary local engine toggle, not committed) so lowering
// ignores shape/wind/curves/stretch exactly as 5.0.2 did. Virtual clock (shim.js, from lane/504-bellkeeper) + seeded Math.random.
// usage: node capture-games.mjs <outDir> [filter]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2]; const filter = process.argv[3];
mkdirSync(out, { recursive: true });
const shim = readFileSync(new URL("./shim.js", import.meta.url), "utf8");
const seed = `(()=>{let s=0x9e3779b9;Math.random=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};})();`;
const PORTS = { "showcase-cross-hop": 5201, "showcase-aura-hoops-3d": 5202, "showcase-dot-dash-3d": 5203, "showcase-pips-big-leap": 5204, "showcase-slingshot-siege": 5205 };
const SHOTS = [
  ["cross-hop-t0", "showcase-cross-hop/index.html?theme=0"],
  ["cross-hop-t1", "showcase-cross-hop/index.html?theme=1"],
  ["cross-hop-t2", "showcase-cross-hop/index.html?theme=2"],
  ["cross-hop-t3", "showcase-cross-hop/index.html?theme=3"],
  ["cross-hop-t4", "showcase-cross-hop/index.html?theme=4"],
  ["cross-hop-t5", "showcase-cross-hop/index.html?theme=5"],
  ["hoops-manila", "showcase-aura-hoops-3d/index.html?court=manila"],
  ["dot-dash", "showcase-dot-dash-3d/index.html"],
  ["pips-big-leap", "showcase-pips-big-leap/index.html"],
  ["slingshot-ch1", "showcase-slingshot-siege/index.html?level=5"]
].filter(([n]) => !filter || filter.split(",").some((f) => n.includes(f)));
const port = 9500 + Math.floor(Math.random() * 100);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/fx513-chrome-${port}`, "--window-size=1280,720", "--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(300); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown" || (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")) logs.push(JSON.stringify(d.params).slice(0, 300)); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const report = {};
for (const [name, path] of SHOTS) {
  for (const variant of ["before", "after"]) {
    const { result: { identifier } } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `${variant === "before" ? "globalThis.__A3D_NO_EMITTER_EXTRAS=true;" : ""}${seed}${shim}` });
    await send("Page.navigate", { url: `http://127.0.0.1:${PORTS[path.split("/")[0]]}/apps/${path}${path.includes("?") ? "&" : "?"}autostart=1` });
    let ready = false;
    for (let i = 0; i < 1500; i++) {
      await ev("window.__vt&&window.__vt.frame(16.667)");
      const st = await ev("(window.__AURA3D_GAME__&&window.__AURA3D_GAME__.state)||''");
      if (st === "playing") { ready = true; break; }
      await sleep(100);
    }
    for (let i = 0; i < 300; i++) { await ev("window.__vt.frame(16.667)"); if (i % 20 === 0) await sleep(15); }
    await sleep(300); await ev("window.__vt.frame(16.667)"); await sleep(200);
    const info = await ev("JSON.stringify({state:(window.__AURA3D_GAME__&&window.__AURA3D_GAME__.state)||null,frame:(window.__AURA3D_GAME__&&window.__AURA3D_GAME__.frame)||null,title:document.title})");
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${out}/${name}-${variant}.png`, Buffer.from(shot.result.data, "base64"));
    (report[name] ??= {})[variant] = { ready, info: JSON.parse(info ?? "{}"), errors: logs.splice(0).slice(0, 5) };
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    console.log(name, variant, ready, info);
  }
}
writeFileSync(`${out}/capture-report.json`, JSON.stringify(report, null, 2));
ws.close(); chrome.kill(); process.exit(0);
