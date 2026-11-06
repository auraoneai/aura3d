// Template rows: scaffold each create-aura3d template from the packed archives or the registry, build it, serve dist on
// loopback. The browser driver then loads the served URL like any game URL.
import { execFile } from "node:child_process";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ktx2": "image/ktx2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".hdr": "application/octet-stream" };

export function listTemplates(repoRoot) {
  const dir = join(repoRoot, "packages/create-aura3d/templates");
  return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort();
}

/** Static file server bound to 127.0.0.1 (path traversal safe). Resolves `{ url, close }`. */
export function serveDirectory(root) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(() => r())) }));
  });
}

/** Argument vectors only (no shell). `source` is `{ kind: "registry", spec: "next" | "5.0.2" }` or `{ kind: "archives", plan }`. */
export function scaffoldCommands(source, template, dir, workDir) {
  if (source.kind === "registry") {
    return [
      { cmd: "npx", args: ["-y", `create-aura3d@${source.spec ?? "latest"}`, dir, "--template", template], cwd: workDir },
      { cmd: "npm", args: ["install", "--prefer-online", "--no-audit", "--no-fund"], cwd: join(workDir, dir) },
      { cmd: "npm", args: ["run", "build"], cwd: join(workDir, dir) }
    ];
  }
  if (source.kind === "archives") {
    const plan = JSON.parse(readFileSync(source.plan, "utf8"));
    const tarballs = plan.packages.map((p) => resolve(p.tarball));
    const create = plan.packages.find((p) => p.name === "create-aura3d");
    if (!create) throw new Error("plan has no create-aura3d archive");
    return [
      { cmd: "npm", args: ["exec", "--yes", `--package=${resolve(create.tarball)}`, "--", "create-aura3d", dir, "--template", template], cwd: workDir },
      { cmd: "npm", args: ["install", "--no-audit", "--no-fund", ...tarballs], cwd: join(workDir, dir) },
      { cmd: "npm", args: ["run", "build"], cwd: join(workDir, dir) }
    ];
  }
  throw new Error(`unknown template source kind ${source.kind}`);
}

/** Scaffold, install and build one template; returns the dist directory. Throws with the failing step on error. */
export async function buildTemplate(source, template, workDir, run = execFileP) {
  const dir = `tpl-${template}`;
  for (const { cmd, args, cwd } of scaffoldCommands(source, template, dir, workDir)) {
    try { await run(cmd, args, { cwd, maxBuffer: 1 << 26, timeout: 15 * 60 * 1000 }); }
    catch (e) { throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${String(e.stderr || e.message).split("\n").slice(-4).join(" | ")}`); }
  }
  const dist = join(workDir, dir, "dist");
  if (!existsSync(join(dist, "index.html"))) throw new Error("build produced no dist/index.html");
  return dist;
}
