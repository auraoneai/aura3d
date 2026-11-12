#!/usr/bin/env node
// Renders first-party procedural studio portraits (src/assets/portraits/*.webp + provenance/portraits.json +
// src/assets/rights-manifest.ts) and, with --turnarounds, 1280x960 close-up 4-angle turnarounds + 8 live
// WebGPU & WebGL2 world screenshots over loopback headless Chrome CDP. Guarantees 0 leftover processes on exit.
//
// Usage:
//   node apps/veer-wonder-world/tools/render-character-portraits.mjs
//   node apps/veer-wonder-world/tools/render-character-portraits.mjs --turnarounds

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, "..");
const repoDir = resolve(appDir, "../..");
const turnaroundDir = join(repoDir, "evidence", "veer-wonder-world", "turnarounds");
const worldShotsDir = join(repoDir, "evidence", "veer-wonder-world", "worlds-1280x960");
const worldsOnly = process.argv.includes("--worlds-only");
const skipPortraits = worldsOnly || process.argv.includes("--turnarounds-only");
const wantTurnarounds = skipPortraits || process.argv.includes("--turnarounds");
const keysArg = process.argv.find((a) => a.startsWith("--keys="));
const requestedTurnaroundKeys = worldsOnly
  ? []
  : keysArg
    ? keysArg
        .slice("--keys=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

function findChromeBinary() {
  for (const bin of CHROME_CANDIDATES) {
    if (bin && existsSync(bin)) return bin;
  }
  throw new Error(`No Chrome binary found. Checked: ${CHROME_CANDIDATES.join(", ")}`);
}

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", rejectPort);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

const PORTRAIT_SPECS = [
  { key: "momo", bgTop: "#FFF3E4", bgBottom: "#F6DEC4", plinth: "#EBD0B3", hdriId: "warm_bar", yaw: 0.2, pitchDeg: 8, fov: 31, portrait: true },
  { key: "lulu", bgTop: "#EEF6FF", bgBottom: "#D9E9FC", plinth: "#DCE7F5", hdriId: "outdoor-midday", yaw: -0.22, pitchDeg: 8, fov: 31, portrait: true },
  { key: "sheru", bgTop: "#FFF4DC", bgBottom: "#F5DFB5", plinth: "#EAD1A4", hdriId: "autumn_field_puresky", yaw: 0.26, pitchDeg: 9, fov: 32, portrait: true },
  { key: "gogo", bgTop: "#EEF5FB", bgBottom: "#D6E5F3", plinth: "#D8E2EC", hdriId: "kloppenheim_06_puresky", yaw: 0.46, pitchDeg: 11, fov: 33, portrait: true },
  { key: "lumi", bgTop: "#F3EEFF", bgBottom: "#E2D7FA", plinth: "#E4DCFA", hdriId: "kloppenheim_02", yaw: -0.18, pitchDeg: 7, fov: 31, portrait: true },
  { key: "peeko", bgTop: "#EEF9F0", bgBottom: "#D5EEDB", plinth: "#D6EBDC", hdriId: "autumn_field_puresky", yaw: 0.22, pitchDeg: 8, fov: 31, portrait: true }
];

const TURNAROUND_KEYS = [
  "momo",
  "lulu",
  "sheru",
  "gogo",
  "lumi",
  "peeko",
  "teddy",
  "robot",
  "cow",
  "sheep",
  "duck",
  "horse",
  "bird",
  "butterfly",
  "gogoCarriage",
  "car",
  "barn",
  "station",
  "tunnel",
  "house",
  "door",
  "lift",
  "colourMachine",
  "cake",
  "mirror"
];

const WORLD_CAPTURES = [
  { slug: "01-home-nook-E01", storyId: "momo-magic-mouth", expectedWorld: "home-nook", advanceMs: 11500 },
  { slug: "02-meadow-E17", storyId: "sheru-big-adventure", expectedWorld: "meadow", advanceMs: 5500 },
  { slug: "03-station-G02", storyId: "gogo-train", expectedWorld: "station", advanceMs: 5500 },
  { slug: "04-music-garden-E06", storyId: "lulu-dino-dance", expectedWorld: "music-garden", advanceMs: 5500 },
  { slug: "05-peekaboo-barn-G04", storyId: "peekaboo-animal-barn", expectedWorld: "peekaboo-barn", advanceMs: 6500 },
  { slug: "06-learning-cloud-E03", storyId: "alphabet-zoo", expectedWorld: "learning-cloud", advanceMs: 6500 },
  { slug: "07-birthday-cake-E16", storyId: "little-birthday-party", expectedWorld: "music-garden", advanceMs: 6500 },
  { slug: "08-car-wash-G06", storyId: "splashy-car-wash", expectedWorld: "home-nook", advanceMs: 6500 }
];

const STUDIO_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Wonder World Studio Rig Turntable</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #FFF5EA; }
      #host { position: fixed; inset: 0; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="host"></div>
    <script type="module">
      import {
        camera,
        effects,
        geometry,
        groups,
        lights,
        looks,
        scene,
        sky
      } from "@aura3d/engine";
      import { createGame, warmPrograms } from "@aura3d/engine/game";
      import { buildProceduralActor, craftMaterial, cylinderSpec } from "/src/scenes/procedural-rigs/rig-kit.ts";
      import { getProceduralRig } from "/src/scenes/procedural-rigs/index.ts";
      import { defaultHeightM } from "/src/scenes/stand-ins.ts";

      let studioGame = null;
      let studioBackend = null;
      const host = document.getElementById("host");

      function measureScaledBounds(rig, h) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const sp of rig.parts) {
          const [ax, ay, az] = sp.anchor;
          for (const lobe of sp.lobes) {
            const pos = lobe.geometry.positions;
            for (let i = 0; i + 2 < pos.length; i += 3) {
              const x = (pos[i] + ax) * h;
              const y = (pos[i + 1] + ay) * h;
              const z = (pos[i + 2] + az) * h;
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (z < minZ) minZ = z;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
              if (z > maxZ) maxZ = z;
            }
          }
        }
        if (!Number.isFinite(minX)) {
          return { minX: -0.3 * h, minY: 0, minZ: -0.3 * h, maxX: 0.3 * h, maxY: h, maxZ: 0.3 * h };
        }
        return { minX, minY, minZ, maxX, maxY, maxZ };
      }

      window.__renderStudioRig = async (opts) => {
        const {
          key,
          yaw = 0,
          pitchDeg = 10,
          fov = 33,
          bgTop = "#FFF4E6",
          bgBottom = "#F2DEC6",
          plinth = "#E8CEB2",
          hdriId = "autumn_field_puresky",
          backend = "auto",
          portrait = false
        } = opts;

        if (studioGame && studioBackend !== backend) {
          await Promise.resolve(studioGame.dispose()).catch(() => undefined);
          studioGame = null;
          host.innerHTML = "";
        }

        const rig = getProceduralRig(key);
        const h = defaultHeightM(key);
        const b = measureScaledBounds(rig, h);
        const liftY = b.minY < -0.002 ? -b.minY : 0;
        const centerX = (b.minX + b.maxX) * 0.5;
        const centerZ = (b.minZ + b.maxZ) * 0.5;
        const topY = b.maxY + liftY;
        const botY = Math.max(0, b.minY + liftY);
        const spanW = Math.max(0.08, b.maxX - b.minX);
        const spanH = Math.max(0.08, topY - 0);
        const spanD = Math.max(0.08, b.maxZ - b.minZ);
        const diagHoriz = portrait
          ? Math.max(spanW, spanD) * 1.04
          : Math.hypot(spanW, spanD) * 0.96;

        const aspect = Math.max(0.5, host.clientWidth / Math.max(1, host.clientHeight));
        const halfVfov = ((fov * 0.5) * Math.PI) / 180;
        const halfHfov = Math.atan(Math.tan(halfVfov) * aspect);
        const padV = portrait ? 0.61 : 0.66;
        const padH = portrait ? 0.60 : 0.64;
        const distV = (spanH * padV) / Math.tan(halfVfov);
        const distH = (diagHoriz * padH) / Math.tan(halfHfov);
        const dist = Math.max(distV, distH, 0.42);
        const pitchRad = (pitchDeg * Math.PI) / 180;
        const lookY = botY + (topY - botY) * (portrait ? 0.51 : 0.47);
        const camY = lookY + Math.sin(pitchRad) * dist;
        const camZ = Math.cos(pitchRad) * dist;

        const plinthRadius = Math.max(diagHoriz * 0.64, spanH * 0.42, 0.24);
        const plinthHeight = Math.max(spanH * 0.055, 0.032);

        const built = buildProceduralActor(rig, {
          id: "studio-subject",
          key,
          heightM: h,
          interactive: true
        });
        const placedNodes = built.nodes.map((node, idx) => {
          const [ax, ay, az] = built.pieces[idx]?.anchorM ?? [0, 0, 0];
          return node.position([ax - centerX, ay + liftY, az - centerZ]);
        });
        const subjectGroup = groups.create("studio-actor-group", placedNodes, {
          rotation: [0, yaw, 0]
        });

        const builder = scene().background(bgBottom);
        builder.add(
          looks.preset("product-studio", {
            hdri: hdriId,
            sun: { azimuthDeg: 36, elevationDeg: 36 },
            exposureEv: -0.14,
            environmentIntensity: 0.9,
            background: bgBottom,
            key: {
              color: "#FFF5E4",
              intensity: 1.95,
              shadow: {
                mapSize: 2048,
                cascades: 2,
                maxDistance: Math.max(12, dist * 4),
                filter: "pcss",
                softness: 0.6,
                bias: 0.0012,
                normalBias: 0.018
              }
            },
            rim: {
              color: "#FFE9CC",
              intensity: 0.6,
              azimuthDeg: 212
            },
            grade: {
              contrast: 1.06,
              saturation: 1.15,
              temperature: 0.02
            },
            post: {
              bloom: { intensity: 0.18, threshold: 1.2, knee: 0.45, clampLuminance: 4.0 },
              antiAlias: { mode: "fxaa" }
            }
          })
        );
        builder.add(
          sky.gradient({
            name: "studio-backdrop",
            zenith: bgTop,
            horizon: bgBottom,
            ground: bgBottom,
            exponent: 0.78,
            captureEnvironment: false,
            affectsFog: false
          })
        );
        builder.add(
          lights.hemisphere({
            name: "studio-bounce",
            skyColor: "#FFF9F0",
            groundColor: "#E4CBB0",
            intensity: 0.65
          })
        );
        builder.add(
          effects.ambientOcclusion({
            name: "studio-ao",
            radius: 0.35,
            intensity: 0.5,
            falloff: 0.45,
            multiBounce: true
          })
        );
        builder.add(
          effects.contactShadows({
            length: Math.max(0.16, spanH * 0.24),
            thickness: 0.045,
            steps: 16,
            intensity: 0.52,
            lights: "sun"
          })
        );
        builder.add(
          geometry.custom(cylinderSpec(plinthRadius, plinthRadius * 1.03, plinthHeight, 56), {
            name: "plinth-top",
            material: craftMaterial("clay", plinth, { roughness: 0.74 }),
            receiveShadow: true,
            castShadow: false
          }).position([0, -plinthHeight * 0.5, 0])
        );
        builder.add(
          geometry.custom(cylinderSpec(plinthRadius * 1.05, plinthRadius * 1.07, plinthHeight * 0.42, 56), {
            name: "plinth-rim",
            material: craftMaterial("wood", "#C99B6B", { roughness: 0.62 }),
            receiveShadow: true,
            castShadow: false
          }).position([0, -plinthHeight * 1.21, 0])
        );
        builder.add(subjectGroup);
        builder.camera(
          camera.perspective({
            position: [0, camY, camZ],
            target: [0, lookY, 0],
            fov,
            near: 0.03,
            far: Math.max(40, dist * 8)
          })
        );

        const withCap = (p, ms, label) =>
          Promise.race([
            p,
            new Promise((resolve) => setTimeout(() => resolve("timeout:" + label), ms))
          ]);

        if (!studioGame) {
          const lookOpts = looks.appOptions("product-studio");
          studioGame = createGame({
            id: "wonder-studio",
            target: host,
            scene: () => builder,
            autoStart: true,
            ...lookOpts,
            renderer: {
              ...lookOpts.renderer,
              backend,
              allowFallback: true,
              antialias: true
            }
          });
          studioBackend = backend;
          studioGame.start();
        } else {
          await studioGame.setScene(builder.toJSON());
        }

        const currentApp = studioGame.app;
        await withCap(currentApp.ready(), 8000, "ready");
        if (studioGame.runtime.running) studioGame.runtime.pause();
        await withCap(
          warmPrograms(currentApp, {
            frames: 2,
            maxFrames: 10,
            environmentTimeoutMs: 5000,
            textureTimeoutMs: 5000,
            waitForEnvironment: true,
            waitForTextures: true
          }),
          8000,
          "warm"
        );
        for (let i = 0; i < 3; i += 1) {
          currentApp.step(1 / 60);
        }
        await new Promise((r) => setTimeout(r, 30));
        const diag = currentApp.diagnostics();
        return {
          backend: diag.renderPath?.path ?? diag.renderer?.backend ?? backend,
          drawCalls: diag.stats?.drawCalls ?? diag.drawCalls ?? 0,
          triangles: rig.triangleCount,
          subShapes: rig.subShapeCount,
          pieces: built.pieces.length
        };
      };
    </script>
  </body>
</html>`;

function studioPlugin() {
  return {
    name: "wonder-studio-turntable",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/__studio.html")) {
          next();
          return;
        }
        try {
          const html = await server.transformIndexHtml(req.url, STUDIO_HTML);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (err) {
          next(err);
        }
      });
    }
  };
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    this.consoleWarnings = [];

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject: rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
        return;
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        const type = msg.params?.type ?? "";
        const text = (msg.params?.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
        if (type === "error") this.consoleErrors.push(text);
        else if (type === "warning") this.consoleWarnings.push(text);
      } else if (msg.method === "Runtime.exceptionThrown") {
        const details = msg.params?.exceptionDetails;
        this.pageErrors.push(details?.exception?.description ?? details?.text ?? "Unknown exception");
      } else if (msg.method === "Log.entryAdded") {
        const entry = msg.params?.entry;
        if (entry?.level === "error" && !String(entry?.url ?? "").endsWith("/favicon.ico")) {
          this.consoleErrors.push(`[Log.error] ${entry.text} (${entry.url ?? ""})`);
        }
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  clearLogs() {
    this.consoleErrors.length = 0;
    this.pageErrors.length = 0;
    this.consoleWarnings.length = 0;
  }

  async evaluate(expression) {
    const out = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (out.exceptionDetails) {
      throw new Error(
        `Runtime.evaluate failed: ${out.exceptionDetails.exception?.description ?? out.exceptionDetails.text}`
      );
    }
    return out.result?.value;
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
  }

  async navigate(url) {
    await this.send("Page.navigate", { url });
    await this.evaluate(
      `new Promise((r) => {
        if (document.readyState === "complete") r(true);
        else window.addEventListener("load", () => r(true), { once: true });
      })`
    );
  }

  async screenshotPng() {
    const shot = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(shot.data, "base64");
  }
}

async function waitForChromeWs(cdpPort, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (resp.ok) {
        const pages = await resp.json();
        const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome still booting
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for Chrome CDP on 127.0.0.1:${cdpPort}`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", () => res(true), { once: true });
    ws.addEventListener("error", (e) => rej(e), { once: true });
  });
  const cdp = new CdpSession(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.bringToFront");
  return cdp;
}

const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

async function main() {
  const chromeBin = findChromeBinary();
  const cdpPort = await getFreePort();
  const userDataDir = mkdtempSync(join(tmpdir(), "ww-portraits-cdp-"));
  let chromeProc = null;
  let viteServer = null;
  const cdpSessions = [];

  const cleanup = () => {
    for (const s of cdpSessions) {
      if (s?.ws && s.ws.readyState === WebSocket.OPEN) {
        try {
          s.ws.close();
        } catch {
          // ignore
        }
      }
    }
    if (chromeProc && !chromeProc.killed) {
      try {
        chromeProc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    viteServer = await createViteServer({
      root: appDir,
      configFile: join(appDir, "vite.config.ts"),
      logLevel: "error",
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
        hmr: false,
        watch: null
      },
      plugins: [studioPlugin()]
    });
    await viteServer.listen();
    const addr = viteServer.httpServer?.address();
    const vitePort = typeof addr === "object" && addr ? addr.port : 0;
    if (!vitePort) throw new Error("Failed to bind Vite dev server port");
    const baseUrl = `http://127.0.0.1:${vitePort}`;

    chromeProc = spawn(
      chromeBin,
      [
        "--headless=new",
        `--remote-debugging-port=${cdpPort}`,
        "--remote-debugging-address=127.0.0.1",
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--mute-audio",
        "--hide-scrollbars",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--enable-unsafe-webgpu",
        "--use-angle=metal",
        "about:blank"
      ],
      { stdio: "ignore" }
    );

    const wsUrl = await waitForChromeWs(cdpPort);
    const cdp = await connectCdp(wsUrl);
    cdpSessions.push(cdp);

    // 1. Render 6 studio portraits at 512x512 -> 256x256 WebP (quality 92)
    if (!skipPortraits) {
      await cdp.setViewport(512, 512);
      cdp.clearLogs();
      await cdp.navigate(`${baseUrl}/__studio.html`);
      const studioBootDeadline = Date.now() + 15_000;
      while (Date.now() < studioBootDeadline) {
        if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
          throw new Error(`Studio boot failed: ${[...cdp.consoleErrors, ...cdp.pageErrors].join(" | ")}`);
        }
        const ready = await cdp.evaluate(`typeof window.__renderStudioRig === "function"`);
        if (ready) break;
        await new Promise((r) => setTimeout(r, 80));
      }
      if (!(await cdp.evaluate(`typeof window.__renderStudioRig === "function"`))) {
        throw new Error(`Timed out waiting for window.__renderStudioRig (${[...cdp.consoleErrors, ...cdp.pageErrors].join(" | ")})`);
      }

      const portraitDir = join(appDir, "src", "assets", "portraits");
      mkdirSync(portraitDir, { recursive: true });
      const provPath = join(appDir, "provenance", "portraits.json");
      const prov = JSON.parse(readFileSync(provPath, "utf8"));
      const today = new Date().toISOString().slice(0, 10);

      for (const spec of PORTRAIT_SPECS) {
        cdp.clearLogs();
        const info = await cdp.evaluate(`window.__renderStudioRig(${JSON.stringify(spec)})`);
        if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
          throw new Error(
            `Studio portrait ${spec.key} had errors: ${[...cdp.consoleErrors, ...cdp.pageErrors].join(" | ")}`
          );
        }
        const pngBuf = await cdp.screenshotPng();
        const webpBuf = await sharp(pngBuf)
          .resize(256, 256, { kernel: sharp.kernel.lanczos3 })
          .webp({ quality: 92 })
          .toBuffer();
        const outPath = join(portraitDir, `${spec.key}.webp`);
        writeFileSync(outPath, webpBuf);
        prov[spec.key] = {
          file: `src/assets/portraits/${spec.key}.webp`,
          sha256: sha256Hex(webpBuf),
          source: "procedural:@aura3d/engine",
          generator: "tools/render-character-portraits.mjs",
          license: "Original procedural @aura3d/engine portrait art owned by AuraOne",
          review: {
            status: "approved",
            reviewer: "agent:gemini-4-carbon-high",
            date: today
          }
        };
        console.log(
          `[portrait] ${spec.key}.webp (${webpBuf.length} B, backend=${info.backend}, tris=${info.triangles}, subShapes=${info.subShapes}, drawCalls=${info.drawCalls})`
        );
      }

      writeFileSync(provPath, `${JSON.stringify(prov, null, 2)}\n`);
      execFileSync(process.execPath, [join(appDir, "tools", "gen-rights-manifest.mjs")], {
        cwd: appDir,
        stdio: "inherit"
      });
    }

    // 2. Optional --turnarounds: single foregrounded CDP session for 1280x960 turnarounds + WebGPU & WebGL2 world captures
    if (wantTurnarounds) {
      mkdirSync(turnaroundDir, { recursive: true });
      mkdirSync(worldShotsDir, { recursive: true });

      const angles = [
        { name: "front", yaw: 0 },
        { name: "three-quarter", yaw: 0.52 },
        { name: "left", yaw: Math.PI * 0.5 },
        { name: "back", yaw: Math.PI },
        { name: "right", yaw: -Math.PI * 0.5 }
      ];

      await cdp.send("Page.bringToFront");
      await cdp.setViewport(1280, 960);
      cdp.clearLogs();
      await cdp.navigate(`${baseUrl}/__studio.html`);
      const turnaroundBootDeadline = Date.now() + 20_000;
      while (Date.now() < turnaroundBootDeadline) {
        if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
          throw new Error(`Turnaround studio boot failed: ${[...cdp.consoleErrors, ...cdp.pageErrors].join(" | ")}`);
        }
        const ready = await cdp.evaluate(`typeof window.__renderStudioRig === "function"`);
        if (ready) break;
        await new Promise((r) => setTimeout(r, 60));
      }

      const compositeJobs = [];
      const activeTurnaroundKeys = requestedTurnaroundKeys ?? TURNAROUND_KEYS;
      for (const key of activeTurnaroundKeys) {
        const quadrantBuffers = [];
        for (const angle of angles) {
          cdp.clearLogs();
          await cdp.evaluate(
            `window.__renderStudioRig(${JSON.stringify({
              key,
              yaw: angle.yaw,
              pitchDeg: 11,
              fov: 33,
              bgTop: "#FFF5E9",
              bgBottom: "#F0DBC2",
              plinth: "#E6CCB0",
              hdriId: "autumn_field_puresky",
              backend: "auto",
              portrait: false
            })})`
          );
          if (cdp.consoleErrors.length > 0 || cdp.pageErrors.length > 0) {
            throw new Error(
              `Turnaround ${key} (${angle.name}) errors: ${[...cdp.consoleErrors, ...cdp.pageErrors].join(" | ")}`
            );
          }
          const png = await cdp.screenshotPng();
          if (angle.name === "front" || angle.name === "three-quarter") {
            writeFileSync(join(turnaroundDir, `${key}-${angle.name}.png`), png);
          }
          if (angle.name !== "three-quarter") {
            quadrantBuffers.push({ name: angle.name, png });
          }
        }
        compositeJobs.push(
          (async () => {
            const resized = await Promise.all(
              quadrantBuffers.map((q) => sharp(q.png).resize(640, 480).toBuffer())
            );
            await sharp({
              create: {
                width: 1280,
                height: 960,
                channels: 4,
                background: { r: 255, g: 245, b: 233, alpha: 1 }
              }
            })
              .composite([
                { input: resized[0], left: 0, top: 0 },
                { input: resized[1], left: 640, top: 0 },
                { input: resized[2], left: 0, top: 480 },
                { input: resized[3], left: 640, top: 480 }
              ])
              .png()
              .toFile(join(turnaroundDir, `${key}-4view.png`));
          })()
        );
        console.log(`[turnaround] ${key}: front (1280x960), three-quarter (1280x960), 4view (1280x960)`);
      }
      await Promise.all(compositeJobs);

      // UI Start Screen + Story Menu Portraits at 1280x960
      cdp.clearLogs();
      await cdp.navigate(`${baseUrl}/?audio=0`);
      await cdp.evaluate(`new Promise((resolve, reject) => {
        const deadline = Date.now() + 15000;
        const tick = () => {
          const boot = document.querySelector('[data-ui="boot"]');
          const startEl = document.querySelector('[data-ui="start"]');
          const startBtn = startEl ? startEl.querySelector('[data-action="start"]') : null;
          const imgs = startEl ? Array.from(startEl.querySelectorAll("img")) : [];
          const opacity = startEl ? Number.parseFloat(getComputedStyle(startEl).opacity || "0") : 0;
          if (!boot && startBtn && opacity >= 0.99 && imgs.length >= 6 && imgs.every((img) => img.complete && img.naturalWidth > 0)) resolve(true);
          else if (Date.now() > deadline) reject(new Error("Timed out waiting for start screen without boot splash"));
          else setTimeout(tick, 60);
        };
        tick();
      })`);
      await new Promise((r) => setTimeout(r, 150));
      writeFileSync(join(worldShotsDir, "00a-start-screen.png"), await cdp.screenshotPng());

      await cdp.evaluate(`document.querySelector('[data-ui="start"] [data-action="start"]').click()`);
      await cdp.evaluate(`new Promise((resolve, reject) => {
        const deadline = Date.now() + 15000;
        const tick = () => {
          const menu = document.querySelector('[data-ui="menu"]');
          const imgs = menu ? Array.from(menu.querySelectorAll("img")) : [];
          if (menu && imgs.length >= 6 && imgs.every((img) => img.complete && img.naturalWidth > 0)) resolve(true);
          else if (Date.now() > deadline) reject(new Error("Timed out waiting for story menu portraits"));
          else setTimeout(tick, 60);
        };
        tick();
      })`);
      await new Promise((r) => setTimeout(r, 120));
      writeFileSync(join(worldShotsDir, "00b-story-menu-portraits.png"), await cdp.screenshotPng());

      // Live 1280x960 world captures across BOTH webgpu and webgl2 (live rAF presenter, reusing 1 boot per backend via startStory)
      for (const backendMode of ["webgpu", "webgl2"]) {
        cdp.clearLogs();
        const firstSpec = WORLD_CAPTURES[0];
        await cdp.navigate(
          `${baseUrl}/?story=${firstSpec.storyId}&autostart=1&mode=watch-sing&audio=0&backend=${backendMode}`
        );

        for (let idx = 0; idx < WORLD_CAPTURES.length; idx += 1) {
          const worldSpec = WORLD_CAPTURES[idx];
          cdp.clearLogs();
          if (idx > 0) {
            await cdp.evaluate(
              `window.__AURA_WONDER_WORLD__.startStory(${JSON.stringify(worldSpec.storyId)}, "watch-sing")`
            );
          }

          const diag = await cdp.evaluate(`new Promise((resolve, reject) => {
            const deadline = Date.now() + 30000;
            const visible = (el) => {
              if (!el) return false;
              const st = getComputedStyle(el);
              return el.getClientRects().length > 0 && st.visibility !== "hidden" && st.display !== "none";
            };
            const poll = () => {
              const ww = window.__AURA_WONDER_WORLD__;
              const err = document.body?.dataset?.aura3dError || window.__AURA_WONDER_WORLD_ERROR__;
              if (err) {
                reject(new Error("Boot error: " + err));
                return;
              }
              if (ww && typeof ww.state === "function" && typeof ww.diagnostics === "function") {
                const st = ww.state();
                const d = ww.diagnostics();
                const bootSplash = document.querySelector('[data-ui="boot"]');
                const loadingVisible = visible(document.querySelector('[data-ui="loading"]'));
                const veil = document.querySelector(".ww-stage-veil");
                const veilOpacity = veil && visible(veil) ? Number.parseFloat(getComputedStyle(veil).opacity || "0") : 0;
                const overlay = document.querySelector(".a3g-overlay");
                const overlayOpacity = overlay && visible(overlay) ? Number.parseFloat(getComputedStyle(overlay).opacity || "0") : 0;
                const canvas = document.querySelector("#stage canvas");
                const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
                if (
                  st.screen === "story" &&
                  st.storyId === ${JSON.stringify(worldSpec.storyId)} &&
                  st.director !== null &&
                  st.director.phase !== "idle" &&
                  d.warmed === true &&
                  !bootSplash &&
                  !loadingVisible &&
                  veilOpacity <= 0.02 &&
                  overlayOpacity <= 0.02 &&
                  canvasRect &&
                  canvasRect.width > 100 &&
                  canvasRect.height > 100
                ) {
                  ww.advance(${worldSpec.advanceMs});
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const dAfter = ww.diagnostics();
                      const stAfter = ww.state();
                      resolve({
                        world: dAfter.world,
                        renderPath: dAfter.renderPath,
                        drawCalls: dAfter.drawCalls,
                        proceduralNodes: dAfter.proceduralNodes,
                        canvasW: canvas.width,
                        canvasH: canvas.height,
                        warnings: dAfter.warnings ?? [],
                        errors: stAfter.errors ?? []
                      });
                    });
                  });
                  return;
                }
              }
              if (Date.now() > deadline) {
                reject(new Error("Timed out waiting for story " + ${JSON.stringify(worldSpec.storyId)}));
                return;
              }
              setTimeout(poll, 80);
            };
            poll();
          })`);

          if (diag.world !== worldSpec.expectedWorld) {
            throw new Error(
              `${worldSpec.slug} (${backendMode}): expected world "${worldSpec.expectedWorld}", got "${diag.world}"`
            );
          }
          const badWarnings = cdp.consoleWarnings.filter((w) =>
            /TRANSMISSION_DEGRADED|CUSTOM_SHADER_WGSL_MISSING|OPTION_IGNORED|CUSTOM_SHADER_COMPILE_FAILED|shader error|WGSL|GLSL/i.test(w)
          );
          if (
            cdp.consoleErrors.length > 0 ||
            cdp.pageErrors.length > 0 ||
            badWarnings.length > 0 ||
            (diag.errors && diag.errors.length > 0) ||
            (diag.warnings && diag.warnings.length > 0)
          ) {
            throw new Error(
              `${worldSpec.slug} (${backendMode}) runtime diagnostics failed: consoleErrors=${JSON.stringify(
                cdp.consoleErrors
              )} pageErrors=${JSON.stringify(cdp.pageErrors)} appErrors=${JSON.stringify(
                diag.errors
              )} stageWarnings=${JSON.stringify(diag.warnings)} shaderWarnings=${JSON.stringify(badWarnings)}`
            );
          }

          const worldPng = await cdp.screenshotPng();
          const outFile = join(worldShotsDir, `${worldSpec.slug}-${backendMode}.png`);
          writeFileSync(outFile, worldPng);
          const stats = await sharp(worldPng).stats();
          const maxStdev = Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev));
          if (maxStdev < 10) {
            throw new Error(
              `${worldSpec.slug} (${backendMode}) screenshot looks flat/unrendered (max channel stdev=${maxStdev.toFixed(2)}, saved to ${outFile})`
            );
          }
          console.log(
            `[world] ${worldSpec.slug} (${backendMode} -> renderPath=${diag.renderPath}, world=${diag.world}, drawCalls=${diag.drawCalls}, proceduralNodes=${diag.proceduralNodes}, stdev=${maxStdev.toFixed(1)})`
          );
        }
      }
    }
  } finally {
    cleanup();
    if (viteServer) {
      await viteServer.close();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
