#!/usr/bin/env node
/**
 * PRD-05 Phase 6 — tier measurement harness.
 *
 * Loads the six §6.5/Phase-7 pilot games on each quality tier and records:
 *   - texture VRAM estimate (summed from observed texImage2D / texStorage2D /
 *     compressedTexImage2D uploads, i.e. the formats actually uploaded),
 *   - visible triangles + draw calls per frame (WebGL2 draw-call hook),
 *   - ready bytes (PerformanceResourceTiming transferSize across the load),
 *   - long tasks during load (PerformanceObserver "longtask"),
 *   - the run's device/GPU strings (UNMASKED_RENDERER_WEBGL).
 *
 * The tier is forced without touching the route when the app runs the real
 * AuraQuality controller: after the first probe load the engine's
 * `aura3d.quality.v1` cached decision (written by QualityController's
 * calibration) is rewritten to the target tier and the page is reloaded, so
 * the app boots on that tier through its normal "cache" decision source.
 * Apps still on the flag-off StubQualityController never write the cache —
 * those runs are recorded with `forced: false` and `tierObserved: "auto"`
 * (stub auto = high desktop / medium coarse pointer) so the document is
 * honest about which tier actually rendered.
 *
 * Usage:
 *   node tools/asset-optimize/measure-tiers.mjs \
 *     [--games showcase-skyline-runner,...] [--tiers low,medium,high,ultra] \
 *     [--base-url https://aura3d.auraone.ai] \
 *     [--out docs/.../tier-measurements.json] [--sample-ms 4000]
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(repoRoot, "package.json"));
const { chromium } = require("@playwright/test");

function opt(flag, env, fallback) {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${flag}`);
  if (idx >= 0 && argv[idx + 1] !== undefined) return argv[idx + 1];
  return process.env[env] ?? fallback;
}

const gamesConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "tools/quality-rebuild-capture/games.json"), "utf8"),
);
const PILOTS = [
  "showcase-skyline-runner",
  "showcase-mech-hangar",
  "showcase-courier-rush",
  "showcase-vault-breakers",
  "showcase-gravity-post",
  "showcase-bank-shot",
];
const TIERS = ["low", "medium", "high", "ultra"];

const baseUrl = opt("base-url", "QRC_BASE_URL", gamesConfig.productionOrigin).replace(/\/$/, "");
const outPath = opt(
  "out",
  "PRD05_TIER_OUT",
  path.join(repoRoot, "docs/project/aura3d-quality-rebuild/evidence/prd05/assets/tier-measurements.json"),
);
const sampleMs = Number(opt("sample-ms", "PRD05_TIER_SAMPLE_MS", "4000"));
const gameFilter = opt("games", "PRD05_TIER_GAMES", null);
const tierFilter = opt("tiers", "PRD05_TIER_TIERS", null);
const games = (gameFilter ? gameFilter.split(",") : PILOTS).map((id) => {
  const entry = gamesConfig.games.find((g) => g.id === id);
  if (!entry) throw new Error(`unknown game id ${id} (not in games.json)`);
  return entry;
});
const tiers = tierFilter ? tierFilter.split(",") : TIERS;
for (const t of tiers) if (!TIERS.includes(t)) throw new Error(`unknown tier ${t}`);

/** WebGL2 probe injected before app code: upload accounting + draw stats + long tasks. */
const PROBE_SOURCE = `
(() => {
  const probe = {
    uploads: [], draws: [], frameCount: 0, longTasks: [],
    readyAt: null, hadContext: false,
  };
  const pendingFrame = { draws: 0, tris: 0 };
  const finishFrame = () => {
    probe.frameCount += 1;
    probe.draws.push({ draws: pendingFrame.draws, tris: pendingFrame.tris });
    if (probe.draws.length > 4096) probe.draws.splice(0, 1024);
    pendingFrame.draws = 0; pendingFrame.tris = 0;
    requestAnimationFrame(finishFrame);
  };
  requestAnimationFrame(finishFrame);

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) probe.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch { /* longtask unsupported */ }

  const BYTES = {
    // uncompressed internalformat: bytes per pixel
    0x8058: 4, 0x1908: 4, 0x8051: 3, 0x1907: 3, 0x8C43: 4, 0x8227: 2, 0x8D62: 2,
    0x8057: 2, 0x8814: 16, 0x881A: 8, 0x881B: 12, 0x805A: 2, 0x8059: 2,
  };
  const COMPRESSED_BLOCK_BYTES = {
    // internalformat: [blockBytes, blockW, blockH] — bytes per blockW×blockH
    0x83F0: [8, 4, 4], 0x83F1: [8, 4, 4], 0x83F2: [16, 4, 4], 0x83F3: [16, 4, 4],
    0x8C4C: [16, 4, 4], 0x8C4D: [16, 4, 4], 0x8C4E: [16, 4, 4], 0x8C4F: [16, 4, 4],
    0x9274: [8, 4, 4], 0x9278: [16, 4, 4], 0x9276: [8, 4, 4],
    0x9279: [16, 4, 4], 0x927B: [16, 4, 4], 0x927D: [16, 4, 4], 0x927E: [16, 4, 4],
    0x927F: [16, 4, 4], 0x9280: [16, 8, 4], 0x9281: [16, 8, 5], 0x9282: [16, 6, 5],
    0x9283: [16, 6, 6], 0x9284: [16, 8, 6], 0x9285: [16, 8, 8], 0x9286: [16, 10, 5],
    0x9287: [16, 10, 6], 0x9288: [16, 10, 8], 0x9289: [16, 10, 10], 0x928A: [16, 12, 10],
    0x928B: [16, 12, 12], 0x9270: [8, 4, 4], 0x9271: [16, 4, 4], 0x9272: [16, 4, 4],
  };
  const upload = (internalformat, width, height, levels) => {
    if (!(width > 0) || !(height > 0)) return;
    let bytes = 0;
    const block = COMPRESSED_BLOCK_BYTES[internalformat];
    if (block) {
      const [bb, bw, bh] = block;
      bytes = Math.ceil(width / bw) * Math.ceil(height / bh) * bb;
    } else {
      const bpp = BYTES[internalformat] ?? 4;
      bytes = width * height * bpp;
    }
    // account for remaining mip levels in a texStorage call (approx ×4/3)
    if (levels > 1) bytes = Math.round(bytes * (4 / 3));
    probe.uploads.push({ internalformat, width, height, levels: levels || 1, bytes });
  };

  const wrapGl = (ctx) => {
    if (!ctx || ctx.__a3dProbeWrapped) return ctx;
    ctx.__a3dProbeWrapped = true;
    probe.hadContext = true;
    const texImage2D = ctx.texImage2D.bind(ctx);
    ctx.texImage2D = function (...args) {
      // Only the ≥9-arg overloads carry explicit width/height at args[3]/args[4]
      // ((target,level,ifmt,w,h,border,fmt,type,src)); the 6-arg overload passes
      // format/type there — those uploads are covered by texStorage2D anyway.
      if (args.length >= 9 && typeof args[3] === "number" && typeof args[4] === "number") upload(args[2], args[3], args[4], 0);
      return texImage2D(...args);
    };
    const compressedTexImage2D = ctx.compressedTexImage2D.bind(ctx);
    ctx.compressedTexImage2D = function (...args) {
      if (typeof args[3] === "number" && typeof args[4] === "number") upload(args[2], args[3], args[4], 0);
      return compressedTexImage2D(...args);
    };
    if (ctx.texStorage2D) {
      const texStorage2D = ctx.texStorage2D.bind(ctx);
      ctx.texStorage2D = function (target, levels, ifmt, w, h) { upload(ifmt, w, h, levels); return texStorage2D(target, levels, ifmt, w, h); };
    }
    const triFromElements = (count, mode) => mode === 4 ? Math.floor(count / 3) : 0;
    const de = ctx.drawElements.bind(ctx);
    ctx.drawElements = function (mode, count, type, offset) { pendingFrame.draws++; pendingFrame.tris += triFromElements(count, mode); return de(mode, count, type, offset); };
    const dei = ctx.drawElementsInstanced.bind(ctx);
    ctx.drawElementsInstanced = function (mode, count, type, offset, inst) { pendingFrame.draws += inst || 1; pendingFrame.tris += triFromElements(count, mode) * (inst || 1); return dei(mode, count, type, offset, inst); };
    const da = ctx.drawArrays.bind(ctx);
    ctx.drawArrays = function (mode, first, count) { pendingFrame.draws++; pendingFrame.tris += triFromElements(count, mode); return da(mode, first, count); };
    const dai = ctx.drawArraysInstanced.bind(ctx);
    ctx.drawArraysInstanced = function (mode, first, count, inst) { pendingFrame.draws += inst || 1; pendingFrame.tris += triFromElements(count, mode) * (inst || 1); return dai(mode, first, count, inst); };
    const dir = ctx.drawElementsInstancedARB;
    void dir;
    return ctx;
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = getContext.call(this, type, attrs);
    if (type === "webgl2" || type === "webgl") return wrapGl(ctx);
    return ctx;
  };
  window.__a3dTierProbe = probe;
})();
`;

async function collect(page) {
  return page.evaluate(`(() => {
    const p = window.__a3dTierProbe;
    if (!p) return null;
    const vram = p.uploads.reduce((s, u) => s + u.bytes, 0);
    const sample = p.draws.slice(-240);
    const draws = sample.length ? sample.reduce((s, f) => s + f.draws, 0) / sample.length : 0;
    const tris = sample.length ? sample.reduce((s, f) => s + f.tris, 0) / sample.length : 0;
    let bytes = 0;
    for (const r of performance.getEntriesByType("resource")) bytes += r.transferSize || 0;
    const lt = p.longTasks;
    const gpu = (() => {
      try {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (!gl) return {};
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        };
      } catch { return {}; }
    })();
    return {
      vramBytes: vram,
      uploadCount: p.uploads.length,
      uploadsByFormat: p.uploads.reduce((m, u) => { m[u.internalformat] = (m[u.internalformat] || 0) + 1; return m; }, {}),
      frameCount: p.frameCount,
      drawCallsPerFrame: Math.round(draws * 10) / 10,
      trianglesPerFrame: Math.round(tris),
      resourceBytes: bytes,
      longTasks: { count: lt.length, totalMs: Math.round(lt.reduce((s, t) => s + t.duration, 0)), maxMs: Math.round(Math.max(0, ...lt.map((t) => t.duration))) },
      device: { ua: navigator.userAgent, platform: navigator.platform, screen: [screen.width, screen.height], dpr: devicePixelRatio },
      gpu,
      ready: document.body?.dataset?.aura3dReady === "true",
    };
  })()`);
}

async function patchTierCache(page, tier) {
  return page.evaluate(`(() => {
    const raw = localStorage.getItem("aura3d.quality.v1");
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      let touched = 0;
      for (const key of Object.keys(parsed)) {
        if (parsed[key] && typeof parsed[key] === "object") { parsed[key].tier = ${JSON.stringify(tier)}; parsed[key].reason = "measure-tiers"; touched++; }
      }
      localStorage.setItem("aura3d.quality.v1", JSON.stringify(parsed));
      return touched > 0;
    } catch { return false; }
  })()`);
}

async function measureRun(browser, game, tier) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(PROBE_SOURCE);
  const url = `${baseUrl}${game.route}`;
  const navAt = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  } catch (err) {
    await context.close();
    return { game: game.id, tier, url, error: `navigation failed: ${err.message}` };
  }
  // Wait for canvas + first frames so the engine's own cache write lands.
  const readyAt = Date.now() + 60_000;
  let patched = false;
  while (Date.now() < readyAt) {
    const ok = await patchTierCache(page, tier).catch(() => false);
    if (ok) { patched = true; break; }
    await page.waitForTimeout(1000);
  }
  if (!patched) {
    // No cache write — the app decided without calibration (e.g. explicit tier
    // in options). Record the run as-is and mark it unforced.
    const sampleEnd = Date.now() + sampleMs;
    await page.waitForTimeout(sampleMs);
    const metrics = await collect(page).catch((err) => ({ error: String(err) }));
    await context.close();
    return { game: game.id, tierRequested: tier, tierObserved: "auto", url, forced: false, readyMs: Date.now() - navAt - sampleMs, note: "tier cache never written (stub controller — flag-off); run measured on app-decided tier", metrics };
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloadAt = Date.now();
  // wait until drawing (probe frames accumulating) or ready flag
  const drawWait = Date.now() + 45_000;
  while (Date.now() < drawWait) {
    const frames = await page.evaluate("window.__a3dTierProbe ? window.__a3dTierProbe.frameCount : 0").catch(() => 0);
    if (frames > 30) break;
    await page.waitForTimeout(500);
  }
  const readyMs = Date.now() - reloadAt;
  await page.waitForTimeout(sampleMs);
  const metrics = await collect(page).catch((err) => ({ error: String(err) }));
  await context.close();
  return { game: game.id, tierRequested: tier, tierObserved: tier, url, forced: true, readyMs, metrics };
}

async function main() {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const rows = [];
  for (const game of games) {
    for (const tier of tiers) {
      const t0 = Date.now();
      process.stderr.write(`[measure-tiers] ${game.id} @ ${tier} ... `);
      await new Promise((r) => setTimeout(r, 0));
      const row = await measureRun(browser, game, tier);
      row.elapsedMs = Date.now() - t0;
      if (row.forced === false && rows.some((r) => r.game === game.id && r.forced === false)) {
        process.stderr.write("skipped duplicate unforced sample\n");
        continue;
      }
      rows.push(row);
      process.stderr.write(`${row.error ? "ERROR " + row.error : `vram=${((row.metrics?.vramBytes ?? 0) / 1048576).toFixed(1)}MiB draws=${row.metrics?.drawCallsPerFrame ?? "?"} tris=${row.metrics?.trianglesPerFrame ?? "?"} (${row.elapsedMs}ms)`}\n`);
    }
  }
  await browser.close();
  const doc = {
    schema: "aura3d.tier-measurements/1.0",
    generatedAt: new Date().toISOString(),
    baseUrl,
    sampleMs,
    runner: { browser: browser.version(), note: "forced via aura3d.quality.v1 seed + ?a3d-qr=tiers" },
    rows,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(`wrote ${outPath} (${rows.length} runs)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
