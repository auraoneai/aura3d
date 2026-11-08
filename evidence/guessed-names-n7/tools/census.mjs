// usage: node census.mjs <url> <slug> <outdir> <port>
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
const [url, slug, out, port] = process.argv.slice(2);
const prof = `/tmp/n7tools/prof-${port}`;
rmSync(prof, { recursive: true, force: true });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", "--window-size=960,540",
  "--use-angle=metal", "--ignore-gpu-blocklist", "--disable-extensions", "--disable-component-extensions-with-background-pages", "--no-first-run", "about:blank"], { stdio: "ignore", detached: true });
const kill = () => { try { process.kill(-chrome.pid, "SIGKILL"); } catch {} try { chrome.kill("SIGKILL"); } catch {} };
process.on("exit", kill);
setTimeout(() => { console.log(slug, "TIMEOUT"); process.exit(2); }, 60000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(250); }
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const events = []; let mainFrame = null; let navs = 0;
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
  const p = d.params;
  if (d.method === "Runtime.consoleAPICalled") events.push({ kind: "console", level: p.type, text: p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 600) });
  if (d.method === "Runtime.exceptionThrown") events.push({ kind: "page-error", level: "error", text: `${p.exceptionDetails.text} ${p.exceptionDetails.exception?.description?.slice(0, 500) ?? ""}` });
  if (d.method === "Log.entryAdded") events.push({ kind: "log", level: p.entry.level, text: `${p.entry.text.slice(0, 400)} ${p.entry.url ?? ""}` });
  if (d.method === "Page.frameNavigated" && !p.frame.parentId && p.frame.url.startsWith("http")) navs++;
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url });
await sleep(11000);
const state = JSON.parse(await ev(`JSON.stringify((()=>{const h=document.documentElement.innerHTML;const t=document.body?document.body.innerText:'';let gpu='';try{const g=document.createElement('canvas').getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');gpu=e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):''}catch(x){gpu=String(x)}
return {url:location.href,history_length:history.length,nav_types:performance.getEntriesByType('navigation').map(n=>n.type),mount_failed:h.includes('RENDERER_MOUNT_FAILED'),safety_black_frame:h.includes('SAFETY_BLACK_FRAME'),failed_to_start_visible:/failed to start|could not start/i.test(t),canvases:document.querySelectorAll('canvas').length,ready:document.body&&document.body.dataset.aura3dReady,gpu}})())`));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${out}/${slug}.png`, Buffer.from(shot.result.data, "base64"));
const isErr = (e) => e.level === "error";
const non404 = events.filter((e) => isErr(e) && !/\b404\b|Not Found/.test(e.text)).map((e) => e.text);
const codes = [...new Set(events.flatMap((e) => e.text.match(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)*_(?:DEGRADED|PARTIAL|FAILED|FRAME|UNSUPPORTED)\b/g) ?? []))].sort();
const res = { slug, ...state, frame_navigated: navs, reload_suspected: navs > 1 || state.history_length > 2 || state.nav_types.includes("reload"), codes, non404_errors: non404, events };
writeFileSync(`${out}/${slug}.json`, JSON.stringify(res, null, 1));
console.log(slug, "hist", state.history_length, "nav", navs, "mf", state.mount_failed, "sbf", state.safety_black_frame, "fts", state.failed_to_start_visible, "errs", non404.length, "codes", codes.join(","), "gpu", state.gpu.slice(0, 40));
ws.close(); kill(); process.exit(0);
