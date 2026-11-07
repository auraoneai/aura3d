// usage: node shot.mjs <url> <out.png> [settleMs] [play]
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
const [url, out, settle = "12000", play = "0"] = process.argv.slice(2);
const prof = mkdtempSync("/tmp/look521/prof-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--user-data-dir=${prof}`, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
  "--window-size=1280,720", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "--mute-audio",
  "--autoplay-policy=no-user-gesture-required", "about:blank"
], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill("SIGKILL"); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port;
for (let i = 0; i < 80 && !port; i++) { const f = `${prof}/DevToolsActivePort`; if (existsSync(f)) port = readFileSync(f, "utf8").split("\n")[0].trim(); else await sleep(150); }
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
  if (d.method === "Runtime.exceptionThrown") logs.push(`exception: ${d.params.exceptionDetails.exception?.description?.slice(0, 200) ?? d.params.exceptionDetails.text}`);
  if (d.method === "Runtime.consoleAPICalled" && String(d.params.args[0]?.value ?? "").startsWith("[x521]")) logs.push("x521: " + d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 3000));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") logs.push(`error: ${d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync("/tmp/look521/tools/trace-hook.js", "utf8") });
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Page.navigate", { url });
await sleep(Number(settle));
const want = new URL(url);
const okUrl = async () => { const h = await ev("location.href"); const g = new URL(h); return { h, ok: g.origin === want.origin && g.pathname.replace(/\/$/, "") === want.pathname.replace(/\/$/, "") && g.search === want.search }; };
const save = async (file) => { const u = await okUrl(); if (!u.ok) { console.log("REFUSED url", u.h); return false; } const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(s.result.data, "base64")); return true; };
const state = await ev(`JSON.stringify({ready: document.body.dataset.aura3dReady ?? null, mf: document.documentElement.innerHTML.includes('RENDERER_MOUNT_FAILED'), sbf: document.documentElement.innerHTML.includes('SAFETY_BLACK_FRAME'), gpu:(()=>{try{const c=document.createElement('canvas').getContext('webgl2');const e=c.getExtension('WEBGL_debug_renderer_info');return c.getParameter(e.UNMASKED_RENDERER_WEBGL)}catch(x){return String(x)}})(), playBtn: !!document.getElementById('aura-btn-play'), rm: matchMedia('(prefers-reduced-motion: reduce)').matches})`);
const diag = await ev(process.env.PROBE_EXPR || "null"); writeFileSync(out.replace(/\.png$/, '.diag.json'), JSON.stringify(diag, null, 1) ?? "null");
await save(out);
if (play === "1") {
  const clicked = await ev(`(()=>{const b=document.getElementById('aura-btn-play'); if(b){b.click(); return 'btn'} return 'none'})()`);
  if (clicked === "none") { for (const t of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type: t, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, ...(t === "keyDown" ? { text: "\r" } : {}) }); }
  await sleep(4000);
  await save(out.replace(/\.png$/, "-play.png"));
  console.log("play", clicked);
}
console.log("state", state);
console.log("errors", JSON.stringify(logs.slice(0, 40)));
ws.close(); cleanup(); process.exit(0);
