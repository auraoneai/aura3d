// Evaluate one expression in the probe page after app.ready(): node evidence/picking-515/tools/eval.mjs "<expr>"
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const pageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expr = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => {
  const p = path.join(pageRoot, (req.url || "/").split("?")[0].replace(/^\/+/, "") || "index.html");
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(pageRoot, "index.html");
  res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : "text/html");
  fs.createReadStream(f).pipe(res);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = 9600 + Math.floor(Math.random() * 90);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/pick515-eval-${port}`, "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist", "--no-first-run", "about:blank"], { stdio: "ignore" });
try {
  let t;
  for (let i = 0; i < 60; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (t.find((x) => x.type === "page")) break; } catch {} await sleep(200); }
  const ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` });
  for (let i = 0; i < 100; i++) { const r = await send("Runtime.evaluate", { expression: "!!window.__PICK__", returnByValue: true }); if (r.result?.result?.value) break; await sleep(200); }
  await send("Runtime.evaluate", { expression: "window.__PICK__.ready()", awaitPromise: true });
  await sleep(1500);
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result).slice(0, 4000));
  ws.close();
} finally { chrome.kill(); server.close(); }
process.exit(0);
