#!/usr/bin/env node
// Deterministic offline 30 fps episode renderer (PRD 09 WP12: B.2, B.4, E.6, E.8, P0).
//
// Usage (remote runner only: CI=1 or AURA3D_REMOTE_ACR=1):
//   node tools/render-episode.mjs --id <storyOrShowId> [--out dist/shows/<id>] [--fps 30] [--locale en] [--aspect 16:9|9:16] [--max-sec <sec>] [--build] [--no-end-card]

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");
const repoDir = resolve(appDir, "../..");

const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";

const MIME_BY_EXT = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ktx2": "image/ktx2",
  ".hdr": "application/octet-stream",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2"
};

function getRootRequire() {
  const rootPkg = join(repoDir, "package.json");
  const localPkg = join(appDir, "package.json");
  return createRequire(existsSync(rootPkg) ? rootPkg : localPkg);
}

let cachedSharp = null;
function getSharp() {
  if (!cachedSharp) {
    const req = getRootRequire();
    cachedSharp = req("sharp");
  }
  return cachedSharp;
}

/**
 * Enforces the AuraOne remote-only browser policy: Playwright Chromium may
 * never launch on a local developer machine.
 */
export function assertRemoteRenderAllowed(env = process.env) {
  if (env?.CI === "1" || env?.AURA3D_REMOTE_ACR === "1") {
    return;
  }
  throw new Error(
    "REMOTE_GUARD_BLOCKED: tools/render-episode.mjs refuses to launch Playwright locally. " +
      "Run via tools/remote-acr/run.sh (which sets CI=1 / AURA3D_REMOTE_ACR=1 on the remote runner)."
  );
}

/** Formats milliseconds into standard SubRip timestamp `HH:MM:SS,mmm`. */
export function formatSrtTimestamp(ms) {
  const clamped = Math.max(0, Math.round(Number(ms) || 0));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const millis = clamped % 1_000;
  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "," +
    String(millis).padStart(3, "0")
  );
}

function normalizePauseText(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "[pause: wait and answer together]";
  const unwrapped = trimmed
    .replace(/^\[pause:\s*/i, "")
    .replace(/\]$/, "")
    .trim();
  return `[pause: ${unwrapped || "wait and answer together"}]`;
}

/**
 * Builds deterministic, monotonically ordered `.srt` captions from the director
 * `events.json` log (`type === "line"` and `type === "pause"`) and a `LocalePack`.
 */
export function buildSrtFromEvents(events, localePack, options = {}) {
  const list = Array.isArray(events) ? events : [];
  const defaultLineMs = options.defaultLineMs ?? 2400;
  const defaultPauseMs = options.defaultPauseMs ?? 2500;
  const lineDurationsMs = options.lineDurationsMs ?? {};

  const rawCues = [];

  for (let i = 0; i < list.length; i += 1) {
    const ev = list[i];
    if (!ev || typeof ev !== "object") continue;
    const action = ev.action ?? "start";
    if (action !== "start") continue;

    if (ev.type === "line") {
      const startMs = Math.max(0, Math.round(Number(ev.t) || 0));
      let endMs = null;
      for (let j = i + 1; j < list.length; j += 1) {
        const later = list[j];
        if (later && later.type === "line" && later.action === "stop" && later.id === ev.id && Number(later.t) > startMs) {
          endMs = Math.round(Number(later.t));
          break;
        }
      }
      if (endMs === null) {
        const dur =
          Number.isFinite(ev.durationMs) && ev.durationMs > 0
            ? ev.durationMs
            : Number.isFinite(lineDurationsMs[ev.id]) && lineDurationsMs[ev.id] > 0
              ? lineDurationsMs[ev.id]
              : defaultLineMs;
        endMs = Math.round(startMs + dur);
      }
      const rawText =
        localePack?.lines?.[ev.id] ??
        localePack?.strings?.[ev.id] ??
        (typeof ev.text === "string" ? ev.text : ev.id);
      const cleanText = String(rawText ?? ev.id)
        .replace(/\s+/g, " ")
        .trim();
      if (!cleanText) continue;
      rawCues.push({
        type: "line",
        id: ev.id,
        startMs,
        endMs: Math.max(startMs + 200, endMs),
        text: cleanText
      });
    } else if (ev.type === "pause") {
      const startMs = Math.max(0, Math.round(Number(ev.t) || 0));
      let endMs = null;
      for (let j = i + 1; j < list.length; j += 1) {
        const later = list[j];
        if (later && later.type === "pause" && later.action === "stop" && Number(later.t) > startMs) {
          if (!ev.id || !later.id || later.id === ev.id) {
            endMs = Math.round(Number(later.t));
            break;
          }
        }
      }
      if (endMs === null) {
        const dur = Number.isFinite(ev.durationMs) && ev.durationMs > 0 ? ev.durationMs : defaultPauseMs;
        endMs = Math.round(startMs + dur);
      }
      const lookup =
        (ev.id && (localePack?.strings?.[ev.id] ?? localePack?.lines?.[ev.id])) ??
        ev.prompt ??
        ev.text ??
        (ev.id ? `say "${ev.id}"` : "wait and answer together");
      rawCues.push({
        type: "pause",
        id: ev.id ?? "pause",
        startMs,
        endMs: Math.max(startMs + 250, endMs),
        text: normalizePauseText(lookup)
      });
    }
  }

  rawCues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  // Enforce strict monotonic, non-overlapping cue windows for valid SubRip playback.
  const settled = [];
  for (let i = 0; i < rawCues.length; i += 1) {
    const cur = { ...rawCues[i] };
    if (settled.length > 0) {
      const prev = settled[settled.length - 1];
      if (cur.startMs < prev.endMs) {
        if (cur.startMs > prev.startMs + 120) {
          prev.endMs = cur.startMs;
        } else {
          cur.startMs = prev.endMs;
        }
      }
    }
    if (cur.endMs <= cur.startMs) {
      cur.endMs = cur.startMs + 250;
    }
    settled.push(cur);
  }

  if (settled.length === 0) {
    return "";
  }

  return (
    settled
      .map(
        (cue, idx) =>
          `${idx + 1}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.text}`
      )
      .join("\n\n") + "\n"
  );
}

function escapeXml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(text, maxCharsPerLine) {
  const words = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Renders the calm 6-second starlight-navy (`#1a2238`) offline play end card
 * (PRD 09 E.6 / E.8). Contains zero buttons, zero subscribe prompts, zero URLs,
 * and zero child PII.
 */
export async function renderEndCardBuffer({
  width = 1920,
  height = 1080,
  heading = "All done! Now try...",
  offlinePlay = "Find five favourite things together and count them slowly from one to five.",
  caregiverBridge = "Take a calm breath together and talk about your favourite moment.",
  format = "jpeg",
  quality = 95
} = {}) {
  const sharp = getSharp();
  const isPortrait = height > width;
  const maxOfflineChars = isPortrait ? 28 : 48;
  const maxBridgeChars = isPortrait ? 36 : 64;

  const offlineLines = wrapLines(offlinePlay, maxOfflineChars).slice(0, 4);
  const bridgeLines = wrapLines(caregiverBridge, maxBridgeChars).slice(0, 3);

  const headingSize = Math.round(width * (isPortrait ? 0.056 : 0.038));
  const offlineSize = Math.round(width * (isPortrait ? 0.041 : 0.027));
  const bridgeSize = Math.round(width * (isPortrait ? 0.031 : 0.020));

  const cardPadX = Math.round(width * 0.11);
  const cardPadY = Math.round(height * 0.14);
  const cardW = width - cardPadX * 2;
  const cardH = height - cardPadY * 2;

  const headingY = cardPadY + Math.round(cardH * 0.24);
  const offlineStartY = cardPadY + Math.round(cardH * 0.43);
  const offlineLineStep = Math.round(offlineSize * 1.48);
  const bridgeStartY = cardPadY + Math.round(cardH * 0.77);
  const bridgeLineStep = Math.round(bridgeSize * 1.45);

  const stars = [
    [0.08, 0.12, 3.5],
    [0.16, 0.84, 2.8],
    [0.88, 0.15, 4.0],
    [0.92, 0.79, 3.0],
    [0.24, 0.08, 2.4],
    [0.76, 0.90, 2.8],
    [0.06, 0.52, 2.5],
    [0.94, 0.46, 3.2]
  ]
    .map(
      ([rx, ry, r]) =>
        `<circle cx="${Math.round(rx * width)}" cy="${Math.round(ry * height)}" r="${r}" fill="#F6E6B8" fill-opacity="0.55" />`
    )
    .join("\n    ");

  const offlineTspans = offlineLines
    .map(
      (line, idx) =>
        `<text x="${Math.round(width / 2)}" y="${offlineStartY + idx * offlineLineStep}" text-anchor="middle" fill="#FFF7E8" font-family="Nunito, Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif" font-size="${offlineSize}" font-weight="700">${escapeXml(line)}</text>`
    )
    .join("\n    ");

  const bridgeTspans = bridgeLines
    .map(
      (line, idx) =>
        `<text x="${Math.round(width / 2)}" y="${bridgeStartY + idx * bridgeLineStep}" text-anchor="middle" fill="#C9D6EC" font-family="Nunito, 'Helvetica Neue', system-ui, sans-serif" font-size="${bridgeSize}" font-weight="500">${escapeXml(line)}</text>`
    )
    .join("\n    ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#1a2238" />
    ${stars}
    <rect x="${cardPadX}" y="${cardPadY}" width="${cardW}" height="${cardH}" rx="36" ry="36" fill="#222d49" stroke="#3c4c74" stroke-width="3" />
    <text x="${Math.round(width / 2)}" y="${headingY}" text-anchor="middle" fill="#FFE3A3" font-family="Nunito, Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif" font-size="${headingSize}" font-weight="800">${escapeXml(heading)}</text>
    ${offlineTspans}
    <line x1="${Math.round(width * 0.28)}" y1="${bridgeStartY - Math.round(bridgeSize * 1.5)}" x2="${Math.round(width * 0.72)}" y2="${bridgeStartY - Math.round(bridgeSize * 1.5)}" stroke="#3c4c74" stroke-width="2" />
    ${bridgeTspans}
  </svg>`;

  const pipeline = sharp(Buffer.from(svg, "utf8")).resize(width, height);
  if (format === "png") {
    return pipeline.png({ compressionLevel: 9 }).toBuffer();
  }
  return pipeline.jpeg({ quality, chromaSubsampling: "4:4:4" }).toBuffer();
}

async function loadContentContext(localeCode = "en") {
  const req = getRootRequire();
  const { tsImport } = req("tsx/esm/api");
  const parentUrl = pathToFileURL(join(appDir, "package.json")).href;

  const catalogMod = await tsImport("./src/content/catalog.ts", parentUrl);
  const enMod = await tsImport("./src/localization/en/index.ts", parentUrl);

  let showsMod = { SHOWS: [], showById: () => undefined };
  const showsIndex = join(appDir, "src", "content", "shows", "index.ts");
  if (existsSync(showsIndex)) {
    showsMod = await tsImport("./src/content/shows/index.ts", parentUrl);
  }

  let localePack = enMod.en;
  if (localeCode !== "en") {
    const candidateTs = join(appDir, "src", "localization", `${localeCode}.ts`);
    const candidateIdx = join(appDir, "src", "localization", localeCode, "index.ts");
    if (existsSync(candidateIdx)) {
      const mod = await tsImport(`./src/localization/${localeCode}/index.ts`, parentUrl);
      localePack = mod[localeCode] ?? mod.default ?? enMod.en;
    } else if (existsSync(candidateTs)) {
      const mod = await tsImport(`./src/localization/${localeCode}.ts`, parentUrl);
      localePack = mod[localeCode] ?? mod.default ?? enMod.en;
    }
  }

  return {
    storyById: catalogMod.storyById,
    storyByCode: catalogMod.storyByCode,
    showById: showsMod.showById ?? ((id) => (showsMod.SHOWS ?? []).find((s) => s.id === id || s.code === id)),
    shows: showsMod.SHOWS ?? [],
    localePack,
    enPack: enMod.en
  };
}

function ensureBuiltDist(forceBuild = false) {
  const distIndex = join(appDir, "dist", "index.html");
  if (!forceBuild && existsSync(distIndex)) {
    return join(appDir, "dist");
  }
  const viteBin = [
    join(appDir, "node_modules", ".bin", "vite"),
    join(repoDir, "node_modules", ".bin", "vite")
  ].find((candidate) => existsSync(candidate));

  if (!viteBin) {
    throw new Error("vite binary not found; install workspace dependencies before building dist/");
  }

  const res = spawnSync(viteBin, ["build"], { cwd: appDir, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`vite build failed with exit code ${res.status ?? 1}`);
  }
  return join(appDir, "dist");
}

export function startStaticDistServer(distDir) {
  const rootResolved = resolve(distDir);
  return new Promise((resolveServer, rejectServer) => {
    const server = createHttpServer((req, res) => {
      try {
        const rawUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        const relPath = decodeURIComponent(rawUrl.pathname);
        const safeRel = normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
        let filePath = resolve(rootResolved, "." + (safeRel.startsWith("/") ? safeRel : "/" + safeRel));
        if (!filePath.startsWith(rootResolved)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        if (existsSync(filePath) && statSync(filePath).isDirectory()) {
          filePath = join(filePath, "index.html");
        }
        if (!existsSync(filePath)) {
          const fallback = join(rootResolved, "index.html");
          if (!extname(filePath) && existsSync(fallback)) {
            filePath = fallback;
          } else {
            res.writeHead(404);
            res.end("Not Found");
            return;
          }
        }
        const ext = extname(filePath).toLowerCase();
        const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
        const body = readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": mime,
          "Content-Length": body.length,
          "Cache-Control": "no-store"
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err?.message ?? err));
      }
    });
    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolveServer({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((res) => {
            server.close(() => res());
          })
      });
    });
  });
}

function writeChunkToStream(stream, buf) {
  return new Promise((resolveWrite, rejectWrite) => {
    const onError = (err) => {
      stream.off("drain", onDrain);
      rejectWrite(err);
    };
    const onDrain = () => {
      stream.off("error", onError);
      resolveWrite();
    };
    stream.once("error", onError);
    const ok = stream.write(buf);
    if (ok) {
      stream.off("error", onError);
      resolveWrite();
    } else {
      stream.once("drain", onDrain);
    }
  });
}

async function launchWebGlBrowser(playwright, preferSwiftShader = false) {
  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--mute-audio",
    "--hide-scrollbars"
  ];
  const swiftArgs = [...baseArgs, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

  if (!preferSwiftShader) {
    const hwBrowser = await playwright.chromium.launch({ headless: true, args: baseArgs });
    const probePage = await hwBrowser.newPage();
    try {
      const glInfo = await probePage.evaluate(() => {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (!gl) return { ok: false, software: false };
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : "";
        return { ok: true, software: /swiftshader|llvmpipe|softpipe/i.test(renderer) };
      });
      await probePage.close();
      if (glInfo.ok) {
        return { browser: hwBrowser, glMode: glInfo.software ? "swiftshader" : "hardware-or-default" };
      }
    } catch {
      // Fall back to SwiftShader below.
    }
    await hwBrowser.close();
  }

  const swBrowser = await playwright.chromium.launch({ headless: true, args: swiftArgs });
  return { browser: swBrowser, glMode: "swiftshader" };
}

function parseCliArgs(argv) {
  const opts = {
    id: null,
    outDir: null,
    fps: 30,
    locale: "en",
    aspect: null,
    maxSec: null,
    forceBuild: false,
    noEndCard: false,
    endCardSec: null,
    swiftShader: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--id" && argv[i + 1]) {
      opts.id = argv[++i];
    } else if (arg.startsWith("--id=")) {
      opts.id = arg.slice("--id=".length);
    } else if (arg === "--out" && argv[i + 1]) {
      opts.outDir = resolve(process.cwd(), argv[++i]);
    } else if (arg.startsWith("--out=")) {
      opts.outDir = resolve(process.cwd(), arg.slice("--out=".length));
    } else if (arg === "--fps" && argv[i + 1]) {
      opts.fps = Number(argv[++i]);
    } else if (arg.startsWith("--fps=")) {
      opts.fps = Number(arg.slice("--fps=".length));
    } else if (arg === "--locale" && argv[i + 1]) {
      opts.locale = argv[++i];
    } else if (arg.startsWith("--locale=")) {
      opts.locale = arg.slice("--locale=".length);
    } else if (arg === "--aspect" && argv[i + 1]) {
      opts.aspect = argv[++i];
    } else if (arg.startsWith("--aspect=")) {
      opts.aspect = arg.slice("--aspect=".length);
    } else if (arg === "--max-sec" && argv[i + 1]) {
      opts.maxSec = Number(argv[++i]);
    } else if (arg.startsWith("--max-sec=")) {
      opts.maxSec = Number(arg.slice("--max-sec=".length));
    } else if (arg === "--end-card-sec" && argv[i + 1]) {
      opts.endCardSec = Number(argv[++i]);
    } else if (arg.startsWith("--end-card-sec=")) {
      opts.endCardSec = Number(arg.slice("--end-card-sec=".length));
    } else if (arg === "--build") {
      opts.forceBuild = true;
    } else if (arg === "--no-end-card") {
      opts.noEndCard = true;
    } else if (arg === "--swiftshader") {
      opts.swiftShader = true;
    }
  }
  return opts;
}

export async function renderEpisode(options) {
  assertRemoteRenderAllowed(options.env ?? process.env);

  const id = options.id;
  if (!id) {
    throw new Error("Missing required --id <storyOrShowId>");
  }
  const fps = Number.isFinite(options.fps) && options.fps > 0 ? Math.round(options.fps) : 30;
  const locale = options.locale || "en";

  const ctx = await loadContentContext(locale);
  const spec =
    ctx.showById(id) ??
    ctx.storyById(id) ??
    ctx.storyByCode(id);
  if (!spec) {
    throw new Error(`Unknown story or show id: "${id}"`);
  }

  const resolvedId = spec.id;
  const aspect = options.aspect ?? spec.aspect ?? "16:9";
  if (aspect !== "16:9" && aspect !== "9:16") {
    throw new Error(`Invalid --aspect "${aspect}" (expected "16:9" or "9:16")`);
  }
  const width = aspect === "9:16" ? 1080 : 1920;
  const height = aspect === "9:16" ? 1920 : 1080;

  const endCardSec =
    options.noEndCard || aspect === "9:16"
      ? 0
      : options.endCardSec !== null && options.endCardSec !== undefined
        ? Math.max(0, Number(options.endCardSec))
        : spec.endCardSec !== undefined
          ? Math.max(0, Number(spec.endCardSec))
          : 6;

  const outDir = options.outDir ?? join(appDir, "dist", "shows", resolvedId);
  const keyframesDir = join(outDir, "keyframes");
  mkdirSync(keyframesDir, { recursive: true });

  const distDir = ensureBuiltDist(Boolean(options.forceBuild));
  const staticSrv = await startStaticDistServer(distDir);

  const req = getRootRequire();
  const playwright = req("playwright");
  let browser = null;
  let ffmpegProc = null;

  try {
    const launched = await launchWebGlBrowser(playwright, Boolean(options.swiftShader));
    browser = launched.browser;
    const renderDpr = launched.glMode === "swiftshader" ? 0.4 : 1;
    const swRasterStride = launched.glMode === "swiftshader" ? 3 : 1;
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: renderDpr
    });
    const page = await context.newPage();

    const pageErrors = [];
    page.on("pageerror", (err) => {
      pageErrors.push(String(err?.message ?? err));
    });

    const routeUrl =
      `${staticSrv.baseUrl}/?broadcast=1&manual=1&audio=0&capture=1` +
      `&locale=${encodeURIComponent(locale)}&aspect=${encodeURIComponent(aspect)}`;
    await page.goto(routeUrl, { waitUntil: "load", timeout: 240_000 });

    await page.waitForFunction(
      () => {
        const bootErr = document.body?.dataset?.aura3dError;
        if (bootErr) throw new Error(`Wonder World boot error: ${bootErr}`);
        const ww = window.__AURA_WONDER_WORLD__;
        return Boolean(ww && typeof ww.ready === "function" && ww.ready() === true);
      },
      null,
      { timeout: 240_000 }
    );

    await page.evaluate(async (targetId) => {
      const ww = window.__AURA_WONDER_WORLD__;
      if (typeof ww.startShow === "function" && typeof ww.hasShow === "function" && ww.hasShow(targetId)) {
        await ww.startShow(targetId);
      } else if (typeof ww.startStory === "function") {
        await ww.startStory(targetId, "broadcast");
      } else if (typeof ww.startShow === "function") {
        await ww.startShow(targetId);
      } else {
        throw new Error("Neither startStory nor startShow available on __AURA_WONDER_WORLD__");
      }
      if (typeof ww.flushStage === "function") {
        await ww.flushStage();
      }
    }, resolvedId);

    // Wait for shader/world warm-up before frame 0 capture (broadcast mode sets screen === "playing").
    await page.waitForFunction(
      () => {
        const ww = window.__AURA_WONDER_WORLD__;
        const st = ww.state();
        if (Array.isArray(st.errors) && st.errors.length > 0) {
          throw new Error(`Wonder World runtime error: ${st.errors.join(" | ")}`);
        }
        const diag = typeof ww.diagnostics === "function" ? ww.diagnostics() : { warmed: true };
        return (
          (st.screen === "playing" || st.screen === "story" || st.screen === "show") &&
          st.director !== null &&
          diag.warmed !== false
        );
      },
      null,
      { timeout: 240_000 }
    );

    const framesMp4Path = join(outDir, "frames.mp4");
    const ffmpegStderr = [];
    const x264Preset = launched.glMode === "swiftshader" ? "veryfast" : "fast";
    const scaleFlags = launched.glMode === "swiftshader" ? "bicubic" : "lanczos";
    const canvasJpegQuality = launched.glMode === "swiftshader" ? 0.85 : 0.92;
    const renderStartWallMs = Date.now();
    console.log(
      `[render-episode] starting ${resolvedId} (${width}x${height} @ ${fps}fps, dpr=${renderDpr}, gl=${launched.glMode}, preset=${x264Preset})`
    );
    ffmpegProc = spawn(
      FFMPEG,
      [
        "-y",
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-framerate",
        String(fps),
        "-i",
        "-",
        "-vf",
        `scale=${width}:${height}:flags=${scaleFlags}`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        x264Preset,
        "-crf",
        "18",
        "-g",
        String(fps),
        "-movflags",
        "+faststart",
        framesMp4Path
      ],
      { stdio: ["pipe", "ignore", "pipe"] }
    );
    ffmpegProc.stderr.on("data", (chunk) => ffmpegStderr.push(chunk.toString("utf8")));
    const ffmpegExit = new Promise((res, rej) => {
      ffmpegProc.on("error", rej);
      ffmpegProc.on("close", (code) => {
        if (code === 0) res(0);
        else rej(new Error(`ffmpeg image2pipe exited with code ${code}: ${ffmpegStderr.join("").slice(-1200)}`));
      });
    });

    const hardMaxSec =
      Number.isFinite(options.maxSec) && options.maxSec > 0
        ? options.maxSec
        : Math.max((spec.estimatedDurationSec ?? 180) * 2.2, 900);
    const maxStoryFrames = Math.ceil(hardMaxSec * fps);
    const keyframeStride = Math.max(1, fps * 2);

    const traceRows = [];
    const beatStartMsById = {};
    let storyFrameCount = 0;
    let prevTMs = 0;
    let useCanvasBatch = false;
    let captureWidth = width;
    let captureHeight = height;
    let lastRasterJpgBuf = null;
    const batchSize = launched.glMode === "swiftshader" ? 30 : 20;
    let nextProgressLogFrame = 1500;

    let f = 0;
    while (f < maxStoryFrames) {
      if (f > 0 && useCanvasBatch) {
        const count = Math.min(batchSize, maxStoryFrames - f);
        const batchResults = await page.evaluate(
          async ({ startFrame, frameCountInBatch, fpsRate, startPrevMs, jpgQ, rasterStride }) => {
            const ww = window.__AURA_WONDER_WORLD__;
            const items = [];
            let lastMs = startPrevMs;
            let lastSegIdx = ww.state().segmentIndex ?? -1;
            for (let b = 0; b < frameCountInBatch; b += 1) {
              const curFrame = startFrame + b;
              const targetMs = (curFrame * 1000) / fpsRate;
              const wantScheduledRaster = rasterStride <= 1 || curFrame % rasterStride === 0;
              if (typeof ww.advanceTo === "function") {
                ww.advanceTo(targetMs, { render: wantScheduledRaster });
              } else if (curFrame > 0) {
                const delta = Math.max(0, targetMs - lastMs);
                if (delta > 0) ww.advance(delta);
              }
              lastMs = targetMs;
              let st = ww.state();
              const curSegIdx = st.segmentIndex ?? -1;
              const segChanged = curSegIdx !== lastSegIdx;
              if (segChanged && typeof ww.flushStage === "function") {
                await ww.flushStage();
                if (typeof ww.advanceTo === "function") {
                  ww.advanceTo(targetMs, { render: true });
                }
                lastSegIdx = curSegIdx;
                st = ww.state();
              }
              const phase = st.director?.phase ?? null;
              const shouldRaster = wantScheduledRaster || segChanged || phase === "finished";
              if (shouldRaster && !wantScheduledRaster && !segChanged && typeof ww.advanceTo === "function") {
                ww.advanceTo(targetMs, { render: true });
              }
              const row = typeof ww.traceRow === "function" ? ww.traceRow() : null;
              let b64 = "";
              if (shouldRaster) {
                const canvas = document.querySelector("#stage canvas") || document.querySelector("canvas");
                const dataUrl =
                  canvas && typeof canvas.toDataURL === "function" ? canvas.toDataURL("image/jpeg", jpgQ) : "";
                b64 = dataUrl.startsWith("data:image/jpeg;base64,") ? dataUrl.slice(23) : "";
              }
              items.push({
                frame: curFrame,
                tMs: targetMs,
                phase,
                beatId: st.director?.beatId ?? null,
                speaking: st.speaking ?? null,
                elapsedMs: st.director?.elapsedMs ?? Math.round(targetMs),
                row,
                b64,
                reused: !shouldRaster
              });
              if (phase === "finished" || (shouldRaster && !b64)) {
                break;
              }
            }
            return items;
          },
          {
            startFrame: f,
            frameCountInBatch: count,
            fpsRate: fps,
            startPrevMs: prevTMs,
            jpgQ: canvasJpegQuality,
            rasterStride: swRasterStride
          }
        );

        if (pageErrors.length > 0) {
          throw new Error(`Runtime page error at frame ${f}: ${pageErrors.join(" | ")}`);
        }

        let hitFallback = false;
        let finishedEarly = false;
        for (const item of batchResults) {
          if (!item.reused && !item.b64) {
            useCanvasBatch = false;
            hitFallback = true;
            break;
          }
          const jpgBuf = item.reused && lastRasterJpgBuf ? lastRasterJpgBuf : Buffer.from(item.b64, "base64");
          if (!item.reused) {
            lastRasterJpgBuf = jpgBuf;
          }
          await writeChunkToStream(ffmpegProc.stdin, jpgBuf);
          storyFrameCount += 1;
          prevTMs = item.tMs;
          f = item.frame + 1;

          if (item.frame % keyframeStride === 0) {
            writeFileSync(join(keyframesDir, `frame-${String(item.frame).padStart(6, "0")}.jpg`), jpgBuf);
          }
          if (item.beatId && beatStartMsById[item.beatId] === undefined) {
            beatStartMsById[item.beatId] = Math.round(item.tMs);
          }
          traceRows.push({
            frame: item.frame,
            tMs: Number(item.tMs.toFixed(3)),
            phase: item.phase,
            beatId: item.beatId,
            speaking: item.speaking,
            row: item.row
          });
          if (item.phase === "finished") {
            finishedEarly = true;
            break;
          }
        }
        if (storyFrameCount >= nextProgressLogFrame) {
          const wallSec = Math.max(0.1, (Date.now() - renderStartWallMs) / 1000);
          console.log(
            `[render-episode] ${resolvedId} progress: ${storyFrameCount} frames (${(storyFrameCount / fps).toFixed(1)}s story) in ${wallSec.toFixed(1)}s (${(storyFrameCount / wallSec).toFixed(1)} fps, canvasBatch=${useCanvasBatch})`
          );
          nextProgressLogFrame = storyFrameCount + 1500;
        }
        if (finishedEarly) break;
        if (!hitFallback) continue;
      }

      const tMs = (f * 1000) / fps;
      const stepState = await page.evaluate(
        async ({ targetMs, lastMs, frameIdx, probeCanvas }) => {
          const ww = window.__AURA_WONDER_WORLD__;
          const prevSegIdx = ww.state().segmentIndex ?? -1;
          if (typeof ww.advanceTo === "function") {
            ww.advanceTo(targetMs);
          } else if (frameIdx > 0) {
            const delta = Math.max(0, targetMs - lastMs);
            if (delta > 0) ww.advance(delta);
          }
          let st = ww.state();
          if ((st.segmentIndex ?? -1) !== prevSegIdx && typeof ww.flushStage === "function") {
            await ww.flushStage();
            if (typeof ww.advanceTo === "function") {
              ww.advanceTo(targetMs);
            }
            st = ww.state();
          }
          const row = typeof ww.traceRow === "function" ? ww.traceRow() : null;
          let probeB64 = "";
          if (probeCanvas) {
            const canvas = document.querySelector("#stage canvas") || document.querySelector("canvas");
            const dataUrl =
              canvas && typeof canvas.toDataURL === "function" ? canvas.toDataURL("image/jpeg", 0.92) : "";
            if (dataUrl.startsWith("data:image/jpeg;base64,")) {
              probeB64 = dataUrl.slice(23);
            }
          }
          return {
            phase: st.director?.phase ?? null,
            beatId: st.director?.beatId ?? null,
            speaking: st.speaking ?? null,
            elapsedMs: st.director?.elapsedMs ?? Math.round(targetMs),
            row,
            probeB64
          };
        },
        { targetMs: tMs, lastMs: prevTMs, frameIdx: f, probeCanvas: f === 0 && options.captureMode !== "screenshot" }
      );
      prevTMs = tMs;

      if (pageErrors.length > 0) {
        throw new Error(`Runtime page error at frame ${f}: ${pageErrors.join(" | ")}`);
      }

      let jpgBuf = null;
      if (f === 0 && stepState.probeB64) {
        const candidateBuf = Buffer.from(stepState.probeB64, "base64");
        try {
          const stats = await getSharp()(candidateBuf).stats();
          const maxStdev = Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev));
          if (maxStdev >= 6) {
            jpgBuf = candidateBuf;
            useCanvasBatch = true;
          }
        } catch {
          useCanvasBatch = false;
        }
      }
      if (!jpgBuf) {
        jpgBuf = await page.screenshot({ type: "jpeg", quality: 92 });
      }
      lastRasterJpgBuf = jpgBuf;
      if (f === 0) {
        try {
          const meta = await getSharp()(jpgBuf).metadata();
          if (meta.width && meta.height) {
            captureWidth = meta.width;
            captureHeight = meta.height;
          }
        } catch {
          // Keep target width x height.
        }
      }
      await writeChunkToStream(ffmpegProc.stdin, jpgBuf);
      storyFrameCount += 1;
      if (storyFrameCount >= nextProgressLogFrame) {
        const wallSec = Math.max(0.1, (Date.now() - renderStartWallMs) / 1000);
        console.log(
          `[render-episode] ${resolvedId} progress: ${storyFrameCount} frames (${(storyFrameCount / fps).toFixed(1)}s story) in ${wallSec.toFixed(1)}s (${(storyFrameCount / wallSec).toFixed(1)} fps, canvasBatch=${useCanvasBatch})`
        );
        nextProgressLogFrame = storyFrameCount + 1500;
      }

      if (f % keyframeStride === 0) {
        writeFileSync(join(keyframesDir, `frame-${String(f).padStart(6, "0")}.jpg`), jpgBuf);
      }

      if (stepState.beatId && beatStartMsById[stepState.beatId] === undefined) {
        beatStartMsById[stepState.beatId] = Math.round(tMs);
      }
      traceRows.push({
        frame: f,
        tMs: Number(tMs.toFixed(3)),
        phase: stepState.phase,
        beatId: stepState.beatId,
        speaking: stepState.speaking,
        row: stepState.row
      });

      if (stepState.phase === "finished") {
        break;
      }
      f += 1;
    }

    const rawEvents = await page.evaluate(() => {
      const ww = window.__AURA_WONDER_WORLD__;
      return typeof ww.eventLog === "function" ? ww.eventLog() : [];
    });

    // Append deterministic 6-second starlight-navy offline play end card (16:9 shows/episodes).
    let endCardFrameCount = 0;
    const offlineText =
      ctx.localePack.strings?.[spec.offlinePlayKey] ??
      ctx.enPack.strings?.[spec.offlinePlayKey] ??
      "Find five favourite things together and count them from one to five.";
    const bridgeText =
      ctx.localePack.strings?.[spec.caregiverBridgeKey] ??
      ctx.enPack.strings?.[spec.caregiverBridgeKey] ??
      "At each pause, wait for your child, then answer together.";

    if (endCardSec > 0) {
      const endCardPng = await renderEndCardBuffer({
        width,
        height,
        heading: "All done! Now try...",
        offlinePlay: offlineText,
        caregiverBridge: bridgeText,
        format: "png"
      });
      writeFileSync(join(outDir, "end-card.png"), endCardPng);

      const endCardJpg = await renderEndCardBuffer({
        width: captureWidth,
        height: captureHeight,
        heading: "All done! Now try...",
        offlinePlay: offlineText,
        caregiverBridge: bridgeText,
        format: "jpeg",
        quality: 95
      });
      endCardFrameCount = Math.round(endCardSec * fps);
      for (let ef = 0; ef < endCardFrameCount; ef += 1) {
        await writeChunkToStream(ffmpegProc.stdin, endCardJpg);
      }
    }

    ffmpegProc.stdin.end();
    await ffmpegExit;
    ffmpegProc = null;

    const frameCount = storyFrameCount + endCardFrameCount;
    const storyDurationMs = Math.round((storyFrameCount * 1000) / fps);
    const durationMs = Math.round((frameCount * 1000) / fps);

    const traceJson = JSON.stringify(traceRows);
    const traceHash = createHash("sha256").update(traceJson).digest("hex");
    writeFileSync(join(outDir, "trace.json"), traceJson + "\n");

    const kind =
      aspect === "9:16"
        ? "short"
        : spec.kind === "show"
          ? "show"
          : "episode";

    const eventsPayload = {
      id: resolvedId,
      kind,
      locale,
      aspect,
      fps,
      width,
      height,
      storyFrameCount,
      endCardFrameCount,
      frameCount,
      storyDurationMs,
      endCardSec,
      durationMs,
      glMode: launched.glMode,
      offlinePlay: offlineText,
      caregiverBridge: bridgeText,
      beatStartMsById,
      traceHash,
      events: rawEvents
    };
    const eventsPath = join(outDir, "events.json");
    writeFileSync(eventsPath, JSON.stringify(eventsPayload, null, 2) + "\n");

    const srtContent = buildSrtFromEvents(rawEvents, ctx.localePack);
    const srtPath = join(outDir, `captions.${locale}.srt`);
    writeFileSync(srtPath, srtContent);

    return {
      id: resolvedId,
      outDir,
      framesMp4Path,
      eventsPath,
      srtPath,
      frameCount,
      durationMs,
      traceHash
    };
  } finally {
    if (ffmpegProc && !ffmpegProc.killed) {
      try {
        ffmpegProc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    await staticSrv.close().catch(() => undefined);
  }
}

function isExecutedDirectly(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return fileURLToPath(metaUrl) === process.argv[1];
  }
}

if (isExecutedDirectly(import.meta.url)) {
  const cliOpts = parseCliArgs(process.argv.slice(2));
  renderEpisode(cliOpts)
    .then((res) => {
      console.log(
        `[render-episode] ${res.id} -> ${res.framesMp4Path} (${res.frameCount} frames, ${(res.durationMs / 1000).toFixed(2)}s, trace=${res.traceHash.slice(0, 12)})`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[render-episode] FAILED: ${err?.message ?? err}`);
      process.exit(1);
    });
}
