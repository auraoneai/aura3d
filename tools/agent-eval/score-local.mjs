#!/usr/bin/env node
// Local stand-in for score-remote.sh used by the 5.0.3 trial lane (no ACR job, no local Playwright):
//   node tools/agent-eval/score-local.mjs build <batch>   stock `vite build` of each finished sandbox, writes <batch>/local-build.json
//   node tools/agent-eval/score-local.mjs serve <batch>   serves each built dist on 127.0.0.1:(47000+index); frames are captured with REA
// Real-GPU frames come from the REA MCP tool capture_browser_scenario; this script never launches a browser.
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const WORK = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";
const [mode, batch] = process.argv.slice(2);
if (!mode || !batch) throw new Error("usage: score-local.mjs build|serve <batch>");
const runsDir = join(WORK, batch);
const ids = readdirSync(join(REPO, (process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval"), batch, "runs")).sort();
const outFile = join(REPO, (process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval"), batch, "local-build.json");

function dirSize(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) total += e.isDirectory() ? dirSize(join(dir, e.name)) : statSync(join(dir, e.name)).size;
  return total;
}

if (mode === "build") {
  const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
  for (const id of ids) {
    if (results[id]) continue;
    const sandbox = join(runsDir, id, "sandbox");
    if (!existsSync(sandbox)) continue;
    const started = Date.now();
    const r = spawnSync(join(sandbox, "node_modules/.bin/vite"), ["build", "--outDir", join(runsDir, id, "dist"), "--emptyOutDir"], { cwd: sandbox, encoding: "utf8", timeout: 240000 });
    const dist = join(runsDir, id, "dist");
    results[id] = { ok: r.status === 0, ms: Date.now() - started, bundleKb: existsSync(dist) ? Math.round(dirSize(dist) / 1024) : 0, log: (r.stdout + r.stderr).slice(-600) };
    console.log(id, results[id].ok ? "built" : "BUILD FAIL", results[id].bundleKb, "KB");
  }
  writeFileSync(outFile, JSON.stringify(results, null, 2));
}

if (mode === "serve") {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm" };
  const ports = {};
  ids.forEach((id, i) => {
    const root = join(runsDir, id, "dist");
    if (!existsSync(root)) return;
    const port = Number(process.env.PORT_BASE ?? 47000) + i;
    ports[id] = port;
    createServer((req, res) => {
      let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
      if (p.endsWith("/")) p += "index.html";
      const file = join(root, p);
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404).end("nf");
        return;
      }
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
    }).listen(port, "127.0.0.1");
  });
  writeFileSync(join(runsDir, "ports.json"), JSON.stringify(ports, null, 2));
  console.log("serving", Object.keys(ports).length, "dists; ports in", join(runsDir, "ports.json"));
}
