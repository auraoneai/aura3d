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

async function filmGame(browser, baseUrl, key, cfg, outDir) {
  const url = `${baseUrl}/apps/${cfg.route}/?autoplay=1`;
  const frames = Math.max(12, cfg.frames || Number(arg("frames", 48)));
  const gameDir = path.join(outDir, key);
  fs.mkdirSync(gameDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const console_ = [];
  const errors = [];
  page.on("console", (m) => console_.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => errors.push("reqfail " + r.url().split("/").pop() + " " + (r.failure()?.errorText ?? "")));
  await page.route(/\.(wav|mp3|ogg|m4a)(\?|$)/i, (r) => r.abort());
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
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
    for (let i = 0; i < frames; i++) {
      const grab = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        const ev = (window.__AURA3D_GAME_EVIDENCE__ ?? window.__AURA3D_GAME__ ?? null);
        let dataUrl = null;
        try { dataUrl = c ? c.toDataURL("image/png") : null; } catch { /* fallthrough */ }
        return { dataUrl, evidence: ev ? JSON.parse(JSON.stringify(ev)) : null, t: performance.now() };
      });
      samples.push({ i, wallMs: Date.now() - grabStart, pageT: grab.t, evidence: grab.evidence });
      let wrote = false;
      if (grab.dataUrl && grab.dataUrl.startsWith("data:image/png")) {
        const buf = Buffer.from(grab.dataUrl.slice(22), "base64");
        // Black-frame guard: under SwiftShader the engine's game-flag render
        // path can leave the drawing buffer un-presented to toDataURL; a
        // uniformly black grab is not evidence.
        const head = buf.subarray(32, 1600);
        let nonBlack = 0;
        for (let b = 0; b < head.length; b += 13) {
          if (head[b] > 24 || head[b + 1] > 24 || head[b + 2] > 24) nonBlack += 1;
        }
        if (nonBlack > 3) {
          fs.writeFileSync(path.join(gameDir, `film-${String(i).padStart(2, "0")}.png`), buf);
          wrote = true;
        }
      }
      if (!wrote) {
        // Compositor fallback — FULL-PAGE (clipped screenshots of the canvas
        // region come back black under SwiftShader; the unclipped page shot
        // is the path the visual-QA harness uses and it carries real pixels,
        // HUD included, which the rubric wants anyway).
        for (let attempt = 0; attempt < 2 && !wrote; attempt += 1) {
          try {
            await page.screenshot({
              path: path.join(gameDir, `film-${String(i).padStart(2, "0")}.png`),
              timeout: 45000
            });
            const shot = fs.readFileSync(path.join(gameDir, `film-${String(i).padStart(2, "0")}.png`));
            const head = shot.subarray(64, 2048);
            let nonBlack = 0;
            for (let b = 0; b < head.length; b += 17) {
              if (head[b] > 26 || head[b + 1] > 26 || head[b + 2] > 26) nonBlack += 1;
            }
            if (nonBlack > 3) wrote = true;
            else if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
          } catch {
            errors.push(`film-${i} screenshot attempt ${attempt} failed`);
          }
        }
        if (!wrote) errors.push(`film-${i} grab failed (toDataURL + screenshot both black/failed)`);
      }
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
    await context.close();
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
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox", "--disable-gpu-compositing", "--disable-dev-shm-usage",
      "--disable-extensions", "--mute-audio", "--renderer-process-limit=1"]
  });
  try {
    const results = [];
    for (const key of GAME_KEYS) {
      const cfg = GAMES[key];
      if (!cfg) throw new Error(`unknown game key: ${key}`);
      console.log(`filming ${key} (${cfg.route})…`);
      results.push(await filmGame(browser, baseUrl, key, cfg, outDir));
    }
    fs.writeFileSync(path.join(outDir, "film-report.json"), JSON.stringify({ mode: PROD ? "prod" : "local", base: baseUrl, results }, null, 1));
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
    served?.server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
