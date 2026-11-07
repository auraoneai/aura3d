// Real-GPU proof for lane 515. usage: node evidence/picking-515/tools/capture.mjs <outDir>
// Pass A (real clock): pick cost for 100K points and 5K instances. Pass B (virtual clock shim): hover, click, two-point
// measurement, committed frames with real-frame checks. Serves the page on loopback; headless Chrome via ANGLE/Metal.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const pageRoot = path.resolve(here, "..");
const outDir = path.resolve(process.argv[2] || path.join(pageRoot, "out"));
fs.mkdirSync(outDir, { recursive: true });
const shim = fs.readFileSync(path.join(here, "shim.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const p = path.join(pageRoot, decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "") || "index.html");
  const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(pageRoot, "index.html");
  res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
  fs.createReadStream(file).pipe(res);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

async function session(useShim) {
  const port = 9700 + Math.floor(Math.random() * 250);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/pick515-chrome-${port}`, "--window-size=960,620", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500)); return r.result.result.value; };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 960, height: 620, deviceScaleFactor: 1, mobile: false });
  if (useShim) await send("Page.addScriptToEvaluateOnNewDocument", { source: shim });
  await send("Page.navigate", { url });
  return { send, ev, close: () => { ws.close(); chrome.kill(); } };
}

// Frame statistics decoded in-page: fraction of pixels not equal to the background, mean luma, and whether it is a game frame.
const FRAME_STATS = (b64) => `(async () => { const i = await new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = "data:image/png;base64,${b64}"; });
  const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0, 960, 540, 0, 0, 960, 540);
  const d = g.getImageData(0, 0, 960, 540).data; let lit = 0, luma = 0, n = 0; for (let k = 0; k < d.length; k += 4) { const l = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]; luma += l; n++; if (Math.abs(d[k] - 11) + Math.abs(d[k + 1] - 15) + Math.abs(d[k + 2] - 20) > 40) lit++; }
  return { litFraction: lit / n, meanLuma: luma / n }; })()`;

const report = { page: "evidence/picking-515", counts: null };

// ── Pass A: pick cost on the real clock ─────────────────────────────────────
{
  const s = await session(false);
  for (let i = 0; i < 200; i++) { const ok = await s.ev("!!(window.__PICK__)").catch(() => false); if (ok) break; await sleep(250); }
  await s.ev("window.__PICK__.ready()");
  await sleep(1500);
  report.counts = await s.ev("window.__PICK__.counts");
  report.handles = await s.ev("window.__PICK__.state().handles");
  const runs = {};
  for (const mode of ["handles", "nodes"]) for (const kind of ["points", "instances", "all"]) {
    runs[`${mode}/${kind}`] = [];
    for (let rep = 0; rep < 3; rep++) runs[`${mode}/${kind}`].push(await s.ev(`window.__PICK__.bench(${JSON.stringify(kind)}, 1000, ${JSON.stringify(mode)})`));
  }
  report.passA = runs;
  s.close();
}

// ── Pass B: deterministic frames, hover, click, measurement ────────────────
{
  const s = await session(true);
  const dt = 1000 / 60;
  const frame = (k = 1) => s.ev(`(() => { for (let i = 0; i < ${k}; i++) window.__vt.frame(${dt}); return 1; })()`);
  for (let i = 0; i < 4000; i++) { const ok = await s.ev("!!(window.__PICK__ && window.__PICK__.state().handles > 0)").catch(() => false); if (ok) break; await s.ev(`window.__vt.frame(${dt})`).catch(() => {}); await sleep(i < 50 ? 50 : 5); }
  await frame(90);
  const shot = async (name) => { const r = await s.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 960, height: 620, scale: 1 } }); fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, "base64")); return s.ev(FRAME_STATS(r.result.data)); };
  report.idle = await shot("01-idle.png");
  const move = async (x, y) => { await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await frame(2); };
  const click = async (x, y) => { await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }); await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await frame(3); };

  // Accuracy: hover the exact projected position of 40 visible points and 40 instances.
  const acc = await (async () => {
    const out = { points: { tried: 0, hit: 0 }, instances: { tried: 0, hit: 0 } };
    const pos = await s.ev("Array.from(window.__PICK__.positions().slice(0, 300000))");
    let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let k = 0; k < 40; k++) {
      const i = Math.floor(rnd() * 100000);
      const c = await s.ev(`window.__PICK__.toClient([${pos[i * 3]}, ${pos[i * 3 + 1]}, ${pos[i * 3 + 2]}])`);
      if (!c.visible || c.x < 5 || c.x > 955 || c.y < 5 || c.y > 535) { k -= 0; continue; }
      await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }); await frame(2);
      await move(c.x, c.y);
      const st = await s.ev("window.__PICK__.state().events.at(-1)");
      out.points.tried++; if (st && st.type === "enter" && st.kind === "point") { if (st.id === i) out.points.hit++; else out.points.near = (out.points.near || 0) + 1; }
    }
    for (let k = 0; k < 40; k++) {
      const i = Math.floor(rnd() * 5000);
      const p = await s.ev(`window.__PICK__.instance(${i})`);
      const c = await s.ev(`window.__PICK__.toClient([${p[0]}, ${p[1] + 0.05}, ${p[2]}])`);
      if (!c.visible || c.x < 5 || c.x > 955 || c.y < 5 || c.y > 535) continue;
      await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }); await frame(2);
      await move(c.x, c.y);
      const st = await s.ev("window.__PICK__.state().events.at(-1)");
      const truth = await s.ev(`window.__PICK__.bruteInstance(${c.x}, ${c.y})`);
      out.instances.tried++; if (st && st.type === "enter" && st.kind === "instance") { if (st.id === i) out.instances.hit++; else out.instances.otherInstance = (out.instances.otherInstance || 0) + 1; if (st.id === truth) out.instances.matchesBruteForce = (out.instances.matchesBruteForce || 0) + 1; } else if (truth < 0) out.instances.bruteForceMissToo = (out.instances.bruteForceMissToo || 0) + 1;
    }
    return out;
  })();
  report.accuracy = acc;
  await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }); await frame(3);

  // Scripted story: click a point, hover then click an instance, two-point distance label.
  const pos = await s.ev("Array.from(window.__PICK__.positions().slice(0, 60000))");
  let pi = 4000, pc;
  for (; pi < 20000; pi++) { pc = await s.ev(`window.__PICK__.toClient([${pos[pi * 3]}, ${pos[pi * 3 + 1]}, ${pos[pi * 3 + 2]}])`); if (pc.visible && pc.x > 60 && pc.x < 900 && pc.y > 60 && pc.y < 500) break; }
  await move(pc.x, pc.y);
  report.hoverPoint = { index: pi, shot: await shot("02-hover-point.png"), state: await s.ev("window.__PICK__.state()") };
  await click(pc.x, pc.y);
  report.clickPoint = { shot: await shot("03-click-point.png"), state: await s.ev("window.__PICK__.state()") };
  let ii = 100, ic;
  for (; ii < 5000; ii++) { const p = await s.ev(`window.__PICK__.instance(${ii})`); ic = await s.ev(`window.__PICK__.toClient([${p[0]}, ${p[1] + 0.05}, ${p[2]}])`); if (ic.visible && ic.x > 60 && ic.x < 900 && ic.y > 60 && ic.y < 500) break; }
  await move(ic.x, ic.y);
  report.hoverInstance = { index: ii, shot: await shot("04-hover-instance.png") };
  await click(ic.x, ic.y);
  report.clickInstance = { shot: await shot("05-click-instance-distance.png"), state: await s.ev("window.__PICK__.state()") };
  report.coalescing = await s.ev("(() => { const s = window.__PICK__.state(); return { pickCount: s.pickCount }; })()");
  s.close();
}
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.passA, null, 0).slice(0, 1500));
console.log(JSON.stringify({ accuracy: report.accuracy, idle: report.idle, hoverPoint: report.hoverPoint.shot, clickInstance: report.clickInstance.shot, readout: report.clickInstance.state.readout }));
server.close();
process.exit(0);
