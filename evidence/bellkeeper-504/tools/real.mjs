import { spawn } from "node:child_process"; import fs from "node:fs";
const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/bk504-chrome-${port}`, "--window-size=1440,900", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--disable-frame-rate-limit", "--disable-gpu-vsync", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let n = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.result.value;
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{const raf=window.requestAnimationFrame.bind(window);window.__log=[];window.__rec=false;window.requestAnimationFrame=(cb)=>raf((t)=>{cb(t);if(window.__rec){const q=window.__AURA_WIND__;const r=q&&q.heroRig&&q.heroRig();window.__log.push([t,r&&r.animation&&r.animation.clip,r&&r.animation&&r.animation.captureTime,q.state().pos.x,q.state().step]);}});})()` });
await send("Page.navigate", { url: "http://127.0.0.1:8504/apps/showcase-where-the-wind-wanders-port/?start=1" });
for (let i = 0; i < 400; i++) { if (await ev(`!!(window.__AURA_WIND__&&window.__AURA_WIND__.ready&&window.__AURA_WIND__.ready())`)) break; await sleep(250); }
await sleep(2000);
await ev(`window.__rec=true`);
await ev(`window.dispatchEvent(new KeyboardEvent("keydown",{code:"ArrowRight",key:"ArrowRight",bubbles:true}))`);
await sleep(6000);
await ev(`window.dispatchEvent(new KeyboardEvent("keyup",{code:"ArrowRight",key:"ArrowRight",bubbles:true}))`);
await sleep(1500);
const log = await ev(`JSON.stringify(window.__log)`);
fs.writeFileSync(process.argv[2], log); ws.close(); chrome.kill(); process.exit(0);
