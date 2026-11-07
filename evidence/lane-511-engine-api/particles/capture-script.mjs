import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const port = 9341;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${port}`, "--user-data-dir=/tmp/engineapi-chrome-profile",
  "--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--window-size=1280,720", "about:blank"
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(500); }
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
const logs=[]; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method==="Runtime.consoleAPICalled"||d.method==="Runtime.exceptionThrown"||d.method==="Log.entryAdded") logs.push(JSON.stringify(d.params).slice(0,400)); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Log.enable"); await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const report = {};
for (const variant of ["before", "after"]) {
  await send("Page.navigate", { url: `http://127.0.0.1:5199/apps/_particles-511/index.html?variant=${variant}` });
  await sleep(2500);
  const r = await send("Runtime.evaluate", { expression: "(async()=>{const o=await window.__ready;await new Promise(r=>setTimeout(r,2500));const gl=document.createElement('canvas').getContext('webgl2');const dbg=gl&&gl.getExtension('WEBGL_debug_renderer_info');return JSON.stringify({outcome:o,renderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):null,info:window.__app.info})})()", awaitPromise: true, returnByValue: true });
  report[variant] = JSON.parse(r.result.result.value);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${out}/particles-${variant}.png`, Buffer.from(shot.result.data, "base64"));
}
report.logs=logs.slice(0,15); writeFileSync(`${out}/particles-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
ws.close(); chrome.kill();
process.exit(0);
