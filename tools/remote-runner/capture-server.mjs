#!/usr/bin/env node
/*
 * Aura3D remote capture server — runs ON the EC2 remote runner.
 *
 * Receives a packed serve-tree (tar.gz) per work id, serves it over an
 * ephemeral localhost static server, drives headless Chromium via
 * playwright-core + system chromium, and stores artifacts for download.
 *
 * Endpoints:
 *   GET  /health                     -> {ok:true}
 *   PUT  /work/:id                   body = application/gzip tar -> extract to ROOT/<id>/serve
 *   POST /capture/:id?url=<path>&w=&h=&waitMs=&clicks=&keys=&demo=1
 *                                    -> serve ROOT/<id>/serve on ephemeral port,
 *                                       chromium screenshot(s)+console+__gameEvidence
 *                                       into ROOT/<id>/out/
 *   GET  /out/:id                    -> JSON artifact list
 *   GET  /out/:id/:file              -> stream artifact
 */
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, rmSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.CAPTURE_ROOT || "/opt/aura3d-captures";
const PORT = Number(process.env.CAPTURE_PORT || 8099);
// playwright resolved lazily; CHROME_PATH may point at a system chromium.
const CHROME_PATH = process.env.CHROME_PATH || "";

mkdirSync(ROOT, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".ktx2": "image/ktx2",
  ".bin": "application/octet-stream",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

function send(res, code, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json" : "application/octet-stream", ...headers });
  res.end(data);
}

function safeId(id) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(id) ? id : null;
}

// Minimal streaming tar extractor (ustar) — avoids a shelling tar dependency edge.
function extractTar(buffer, destDir) {
  mkdirSync(destDir, { recursive: true });
  let off = 0;
  while (off + 512 <= buffer.length) {
    const header = buffer.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim() || "0", 8);
    const type = String.fromCharCode(header[156]);
    off += 512;
    const filePath = path.join(destDir, fullName);
    if (!filePath.startsWith(path.resolve(destDir))) throw new Error(`unsafe tar path ${fullName}`);
    if (type === "5") {
      mkdirSync(filePath, { recursive: true });
    } else if (type === "0" || type === "\0" || type === "") {
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, buffer.subarray(off, off + size));
    }
    off += Math.ceil(size / 512) * 512;
  }
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function serveStatic(serveDir, port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(serveDir, urlPath);
    if (!filePath.startsWith(path.resolve(serveDir))) return send(res, 403, "forbidden");
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      // SPA-ish fallback: try index.html under the dir, then root index.html.
      // Log misses — a fetch() for a missing asset gets HTML back here and
      // surfaces elsewhere as an opaque parse error (e.g. "<!doctype" JSON).
      const dirIndex = path.join(filePath, "index.html");
      const rootIndex = path.join(serveDir, "index.html");
      const fallback = existsSync(dirIndex) ? dirIndex : rootIndex;
      if (!/\.(html?|png|jpe?g|webp|svg|ico|css|map)$/i.test(urlPath)) {
        process.stderr.write(`spa-fallback ${urlPath} -> ${path.relative(serveDir, fallback)}\n`);
      }
      filePath = fallback;
    }
    if (!existsSync(filePath)) return send(res, 404, "not found");
    res.writeHead(200, { "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server;
}

async function runCapture(id, params) {
  const workDir = path.join(ROOT, id);
  const serveDir = path.join(workDir, "serve");
  const outDir = path.join(workDir, "out");
  const absUrl = params.absUrl || "";
  if (!absUrl && !existsSync(serveDir)) throw new Error(`no serve tree for id ${id} — PUT /work/${id} first`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const staticServer = absUrl ? null : await serveStatic(serveDir, 0);
  const port = staticServer ? staticServer.address().port : 0;
  const urlPath = params.url || "/";
  const width = Number(params.w || 1600);
  const height = Number(params.h || 900);
  const waitMs = Number(params.waitMs || 6000);
  const shotCount = Math.min(8, Math.max(1, Number(params.shots || 3)));
  const shotInterval = Number(params.shotInterval || 1500);
  // Film mode: grab `frames` canvas frames from the LIVE page (never paused,
  // never stepped) at ~frameInterval ms via canvas.toDataURL — the engine's
  // WebGL2 context runs with preserveDrawingBuffer:true so each grab is a true
  // presented frame. Evidence is sampled alongside every frame so motion can
  // be verified numerically (ball/palm/club positions per frame).
  const film = params.film === "1" || params.film === "true";
  const filmFrames = Math.min(90, Math.max(12, Number(params.frames || 24)));
  const filmInterval = Math.min(1000, Math.max(40, Number(params.frameInterval || 110)));
  const filmReady = params.readyExpr || ""; // optional JS boolean expression polled before filming

  const captureScript = `
const { chromium } = require(${JSON.stringify(process.env.PLAYWRIGHT_MODULE || "playwright-core")});
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ${CHROME_PATH ? `executablePath: ${JSON.stringify(CHROME_PATH)},` : ""}
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      // SwiftShader rasterizes WebGL on CPU; without this Chromium's GPU
      // compositor can't pull the surface into page.screenshot under memory
      // pressure -> DOM renders, canvas stays black, target eventually OOMs.
      "--disable-gpu-compositing",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--mute-audio",
      "--renderer-process-limit=1",
      "--js-flags=--max-old-space-size=384"
    ]
  });
  const page = await browser.newPage({ viewport: { width: ${width}, height: ${height} } });
  // Decoded audio costs large buffers the box can't spare under contention;
  // the games treat SFX as best-effort, so drop media fetches entirely.
  await page.route(/\\.(wav|mp3|ogg|m4a)(\\?|$)/i, (r) => r.abort());
  const console_ = [];
  const errors = [];
  page.on("console", (m) => console_.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => errors.push("reqfail " + r.url() + " " + (r.failure() ? r.failure().errorText : "")));
  page.on("response", (r) => { if (r.status() >= 400) errors.push("http" + r.status() + " " + r.url()); });
  const dump = async (tag) => {
    let evidence = null;
    try { evidence = await page.evaluate(() => (window.__gameEvidence ?? window.__auraEvidence ?? window.__AURA3D_GAME_EVIDENCE__ ?? null)); } catch (e) {}
    let gameBeacon = null;
    try { gameBeacon = await page.evaluate(() => (window.__AURA3D_GAME__ ?? null)); } catch (e) {}
    let routeReady = null;
    try { routeReady = await page.evaluate(() => (window.__AURA3D_ROUTE_READY__ ?? null)); } catch (e) {}
    const metrics = await page.evaluate(() => ({ title: document.title, canvas: !!document.querySelector("canvas"), webgl2: (() => { try { const c = document.createElement("canvas"); return !!c.getContext("webgl2"); } catch (e) { return false; } })() })).catch(() => null);
    const suffix = tag ? "-" + tag : "";
    const fs = require("fs");
    const seen = new WeakSet();
    const safe = (v) => { try { return JSON.stringify(v, (k, x) => (x && typeof x === "object" ? (seen.has(x) ? "[circular]" : (seen.add(x), x)) : x), 2); } catch (e) { return null; } };
    const w = (name, data) => { try { fs.writeFileSync(${JSON.stringify(outDir)} + "/" + name + suffix, data); } catch (e) {} };
    w("console.log", console_.join("\\n"));
    w("errors.log", errors.join("\\n"));
    w("evidence.json", safe(evidence));
    w("game-beacon.json", safe(gameBeacon));
    w("route-ready.json", safe(routeReady));
    w("metrics.json", safe(metrics));
  };
  const targetUrl = ${JSON.stringify(absUrl)} || (${JSON.stringify(`http://127.0.0.1:`)} + ${port} + ${JSON.stringify(urlPath)});
  await page.goto(targetUrl, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(${waitMs});
  await dump("pre");
  if (${film ? "true" : "false"}) {
    // ---- filmstrip: real-time frames off the live compositor ----
    const fs3 = require("fs");
    const readyExpr = ${JSON.stringify(filmReady)};
    if (readyExpr) {
      await page.waitForFunction(new Function("return (" + readyExpr + ")"), null, { timeout: 120000, polling: 250 }).catch((e) => errors.push("readyExpr never true: " + String(e).split("\\n")[0]));
    }
    const t0 = Date.now();
    const samples = [];
    for (let i = 0; i < ${filmFrames}; i++) {
      const grab = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        const ev = (window.__AURA3D_GAME_EVIDENCE__ ?? window.__AURA3D_GAME__ ?? null);
        let dataUrl = null;
        try { dataUrl = c ? c.toDataURL("image/png") : null; } catch (e) {}
        return { dataUrl, evidence: ev ? JSON.parse(JSON.stringify(ev)) : null, t: performance.now() };
      });
      samples.push({ i, wallMs: Date.now() - t0, pageT: grab.t, evidence: grab.evidence });
      if (grab.dataUrl && grab.dataUrl.startsWith("data:image/png")) {
        fs3.writeFileSync(${JSON.stringify(outDir)} + "/film-" + String(i).padStart(2, "0") + ".png", Buffer.from(grab.dataUrl.slice(22), "base64"));
      } else {
        errors.push("film-" + i + " grab failed");
      }
      // Sleep the remainder of the frame budget WITHOUT stopping the game —
      // the rAF loop keeps running at full speed the whole time.
      const elapsed = Date.now() - t0 - i * ${filmInterval};
      await new Promise((r) => setTimeout(r, Math.max(0, ${filmInterval} - elapsed)));
    }
    fs3.writeFileSync(${JSON.stringify(outDir)} + "/film-samples.json", JSON.stringify(samples, null, 1));
    await dump("");
    await browser.close();
    process.exit(0);
  }
  for (let i = 0; i < ${shotCount}; i++) {
    // SwiftShader rasterizes on CPU; a busy WebGL rAF loop can starve the
    // compositor past the 30s default screenshot timeout. Keep the attempt
    // short, then fall back to a direct canvas grab — the engine's WebGL2
    // context runs with preserveDrawingBuffer:true, so toDataURL returns the
    // real frame without compositor involvement.
    try {
      await page.screenshot({ path: ${JSON.stringify(outDir)} + "/shot-" + i + ".png", timeout: 30000 });
    } catch (e) {
      errors.push("shot-" + i + " failed: " + String(e).split("\\n")[0]);
      try {
        const dataUrl = await page.evaluate(() => {
          const c = document.querySelector("canvas");
          return c ? c.toDataURL("image/png") : null;
        });
        if (dataUrl && dataUrl.startsWith("data:image/png")) {
          const fs2 = require("fs");
          fs2.writeFileSync(${JSON.stringify(outDir)} + "/shot-" + i + ".png", Buffer.from(dataUrl.slice(22), "base64"));
          errors.push("shot-" + i + " recovered via canvas.toDataURL");
        }
      } catch (e2) {
        errors.push("shot-" + i + " canvas grab failed: " + String(e2).split("\\n")[0]);
      }
    }
    await page.waitForTimeout(${shotInterval});
  }
  await dump("");
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
`;

  const scriptPath = path.join(workDir, "capture.cjs");
  writeFileSync(scriptPath, captureScript);
  // spawn must stay async: the in-process static server above can only answer
  // Chromium's requests while this event loop is free (spawnSync deadlocks it).
  const result = await new Promise((resolve) => {
    const child = spawn("node", [scriptPath]);
    let stdout = "";
    let stderr = "";
    // Must outlive waitMs + shots x (screenshot timeout + interval) under
    // SwiftShader — generous cap, screenshots are the slow part.
    const budgetMs = 60000 + waitMs + shotCount * (120000 + shotInterval);
    const timer = setTimeout(() => child.kill("SIGKILL"), Math.min(budgetMs, 900000));
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: `${stderr}${err}` });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
  writeFileSync(path.join(outDir, "capture.stderr.log"), `${result.stdout || ""}\n${result.stderr || ""}`);
  staticServer?.close();
  if (result.status !== 0) throw new Error(`capture failed (exit ${result.status}): ${(result.stderr || "").slice(0, 500)}`);
  return { port, shots: readdirSync(outDir).filter((f) => f.endsWith(".png")) };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

    if (req.method === "PUT" && parts[0] === "work" && parts.length === 2) {
      const id = safeId(parts[1]);
      if (!id) return send(res, 400, "bad id");
      const body = await readBody(req);
      const workDir = path.join(ROOT, id);
      rmSync(path.join(workDir, "serve"), { recursive: true, force: true });
      mkdirSync(workDir, { recursive: true });
      const tarPath = path.join(workDir, "payload.tar.gz");
      writeFileSync(tarPath, body);
      // gunzip then untar (buffered; payloads are tens of MB at most)
      const zlib = await import("node:zlib");
      const tar = zlib.gunzipSync(body);
      extractTar(tar, path.join(workDir, "serve"));
      return send(res, 200, { ok: true, bytes: body.length });
    }

    if (req.method === "POST" && parts[0] === "capture" && parts.length === 2) {
      const id = safeId(parts[1]);
      if (!id) return send(res, 400, "bad id");
      const params = Object.fromEntries(url.searchParams);
      const result = await runCapture(id, params);
      return send(res, 200, { ok: true, ...result });
    }

    if (req.method === "GET" && parts[0] === "out" && parts.length === 2) {
      const id = safeId(parts[1]);
      if (!id) return send(res, 400, "bad id");
      const outDir = path.join(ROOT, id, "out");
      const files = existsSync(outDir) ? readdirSync(outDir).map((f) => ({ name: f, size: statSync(path.join(outDir, f)).size })) : [];
      return send(res, 200, { files });
    }

    if (req.method === "GET" && parts[0] === "out" && parts.length === 3) {
      const id = safeId(parts[1]);
      const file = path.basename(parts[2]);
      const fp = path.join(ROOT, id, "out", file);
      if (!id || !existsSync(fp)) return send(res, 404, "not found");
      res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      return createReadStream(fp).pipe(res);
    }

    return send(res, 404, "not found");
  } catch (err) {
    return send(res, 500, String((err && err.stack) || err));
  }
});

// SSM port-forward throughput is ~100-300KB/s; tens-of-MB payloads need the
// request timeout lifted well beyond Node's 300s default.
server.requestTimeout = 1800000;
server.headersTimeout = 120000;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`capture-server listening on 127.0.0.1:${PORT} root=${ROOT}`);
});
