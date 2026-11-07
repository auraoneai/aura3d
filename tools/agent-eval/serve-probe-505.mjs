#!/usr/bin/env node
// Static server for built sandboxes with an injected page-level probe (remote/probe-505-interactive.js). The browser is REA
// (capture_browser_scenario); this process never launches one. Probe results are POSTed back to /__result and stored.
//   node tools/agent-eval/serve-probe-505.mjs <outDir> <runDir:batch>...    e.g. /tmp/work:bench505-interactive
// Ports: 48000 + index over sorted run ids; mapping written to <outDir>/ports.json. Probe JSON -> <outDir>/probe/<rid>-<mode>.json
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const [outDir, ...specs] = process.argv.slice(2);
const probeJs = readFileSync(join(import.meta.dirname, "remote/probe-505-interactive.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml" };
mkdirSync(join(outDir, "probe"), { recursive: true });
const ids = [];
for (const s of specs) {
  const [root, batch] = s.split(":");
  for (const id of readdirSync(join(root, batch)).sort()) if (existsSync(join(root, batch, id, "dist/index.html"))) ids.push({ id, dist: join(root, batch, id, "dist") });
}
const ports = {};
ids.forEach(({ id, dist }, i) => {
  const port = 48000 + i;
  ports[id] = port;
  createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (req.method === "POST" && u.pathname === "/__result") {
      let body = "";
      for await (const c of req) body += c;
      try {
        const j = JSON.parse(body);
        writeFileSync(join(outDir, "probe", `${id}-${j.mode}.json`), JSON.stringify(j, null, 2));
      } catch {}
      res.writeHead(204).end();
      return;
    }
    if (u.pathname === "/__probe.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(probeJs);
    let p = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    const file = join(dist, p);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) return void res.writeHead(404).end("nf");
    let data = readFileSync(file);
    if (p === "/index.html") data = Buffer.from(String(data).replace(/<head[^>]*>/i, (m) => `${m}<script src="/__probe.js"></script>`));
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(data);
  }).listen(port, "127.0.0.1");
});
writeFileSync(join(outDir, "ports.json"), JSON.stringify(ports, null, 2));
console.log("serving", ids.length, "dists");
