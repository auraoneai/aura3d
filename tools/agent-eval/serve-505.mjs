#!/usr/bin/env node
// Serves each built sandbox dist on 127.0.0.1:(47000+index) for REA capture. Probe pages (/?probe=<runId>) get the in-page probe injected and
// POST their result to /__probe_result, which is written to <batchDir>/probes/<runId>.json. Dist files are never modified on disk.
//   AGENT_EVAL_EVIDENCE=... node tools/agent-eval/serve-505.mjs <batch>
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
const REPO = resolve(import.meta.dirname, "..", "..");
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
const batch = process.argv[2];
const evid = join(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval", batch);
const ids = readdirSync(join(evid, "runs")).sort();
const probeJs = readFileSync(join(import.meta.dirname, "probe-505.js"), "utf8");
mkdirSync(join(evid, "probes"), { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".png": "image/png" };
const ports = {};
ids.forEach((id, i) => {
  const root = join(WORK, batch, id, "dist");
  if (!existsSync(root)) return;
  const task = Number(/-t(\d+)-/.exec(id)[1]);
  const port = 47000 + i;
  ports[id] = port;
  createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__probe_result" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => { writeFileSync(join(evid, "probes", `${id}.json`), body); res.writeHead(204).end(); });
      return;
    }
    if (u.pathname === "/__probe.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(probeJs);
    let p = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    const file = join(root, p);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) return void res.writeHead(404).end("nf");
    let data = readFileSync(file);
    if (p.endsWith("index.html") && u.searchParams.has("probe")) {
      data = Buffer.from(String(data).replace(/<head[^>]*>/i, (m) => `${m}<script>window.__PROBE_TASK__=${task}</script><script src="/__probe.js"></script>`));
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(data);
  }).listen(port, "127.0.0.1");
});
writeFileSync(join(WORK, batch, "ports.json"), JSON.stringify(ports, null, 2));
console.log("serving", Object.keys(ports).length, "dists");
