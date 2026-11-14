#!/usr/bin/env node
// Scene-rendered 1280x720 on-model YouTube thumbnail generator & typography compositor (PRD 09 WP15: B.4, D.3, E.7).
//
// Usage:
//   Remote live capture:
//     node tools/thumbnail.mjs --id <storyOrShowId> [--out dist/shows/<id>/thumbnail.png] [--title "Hello, friend!"] [--at-ms <ms>]
//   Offline frame compositor (no browser):
//     node tools/thumbnail.mjs --from-frame <frame.png> --out <thumbnail.png> --title "Hello, friend!"

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPrivacyText } from "./qc-episode.mjs";
import { startStaticDistServer } from "./render-episode.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");
const repoDir = resolve(appDir, "../..");

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // YouTube Data API thumbnails.set 2 MB limit

function getRootRequire() {
  const rootPkg = join(repoDir, "package.json");
  const localPkg = join(appDir, "package.json");
  return createRequire(existsSync(rootPkg) ? rootPkg : localPkg);
}

let cachedSharp = null;
function getSharp() {
  if (!cachedSharp) {
    cachedSharp = getRootRequire()("sharp");
  }
  return cachedSharp;
}

export function assertRemoteThumbnailAllowed(env = process.env) {
  if (env?.CI === "1" || env?.AURA3D_REMOTE_ACR === "1") {
    return;
  }
  throw new Error(
    "REMOTE_GUARD_BLOCKED: live scene capture in tools/thumbnail.mjs requires CI=1 or AURA3D_REMOTE_ACR=1. " +
      "Run via tools/remote-acr/run.sh, or pass --from-frame <pngPath> for offline compositing."
  );
}

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Enforces Wonder World's calm, anti-clickbait thumbnail title rules (PRD 09 C.5, D.3):
 * 1–4 words max, zero clickbait punctuation/arrows, zero subscribe/watch-more CTAs, zero child PII.
 */
export function validateThumbnailTitle(title, customAppDir = appDir) {
  const clean = String(title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) {
    throw new Error("Thumbnail title must not be empty");
  }

  const words = clean.split(" ").filter(Boolean);
  if (words.length > 4) {
    throw new Error(
      `Thumbnail title "${clean}" has ${words.length} words; Wonder World thumbnails allow at most 4 calm words (2-3 preferred, no clickbait).`
    );
  }

  if (/[!?]{2,}|->|=>|[➜➡⬅⬆⬇⭕🔴😱🤯]/.test(clean)) {
    throw new Error(`Thumbnail title "${clean}" contains disallowed clickbait symbols or repeated punctuation.`);
  }

  if (/\b(shocking|unbelievable|must watch|don't miss|click here|watch now|secret)\b/i.test(clean)) {
    throw new Error(`Thumbnail title "${clean}" contains disallowed clickbait phrasing.`);
  }

  const privacy = checkPrivacyText(clean, { customAppDir });
  if (!privacy.passed) {
    throw new Error(`Thumbnail title failed privacy gate: ${privacy.issues.join("; ")}`);
  }

  return clean;
}

/**
 * Composites calm rounded brand typography onto a `1280x720` frame buffer or path
 * using SVG + `sharp`, guaranteeing `< 2 MB` output PNG size.
 */
export async function compositeThumbnail({
  frameInput,
  title = "Hello, friend!",
  outPath = null,
  customAppDir = appDir
}) {
  const cleanTitle = validateThumbnailTitle(title, customAppDir);
  const sharp = getSharp();

  const sourceBuffer = typeof frameInput === "string" ? readFileSync(frameInput) : frameInput;
  if (!Buffer.isBuffer(sourceBuffer) || sourceBuffer.length === 0) {
    throw new Error("compositeThumbnail requires a non-empty frame PNG/JPEG buffer or file path");
  }

  const fontSize = cleanTitle.length <= 14 ? 64 : cleanTitle.length <= 20 ? 54 : 46;
  const estTextWidth = Math.round(cleanTitle.length * fontSize * 0.56);
  const pillPadX = 38;
  const pillW = Math.min(THUMBNAIL_WIDTH - 112, Math.max(280, estTextWidth + pillPadX * 2));
  const pillH = Math.round(fontSize * 1.68);
  const pillX = 56;
  const pillY = THUMBNAIL_HEIGHT - pillH - 52;
  const textX = pillX + Math.round(pillW / 2);
  const textY = pillY + Math.round(pillH * 0.67);

  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}">
    <defs>
      <filter id="softShadow" x="-10%" y="-10%" width="130%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#141c2e" flood-opacity="0.28" />
      </filter>
    </defs>
    <g filter="url(#softShadow)">
      <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" ry="${Math.round(pillH / 2)}" fill="#FFF8EC" stroke="#F0C675" stroke-width="5" />
    </g>
    <text x="${textX}" y="${textY}" text-anchor="middle" fill="#1D2842" font-family="Nunito, Fredoka, 'Arial Rounded MT Bold', 'Helvetica Rounded', system-ui, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="0.4">${escapeXml(cleanTitle)}</text>
  </svg>`;

  const baseFrame = await sharp(sourceBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover", position: "centre" })
    .toBuffer();

  let pngBuffer = await sharp(baseFrame)
    .composite([{ input: Buffer.from(overlaySvg, "utf8"), top: 0, left: 0 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  if (pngBuffer.byteLength >= MAX_THUMBNAIL_BYTES) {
    pngBuffer = await sharp(baseFrame)
      .composite([{ input: Buffer.from(overlaySvg, "utf8"), top: 0, left: 0 }])
      .png({ compressionLevel: 9, palette: true, quality: 92, effort: 8 })
      .toBuffer();
  }

  if (pngBuffer.byteLength >= MAX_THUMBNAIL_BYTES) {
    throw new Error(`Thumbnail PNG (${pngBuffer.byteLength} bytes) exceeds 2 MB YouTube limit`);
  }

  if (outPath) {
    const resolvedOut = resolve(outPath);
    mkdirSync(dirname(resolvedOut), { recursive: true });
    writeFileSync(resolvedOut, pngBuffer);
  }

  return {
    buffer: pngBuffer,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    byteLength: pngBuffer.byteLength,
    title: cleanTitle,
    outPath: outPath ? resolve(outPath) : null
  };
}

async function loadSpecForThumbnail(id) {
  const req = getRootRequire();
  const { tsImport } = req("tsx/esm/api");
  const parentUrl = pathToFileURL(join(appDir, "package.json")).href;
  const catalogMod = await tsImport("./src/content/catalog.ts", parentUrl);
  const enMod = await tsImport("./src/localization/en/index.ts", parentUrl);
  let show = undefined;
  const showsIdx = join(appDir, "src", "content", "shows", "index.ts");
  if (existsSync(showsIdx)) {
    const showsMod = await tsImport("./src/content/shows/index.ts", parentUrl);
    show = showsMod.showById ? showsMod.showById(id) : (showsMod.SHOWS ?? []).find((s) => s.id === id || s.code === id);
  }
  const spec = show ?? catalogMod.storyById(id) ?? catalogMod.storyByCode(id);
  return { spec, en: enMod.en };
}

function ensureBuiltDist(forceBuild = false) {
  const distIndex = join(appDir, "dist", "index.html");
  if (!forceBuild && existsSync(distIndex)) {
    return join(appDir, "dist");
  }
  const viteBin = [
    join(appDir, "node_modules", ".bin", "vite"),
    join(repoDir, "node_modules", ".bin", "vite")
  ].find((c) => existsSync(c));
  if (!viteBin) {
    throw new Error("vite binary not found; install dependencies first");
  }
  const res = spawnSync(viteBin, ["build"], { cwd: appDir, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`vite build failed with status ${res.status ?? 1}`);
  }
  return join(appDir, "dist");
}

export async function generateThumbnail(options) {
  if (options.fromFrame) {
    const outPath =
      options.outPath ??
      (options.id
        ? join(appDir, "dist", "shows", options.id, "thumbnail.png")
        : resolve(process.cwd(), "thumbnail.png"));
    return compositeThumbnail({
      frameInput: resolve(options.fromFrame),
      title: options.title ?? "Hello, friend!",
      outPath
    });
  }

  assertRemoteThumbnailAllowed(options.env ?? process.env);

  if (!options.id) {
    throw new Error("Missing --id <storyOrShowId> (or pass --from-frame <pngPath>)");
  }

  const { spec, en } = await loadSpecForThumbnail(options.id);
  if (!spec) {
    throw new Error(`Unknown story or show id: "${options.id}"`);
  }

  const resolvedTitle =
    options.title ??
    spec.youtube?.thumbnailTitle ??
    (en.strings?.[spec.titleKey]
      ? en.strings[spec.titleKey].split(/\s+/).slice(0, 3).join(" ")
      : "Hello, friend!");
  validateThumbnailTitle(resolvedTitle);

  const outPath = options.outPath ?? join(appDir, "dist", "shows", spec.id, "thumbnail.png");
  const distDir = ensureBuiltDist(Boolean(options.forceBuild));
  const staticSrv = await startStaticDistServer(distDir);

  const req = getRootRequire();
  const playwright = req("playwright");
  let browser = null;

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--mute-audio",
        "--hide-scrollbars"
      ]
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();

    await page.goto(`${staticSrv.baseUrl}/?broadcast=1&manual=1&audio=0&capture=1&aspect=16:9`, {
      waitUntil: "load",
      timeout: 240_000
    });

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

    const targetBeatId = spec.youtube?.thumbnailBeatId ?? null;
    const targetAtMs =
      Number.isFinite(options.atMs) && options.atMs >= 0
        ? options.atMs
        : Number.isFinite(spec.youtube?.thumbnailOffsetMs)
          ? spec.youtube.thumbnailOffsetMs
          : 4000;
    const hostId = spec.host ?? "momo";

    await page.evaluate(
      async ({ id, beatId, atMs, host }) => {
        const ww = window.__AURA_WONDER_WORLD__;
        if (typeof ww.startShow === "function" && typeof ww.hasShow === "function" && ww.hasShow(id)) {
          await ww.startShow(id);
        } else if (typeof ww.startStory === "function") {
          await ww.startStory(id, "broadcast");
        } else if (typeof ww.startShow === "function") {
          await ww.startShow(id);
        }
        if (typeof ww.flushStage === "function") {
          await ww.flushStage();
        }

        if (beatId) {
          let elapsed = 0;
          let prevSeg = ww.state().segmentIndex ?? -1;
          while (elapsed < 600_000) {
            const st = ww.state();
            if (st.director?.beatId === beatId || st.director?.phase === "finished") break;
            elapsed += 250;
            if (typeof ww.advanceTo === "function") ww.advanceTo(elapsed, { render: false });
            else ww.advance(250);
            const curSeg = ww.state().segmentIndex ?? -1;
            if (curSeg !== prevSeg && typeof ww.flushStage === "function") {
              await ww.flushStage();
              prevSeg = curSeg;
            }
          }
          if (atMs > 0) {
            if (typeof ww.advanceTo === "function") ww.advanceTo(elapsed + atMs);
            else ww.advance(atMs);
          }
        } else if (atMs > 0) {
          if (typeof ww.advanceTo === "function") ww.advanceTo(atMs);
          else ww.advance(atMs);
        }
        if (typeof ww.flushStage === "function") {
          await ww.flushStage();
        }

        // Apply warm camera-facing pose via stageApply so characters stay 100% on-model.
        if (typeof ww.stageApply === "function") {
          ww.stageApply([
            { do: "face", actor: host, toward: "viewer" },
            { do: "gesture", actor: host, gesture: "wave" }
          ]);
        }
        ww.advance(100);
      },
      { id: spec.id, beatId: targetBeatId, atMs: targetAtMs, host: hostId }
    );

    const rawShot = await page.screenshot({ type: "png" });
    return compositeThumbnail({
      frameInput: rawShot,
      title: resolvedTitle,
      outPath
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await staticSrv.close().catch(() => undefined);
  }
}

function parseCliArgs(argv) {
  const opts = {
    id: null,
    outPath: null,
    title: null,
    atMs: null,
    fromFrame: null,
    forceBuild: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--id" && argv[i + 1]) opts.id = argv[++i];
    else if (arg.startsWith("--id=")) opts.id = arg.slice("--id=".length);
    else if (arg === "--out" && argv[i + 1]) opts.outPath = resolve(process.cwd(), argv[++i]);
    else if (arg.startsWith("--out=")) opts.outPath = resolve(process.cwd(), arg.slice("--out=".length));
    else if (arg === "--title" && argv[i + 1]) opts.title = argv[++i];
    else if (arg.startsWith("--title=")) opts.title = arg.slice("--title=".length);
    else if (arg === "--at-ms" && argv[i + 1]) opts.atMs = Number(argv[++i]);
    else if (arg.startsWith("--at-ms=")) opts.atMs = Number(arg.slice("--at-ms=".length));
    else if (arg === "--from-frame" && argv[i + 1]) opts.fromFrame = resolve(process.cwd(), argv[++i]);
    else if (arg.startsWith("--from-frame=")) opts.fromFrame = resolve(process.cwd(), arg.slice("--from-frame=".length));
    else if (arg === "--build") opts.forceBuild = true;
  }
  return opts;
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
  generateThumbnail(cliOpts)
    .then((res) => {
      console.log(
        `[thumbnail] ${res.outPath} (${res.width}x${res.height}, ${(res.byteLength / 1024).toFixed(1)} KB, title="${res.title}")`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[thumbnail] FAILED: ${err?.message ?? err}`);
      process.exit(1);
    });
}
