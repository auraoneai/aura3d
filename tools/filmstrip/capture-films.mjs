#!/usr/bin/env node
/**
 * tools/filmstrip/capture-films.mjs — REAL-TIME filmstrip capture of the live
 * showcase games, for verification that motion (dribble/swing/kick/draw) reads.
 *
 * Runs on a remote runner (CI) per the machine policy — never in the local
 * agent process. The page is NEVER paused or stepped: the game runs at its
 * normal speed and each frame is grabbed off the live canvas via
 * canvas.toDataURL (the engine's WebGL2 context has preserveDrawingBuffer),
 * with the game's evidence channel sampled alongside every frame so motion can
 * be verified numerically too.
 *
 * Usage:
 *   node tools/filmstrip/capture-films.mjs --dist marketing/dist --out <dir> \
 *     [--games hoops,diamond,fc,links,siege,ironcrown] [--frames 48] [--interval 110]
 *   node tools/filmstrip/capture-films.mjs --prod --out <dir> [...]
 *
 * --dist  serve that directory locally (the full marketing build with every
 *         /apps/<route>/ + aura-assets) and film from it.
 * --prod  film the deployed https://aura3d.auraone.ai directly.
 *
 * Outputs per game: film-NN.png (>= 12 frames), film-samples.json (per-frame
 * evidence), console.log / errors.log, and film.mp4 (10fps) when ffmpeg exists.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
const { chromium } = requireFromRepo("playwright");

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const GAMES = {
  hoops: {
    route: "showcase-aura-hoops-3d",
    // film through live play: autopilot mixes stand-and-pound with drives
    ready: `(() => { const e = window.__AURA3D_GAME__; return !!e && e.phase === "live" && !!e.holder; })()`,
    frames: 60
  },
  diamond: {
    route: "showcase-aura-diamond-3d",
    // the autoplay at-bat loop: stance → pitch → swing → contact
    ready: `(() => { const e = window.__AURA3D_GAME__; return !!e && (e.phase === "pitch" || e.phase === "batting" || typeof e.swingTimer === "number" || !!e.ball); })()`,
    frames: 60
  },
  fc: {
    route: "showcase-aura-fc-3d",
    ready: `(() => { const e = window.__AURA3D_GAME__; return !!e && (e.phase === "play" || e.phase === "live" || !!e.ballPhysics || !!e.ball); })()`,
    frames: 60
  },
  links: {
    route: "showcase-aura-links-3d",
    // catch address or the swing drive itself
    ready: `(() => { const e = window.__AURA3D_GAME__; const s = e && e.swing; return !!s || (!!e && (e.phase === "address" || e.phase === "aim" || e.phase === "swing")); })()`,
    frames: 48
  },
  siege: {
    route: "showcase-slingshot-siege",
    // arm at the draw so the strip catches hold → release → snap → flight
    ready: `(() => { const e = window.__AURA3D_GAME__; const a = e && (e.aim ?? (e["showcase-slingshot-siege"] && e["showcase-slingshot-siege"].aim)); return !!a && a.drawing === true && a.drawT > 0.2; })()`,
    frames: 40
  },
  ironcrown: {
    route: "showcase-iron-crown",
    ready: `(() => { const e = window.__AURA3D_GAME__; return !!e && (e.state === "fight" || e.phase === "fight" || e.phase === "attract"); })()`,
    frames: 48
  }
};

const DIST = arg("dist", flag("prod") ? "" : "marketing/dist");
const OUT = arg("out", ".local-evidence/user-feedback-2026-10-20/after");
const GAME_KEYS = (arg("games", "") || Object.keys(GAMES).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const FRAME_INTERVAL = Number(arg("interval", 110));
const PROD = flag("prod");
const BASE = PROD ? "https://aura3d.auraone.ai" : null;

function serveDir(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = path.join(dir, urlPath);
      if (!filePath.startsWith(path.resolve(dir))) { res.writeHead(403).end(); return; }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath)) { res.writeHead(404).end(); return; }
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css",
        ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
        ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".wasm": "application/wasm",
        ".woff2": "font/woff2", ".wav": "audio/wav", ".mp3": "audio/mpeg"
      }[ext] || "application/octet-stream";
      res.writeHead(200, { "content-type": mime });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function filmGame(baseUrl, key, cfg, outDir) {
  const url = `${baseUrl}/apps/${cfg.route}/?autoplay=1`;
  const frames = Math.max(12, cfg.frames || Number(arg("frames", 48)));
  const gameDir = path.join(outDir, key);
  fs.mkdirSync(gameDir, { recursive: true });
  // Dedicated throwaway browser per game, launched exactly like the visual-QA
  // harness (bare launch — the EC2-era SwiftShader flags produce black frames
  // on this runner, and WebGL game routes wedge a shared GPU process anyway).
  const browser = await chromium.launch({ timeout: 45000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  // CDP captureScreenshot is the only path proven to return real WebGL pixels
  // on the CI runner (page.screenshot times out; toDataURL is black until the
  // first presented frame). Open the session up front.
  const cdp = await context.newCDPSession(page);
  const console_ = [];
  const errors = [];
  page.on("console", (m) => console_.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => errors.push("reqfail " + r.url().split("/").pop() + " " + (r.failure()?.errorText ?? "")));
  await page.route(/\.(wav|mp3|ogg|m4a)(\?|$)/i, (r) => r.abort());
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("canvas", { timeout: 60000 });
    // settle: boot gate, GLB loads, autopilot starts
    await page.waitForTimeout(15000);
    try {
      await page.waitForFunction(new Function(`return (${cfg.ready})`), null, { timeout: 240000, polling: 250 });
    } catch {
      errors.push(`ready predicate never satisfied for ${key} — filming anyway`);
    }
    const grabStart = Date.now();
    const samples = [];
    const nonBlackBuf = (buf) => {
      const head = buf.subarray(64, 4096);
      let n = 0;
      for (let b = 0; b < head.length; b += 17) {
        if (head[b] > 26 || head[b + 1] > 26 || head[b + 2] > 26) n += 1;
      }
      return n > 3;
    };
    for (let i = 0; i < frames; i++) {
      const grab = await page.evaluate(() => {
        const ev = (window.__AURA3D_GAME_EVIDENCE__ ?? window.__AURA3D_GAME__ ?? null);
        return { evidence: ev ? JSON.parse(JSON.stringify(ev)) : null, t: performance.now() };
      });
      samples.push({ i, wallMs: Date.now() - grabStart, pageT: grab.t, evidence: grab.evidence });
      let wrote = false;
      // 1) CDP compositor capture (probe-verified real pixels)
      try {
        const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        const buf = Buffer.from(shot.data, "base64");
        if (nonBlackBuf(buf)) {
          fs.writeFileSync(path.join(gameDir, `film-${String(i).padStart(2, "0")}.png`), buf);
          wrote = true;
        }
      } catch { /* fall through */ }
      // 2) canvas readback once the first frame presented
      if (!wrote) {
        try {
          const dataUrl = await page.evaluate(() => document.querySelector("canvas")?.toDataURL("image/png") ?? null);
          if (dataUrl && dataUrl.startsWith("data:image/png")) {
            const buf = Buffer.from(dataUrl.slice(22), "base64");
            if (nonBlackBuf(buf)) {
              fs.writeFileSync(path.join(gameDir, `film-${String(i).padStart(2, "0")}.png`), buf);
              wrote = true;
            }
          }
        } catch { /* fall through */ }
      }
      if (!wrote) errors.push(`film-${i} grab failed (CDP + toDataURL both black/failed)`);
      const elapsed = Date.now() - grabStart - i * FRAME_INTERVAL;
      await new Promise((r) => setTimeout(r, Math.max(0, FRAME_INTERVAL - elapsed)));
    }
    fs.writeFileSync(path.join(gameDir, "film-samples.json"), JSON.stringify({
      game: key, route: cfg.route, url, frames, intervalMs: FRAME_INTERVAL,
      loadMs: grabStart - t0, totalWallMs: Date.now() - grabStart, samples
    }, null, 1));
    const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
    if (hasFfmpeg) {
      const fps = (1000 / FRAME_INTERVAL).toFixed(2);
      spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-framerate", fps,
        "-i", path.join(gameDir, "film-%02d.png"), "-pix_fmt", "yuv420p", "-y",
        path.join(gameDir, "film.mp4")], { stdio: "ignore" });
    }
  } finally {
    fs.writeFileSync(path.join(gameDir, "console.log"), console_.join("\n"));
    fs.writeFileSync(path.join(gameDir, "errors.log"), errors.join("\n"));
    await browser.close();
  }
  return { key, url, frames, errors: errors.length };
}

(async () => {
  const outDir = path.resolve(OUT);
  fs.mkdirSync(outDir, { recursive: true });
  let baseUrl = BASE;
  let served;
  if (!PROD) {
    const dist = path.resolve(DIST);
    if (!fs.existsSync(dist)) throw new Error(`dist not found: ${dist}`);
    served = await serveDir(dist);
    baseUrl = `http://127.0.0.1:${served.port}`;
    console.log(`serving ${dist} on ${baseUrl}`);
  }
  try {
    const results = [];
    for (const key of GAME_KEYS) {
      const cfg = GAMES[key];
      if (!cfg) throw new Error(`unknown game key: ${key}`);
      console.log(`filming ${key} (${cfg.route})…`);
      results.push(await filmGame(baseUrl, key, cfg, outDir));
    }
    fs.writeFileSync(path.join(outDir, "film-report.json"), JSON.stringify({ mode: PROD ? "prod" : "local", base: baseUrl, results }, null, 1));
    console.log(JSON.stringify(results));
  } finally {
    served?.server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
