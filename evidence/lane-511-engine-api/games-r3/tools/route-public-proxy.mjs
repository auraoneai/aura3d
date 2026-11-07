// Dev-only proxy for pixel-neutrality captures: the repo-root vite server does not serve route-local apps/<route>/public/*
// (app vite configs set publicDir to the root public; tools/remote-capture.sh layers the route public dir in production
// captures). Without it, games whose GLBs live only in apps/<route>/public/aura-assets render a black canvas (or fail to
// mount, e.g. Bunker Zero "gLTF extension scan failed ... HTTP 200" because the SPA fallback returned index.html).
// This proxy serves any path that exists in exactly the same form under apps/*/public/ and NOT in the root public/, and
// forwards everything else to the vite server unchanged. Both sides (origin/main and branch) use the same proxy code.
// usage: node route-public-proxy.mjs <repoRoot> <listenPort> <vitePort>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const [root, listen, upstream] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const index = new Map();
const conflicts = [];
for (const app of fs.readdirSync(path.join(root, "apps"))) {
  const pub = path.join(root, "apps", app, "public");
  if (!fs.existsSync(pub)) continue;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const url = "/" + path.relative(pub, p).split(path.sep).join("/");
      if (fs.existsSync(path.join(root, "public", url))) continue;
      if (index.has(url) && fs.statSync(index.get(url)).size !== fs.statSync(p).size) conflicts.push(url);
      if (!index.has(url)) index.set(url, p);
    }
  };
  walk(pub);
}
console.error(`route-public-proxy: ${index.size} route-local files, ${conflicts.length} name conflicts`);
const types = { ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ktx2": "image/ktx2", ".json": "application/json", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".hdr": "application/octet-stream", ".bin": "application/octet-stream" };
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = index.get(pathname);
  if (file && (req.method === "GET" || req.method === "HEAD")) {
    const data = fs.readFileSync(file);
    res.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] ?? "application/octet-stream", "content-length": data.length, "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : data);
    return;
  }
  const up = http.request({ host: "127.0.0.1", port: upstream, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  up.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}).listen(listen, "127.0.0.1");
