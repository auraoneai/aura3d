#!/usr/bin/env node
// Gate for docs/agents/first-screen.md: every ```ts block is (1) typechecked against the PUBLISHED @aura3d/engine and
// (2) built as a page and rendered on the real GPU in headless Chrome over a loopback CDP socket (no Playwright):
// two frames 3 s apart, non-black, and for animated blocks a frame difference above 0.2 (mean abs RGB, 0 to 255).
// Writes evidence/cheatsheet-511/{report.json,frames/*.png}; tools/agent-docs verifies the report against the doc text.
//
//   node tools/docs/check-cheatsheet-render.mjs [--base /tmp/sheet-base/aura] [--only 1,2] [--no-render] [--dist PREBUILT_DIST] [--out DIR] [--file docs/agents/first-screen.md]
//
// --base is a directory whose node_modules holds @aura3d/engine (published), vite and typescript.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { analyzeFrames, extractBlocks, THRESHOLDS } from "./cheatsheet-lib.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const base = resolve(opt("--base", process.env.CHEATSHEET_BASE ?? "/tmp/sheet-base/aura"));
const file = resolve(repoRoot, opt("--file", "docs/agents/first-screen.md"));
const outDir = resolve(repoRoot, opt("--out", "evidence/cheatsheet-511"));
const only = opt("--only", "") ? opt("--only", "").split(",").map(Number) : null;
const doRender = !argv.includes("--no-render");
const FRAME_GAP_MS = 3000;
const SETTLE_MS = 3500;
const FIXTURE_GLB = join(repoRoot, "fixtures/threejs-parity/assets/character/robot-expressive.glb");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = readFileSync(file, "utf8");
const blocks = extractBlocks(text).filter((b) => !only || only.includes(b.index));
const work = realpathSync(mkdtempSync(join(tmpdir(), "a3d-sheet-")));
const engineVersion = JSON.parse(readFileSync(join(base, "node_modules/@aura3d/engine/package.json"), "utf8")).version;

function sourceFor(block) {
  if (!block.asset) return block.code;
  const sha = createHash("sha256").update(readFileSync(FIXTURE_GLB)).digest("hex");
  return block.code.replace("<64 hex of the file>", sha).replace('animations: ["Idle", "Walking"]', 'animations: ["Idle", "Walking", "Running"]');
}

function typecheck(block) {
  const dir = join(work, `tc${block.index}`);
  mkdirSync(join(dir, "src"), { recursive: true });
  cpSync(join(repoRoot, "tools/agent-eval/scaffold/tsconfig.json"), join(dir, "tsconfig.json"));
  symlinkSync(join(base, "node_modules"), join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "src/main.ts"), sourceFor(block));
  try {
    execFileSync(join(dir, "node_modules/.bin/tsc"), ["--noEmit", "-p", "tsconfig.json", "--pretty", "false"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { pass: true };
  } catch (error) {
    return { pass: false, output: String(error.stdout ?? error.message).slice(0, 1500) };
  }
}

function buildPages() {
  const site = join(work, "site");
  mkdirSync(join(site, "public/assets"), { recursive: true });
  symlinkSync(join(base, "node_modules"), join(site, "node_modules"), "dir");
  cpSync(FIXTURE_GLB, join(site, "public/assets/hero.glb"));
  cpSync(join(repoRoot, "public/hdri"), join(site, "public/hdri"), { recursive: true }); // looks.preset loads /hdri/<file>.hdr; scaffolded projects ship the same set
  const input = {};
  for (const block of blocks) {
    mkdirSync(join(site, `b${block.index}/src`), { recursive: true });
    writeFileSync(join(site, `b${block.index}/src/main.ts`), sourceFor(block));
    writeFileSync(join(site, `b${block.index}/index.html`), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}#app{width:100vw;height:100vh}</style></head><body><div id="app"></div><script type="module" src="./src/main.ts"></script></body></html>`);
    input[`b${block.index}`] = join(site, `b${block.index}/index.html`);
  }
  writeFileSync(join(site, "vite.config.mjs"), `export default { root: ${JSON.stringify(site)}, build: { target: "esnext", outDir: "dist", rollupOptions: { input: ${JSON.stringify(input)} } } };`);
  execFileSync("nice", ["-n", "10", join(site, "node_modules/.bin/vite"), "build", "--config", "vite.config.mjs", "--logLevel", "warn"], { cwd: site, stdio: "inherit" });
  return join(site, "dist");
}

function serve(root) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".png": "image/png" };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let path = join(root, decodeURIComponent(url.pathname));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    if (!extname(path)) path = join(path, "index.html");
    if (!existsSync(path)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function withLock(name, fn) {
  const lock = `/tmp/${name}.lock`;
  while (true) {
    try { mkdirSync(lock); break; } catch { await sleep(20 + Math.random() * 60); }
  }
  try { return await fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => { this.pending.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result))); });
  }
}

async function decodePng(buffer) {
  const sharp = (await import(join(repoRoot, "node_modules/sharp/lib/index.js"))).default;
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

async function renderAll(distDir) {
  const server = await serve(distDir);
  const port = server.address().port;
  const profile = mkdtempSync(join(tmpdir(), "a3d-sheet-chrome-"));
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--ignore-gpu-blocklist", "--enable-webgl", "--window-size=960,600", "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let browserWs = "";
  chrome.stderr.on("data", (d) => { const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/); if (m) browserWs = m[1]; });
  for (let i = 0; i < 100 && !browserWs; i += 1) await sleep(100);
  if (!browserWs) throw new Error("headless Chrome did not start");
  const cdpPort = new URL(browserWs).port;
  const results = new Map();
  let gpu = "unknown";
  try {
    for (const block of blocks) {
      const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, fail) => { ws.addEventListener("open", ok); ws.addEventListener("error", fail); });
      const cdp = new Cdp(ws);
      await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/b${block.index}/index.html` });
      await sleep(SETTLE_MS);
      if (gpu === "unknown") {
        const r = await cdp.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g && g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "no-webgl2"; })()` });
        gpu = String(r.result.value);
      }
      const shot = async () => decodePng(Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      const first = await shot();
      await sleep(FRAME_GAP_MS);
      const second = await shot();
      const errors = cdp.events
        .filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Log.entryAdded" && e.params.entry.level === "error" && !/favicon\.ico$/.test(e.params.entry.url ?? "")) || (e.method === "Runtime.consoleAPICalled" && (e.params.type === "error" || /CUSTOM_SHADER_COMPILE_FAILED/.test(JSON.stringify(e.params)))))
        .map((e) => (e.method === "Runtime.exceptionThrown" ? `exception: ${e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text}` : JSON.stringify(e.params).slice(0, 400)));
      const verdict = analyzeFrames(first, second, { animated: block.animated });
      if (errors.length) { verdict.pass = false; verdict.failures.push(`${errors.length} page error(s): ${errors[0].slice(0, 700)}`); }
      const sharp = (await import(join(repoRoot, "node_modules/sharp/lib/index.js"))).default;
      mkdirSync(join(outDir, "frames"), { recursive: true });
      for (const [tag, frame] of [["t0", first], ["t3", second]]) {
        await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } }).png().toFile(join(outDir, "frames", `block${String(block.index).padStart(2, "0")}-${tag}.png`));
      }
      results.set(block.index, verdict);
      console.log(`block ${block.index} ${block.heading}: ${verdict.pass ? "render ok" : "RENDER FAIL"} lit=${verdict.frame1.litFraction.toFixed(2)} diff=${verdict.difference.toFixed(2)}${verdict.failures.length ? ` ${verdict.failures.join("; ")}` : ""}`);
      ws.close();
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${target.id}`).catch(() => undefined);
    }
  } finally {
    chrome.kill("SIGKILL"); server.close(); rmSync(profile, { recursive: true, force: true });
  }
  return { results, gpu };
}

const entries = blocks.map((block) => ({ index: block.index, heading: block.heading, lines: block.lines, render_mode: block.render, sha256: block.sha256, typecheck: typecheck(block) }));
for (const e of entries) console.log(`block ${e.index} ${e.heading}: typecheck ${e.typecheck.pass ? "ok" : `FAIL\n${e.typecheck.output}`} (${e.lines} lines)`);

let gpu = null;
if (doRender && entries.every((e) => e.typecheck.pass)) {
  const reuse = opt("--dist", "");
  const dist = reuse ? resolve(reuse) : await withLock("a3d-build", async () => buildPages());
  const { results, gpu: g } = await withLock("a3d-rea", () => renderAll(dist));
  gpu = g;
  for (const e of entries) {
    const v = results.get(e.index);
    e.render = { pass: v.pass, failures: v.failures, litFraction: +v.frame1.litFraction.toFixed(3), stdLuma: +v.frame1.stdLuma.toFixed(2), difference: +v.difference.toFixed(3) };
  }
}
const failed = entries.filter((e) => !e.typecheck.pass || (doRender && !e.render?.pass));
if (doRender && !only) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.json"), `${JSON.stringify({ file: "docs/agents/first-screen.md", engine: engineVersion, gpuRenderer: gpu, thresholds: THRESHOLDS, frameGapMs: FRAME_GAP_MS, blocks: entries.map((e) => ({ ...e, typecheck: { pass: e.typecheck.pass } })) }, null, 2)}\n`);
}
rmSync(work, { recursive: true, force: true });
console.log(`${entries.length} blocks, ${failed.length} failed${gpu ? `, GPU ${gpu}` : ""}; engine ${engineVersion}`);
process.exit(failed.length ? 1 : 0);
