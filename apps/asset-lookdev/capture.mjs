#!/usr/bin/env node
/**
 * asset-lookdev capture driver (PRD-05 §6.7).
 *
 * Starts the repo vite dev server, then per asset captures the staged stage:
 *   - contact ring: 8 yaw stops at 15° elevation + 1 top-down at 60° (both engines)
 *   - debug strip: every stage.debugViews[] view (both engines)
 *   - gameplay shot: the role's §6.4 camera at 1920×1080 DPR1 and 390×844 DPR3
 * Writes `out/<id>/{contact.jpg,debug.jpg,gameplay.jpg,metrics.json,review.json}`.
 *
 * Usage: node capture.mjs --assets <id,id> [--stage path] [--manifest path]
 *        [--out dir] [--port 0] [--only aura|three]
 * Exit 0 on success, 1 on error, 2 when Chromium/SwiftShader is unsuitable.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(APP_DIR, "..", "..");
const toolRequire = createRequire(join(REPO_ROOT, "tools", "asset-optimize", "package.json"));
const sharp = await import(toolRequire.resolve("sharp"));

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}
const assetIds = (flag("assets", "") ?? "").split(",").filter(Boolean);
const manifestPath = flag("manifest", join(REPO_ROOT, "aura.assets.json"));
const stagePath = flag("stage", join(APP_DIR, "lookdev.stage.json"));
const outRoot = flag("out", join(REPO_ROOT, "tests", "reports", "lookdev"));
const onlyEngine = flag("only", null);
const port = Number(flag("port", "4599"));

if (assetIds.length === 0) {
  console.error("capture: pass --assets <id,id,...>");
  process.exit(1);
}
const stage = JSON.parse(readFileSync(stagePath, "utf8"));
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { assets: [] };

// ---------------------------------------------------------------- GLB bounds
// glTF componentType → divisor for normalized integer accessors (KHR_mesh_quantization).
const DEQUANT_DIVISOR = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function readGlbBounds(filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${filePath}: not a GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const mul = (m, v) => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
  ];
  const compose = (node) => {
    if (node.matrix) return node.matrix;
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    return [
      (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
      (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
      (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
      tx, ty, tz, 1
    ];
  };
  const walk = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const m = matMul(parent, compose(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        const accessor = json.accessors?.[prim.attributes?.POSITION];
        if (!accessor?.min || !accessor?.max) continue;
        // KHR_mesh_quantization: normalized integer accessors carry quantized
        // min/max — dequantize to the [-1,1]/[0,1] range before transforming.
        const divisor = accessor.normalized ? DEQUANT_DIVISOR[accessor.componentType] : undefined;
        const corner = (v, i) => (divisor ? v[i] / divisor : v[i]);
        for (const cx of [corner(accessor.min, 0), corner(accessor.max, 0)])
          for (const cy of [corner(accessor.min, 1), corner(accessor.max, 1)])
            for (const cz of [corner(accessor.min, 2), corner(accessor.max, 2)]) {
              const p = mul(m, [cx, cy, cz]);
              for (let i = 0; i < 3; i += 1) {
                min[i] = Math.min(min[i], p[i]);
                max[i] = Math.max(max[i], p[i]);
              }
            }
      }
    }
    for (const child of node.children ?? []) walk(child, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of json.scenes?.[json.scene ?? 0]?.nodes ?? []) walk(root, I);
  if (!Number.isFinite(min[0])) throw new Error(`${filePath}: no POSITION bounds`);
  return { min, max };
}
function matMul(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c += 1)
    for (let r = 0; r < 4; r += 1)
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}

// ------------------------------------------------------------------ camera
function cameraFor(spec, bounds, fovDeg, elevationDeg = 15, yawDeg = 0) {
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const radius = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  ) / 2;
  const distance = spec.distance ?? radius * 2 * (spec.distanceScale ?? 1.5);
  const el = (elevationDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  return {
    pos: [
      cx + distance * Math.cos(el) * Math.sin(yaw),
      cy + distance * Math.sin(el),
      cz + distance * Math.cos(el) * Math.cos(yaw)
    ],
    target: [cx, cy, cz],
    radius,
    fov: fovDeg ?? spec.fovDegrees
  };
}

// ---------------------------------------------------------------- SSIM(mask)
async function maskedSsim(pathA, pathB) {
  const W = 320, H = 180;
  const [a, b] = await Promise.all([
    sharp.default(pathA).resize(W, H).greyscale().raw().toBuffer(),
    sharp.default(pathB).resize(W, H).greyscale().raw().toBuffer()
  ]);
  // Mask: pixels where EITHER frame deviates from the shared border median.
  const border = [...Array(W).keys(), ...Array(W).keys()].map((i, k) => (k < W ? i : (H - 1) * W + i));
  const medA = median(border.map((i) => a[i]));
  const medB = median(border.map((i) => b[i]));
  const mask = (i) => Math.abs(a[i] - medA) > 12 || Math.abs(b[i] - medB) > 12;
  let count = 0, sum = 0;
  const WIN = 8;
  for (let y = 0; y + WIN <= H; y += WIN) {
    for (let x = 0; x + WIN <= W; x += WIN) {
      const idx = [];
      for (let dy = 0; dy < WIN; dy += 1)
        for (let dx = 0; dx < WIN; dx += 1) idx.push((y + dy) * W + x + dx);
      const active = idx.filter(mask);
      if (active.length < 4) continue;
      count += 1;
      sum += ssimWindow(a, b, idx);
    }
  }
  return count === 0 ? 1 : sum / count;
}
function ssimWindow(a, b, idx) {
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(idx.map((i) => a[i])), mb = mean(idx.map((i) => b[i]));
  let va = 0, vb = 0, cov = 0;
  for (const i of idx) {
    const da = a[i] - ma, db = b[i] - mb;
    va += da * da; vb += db * db; cov += da * db;
  }
  const n = idx.length;
  va /= n; vb /= n; cov /= n;
  const c1 = 6.5025, c2 = 58.5225;
  return ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
}
const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

// ------------------------------------------------------------------ driver
async function waitForServer(url, deadlineMs = 30_000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function shot(page, engine, glbUrl, cam, options) {
  const url = new URL(`http://127.0.0.1:${port}/apps/asset-lookdev/index.html`);
  url.searchParams.set("engine", engine);
  url.searchParams.set("glb", glbUrl);
  if (options.gh) url.searchParams.set("gh", options.gh);
  url.searchParams.set("cam", [...cam.pos, ...cam.target].map((v) => v.toFixed(4)).join(","));
  url.searchParams.set("fov", String(cam.fov));
  url.searchParams.set("radius", cam.radius.toFixed(4));
  url.searchParams.set("hdri", options.hdri);
  url.searchParams.set("dpr", String(options.dpr));
  if (options.debug) url.searchParams.set("debug", options.debug);
  await page.setViewportSize({ width: options.width, height: options.height });
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__a3dLookDev?.status === "ready" || window.__a3dLookDev?.status === "error", { timeout: 60_000 });
  const state = await page.evaluate(() => window.__a3dLookDev);
  if (state.status === "error") throw new Error(`${engine}/${options.debug ?? "beauty"}: ${state.error}`);
  await page.locator("#viewport-host").screenshot({ path: options.outPath, type: "jpeg", quality: 92 });
  return state.result;
}

async function composeGrid(paths, outPath, columns, tileWidth) {
  const images = await Promise.all(paths.map(async (p) => ({
    input: await sharp.default(p).resize({ width: tileWidth }).toBuffer()
  })));
  const meta = await sharp.default(images[0].input).metadata();
  const tw = meta.width, th = meta.height;
  const rows = Math.ceil(images.length / columns);
  const composites = images.map((img, i) => ({
    input: img.input,
    left: (i % columns) * tw,
    top: Math.floor(i / columns) * th
  }));
  await sharp.default({
    create: { width: columns * tw, height: rows * th, channels: 3, background: "#101418" }
  }).composite(composites).jpeg({ quality: 90 }).toFile(outPath);
}

// --------------------------------------------------------------------- main
const server = spawn("pnpm", ["exec", "vite", "--config", join(APP_DIR, "vite.config.ts"), "--port", String(port), "--strictPort"], {
  cwd: REPO_ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, A3D_VITE_TEST_SERVER: "lookdev" }
});
server.stderr.on("data", (d) => process.stderr.write(d));

const gpuProbe = [];
try {
  if (!(await waitForServer(`http://127.0.0.1:${port}/apps/asset-lookdev/index.html`))) {
    console.error("capture: vite dev server did not come up");
    process.exit(1);
  }
  const browser = await chromium.launch({
    args: (process.env.A3D_LOOKDEV_CHROMIUM_ARGS ?? "").split(" ").filter(Boolean)
  });

  for (const assetId of assetIds) {
    const entry = manifest.assets.find((a) => a.id === assetId);
    const glbRepoPath = flag("glb", null) ?? entry?.derived?.url ?? entry?.source;
    if (!glbRepoPath) {
      console.error(`capture: no GLB for asset ${assetId} (manifest has no derived.url/source)`);
      continue;
    }
    const glbFile = resolve(REPO_ROOT, glbRepoPath.startsWith("/") ? glbRepoPath.slice(1) : glbRepoPath);
    const glbUrl = `/${glbRepoPath.replace(/^\//, "")}`;
    const bounds = readGlbBounds(glbFile);
    const glbHash = entry?.derived?.hash ?? entry?.hash ?? `sha256-${createHash("sha256").update(readFileSync(glbFile)).digest("hex")}`;
    const profileId = entry?.derived?.profile ?? "default";
    const gameplay = stage.gameplay[profileId] ?? stage.gameplay.default;
    const outDir = join(outRoot, assetId);
    mkdirSync(join(outDir, "frames"), { recursive: true });

    const engines = onlyEngine ? [onlyEngine] : ["aura", "three"];
    const metrics = {
      assetId,
      stageVersion: String(stage.version),
      derivedSha256: entry?.derived?.hash ?? null,
      capturedAt: new Date().toISOString(),
      views: {},
      drawCalls: {},
      triangles: {},
      errors: {}
    };

    const contactFrames = { aura: [], three: [] };
    const debugFrames = { aura: [], three: [] };

    for (const engine of engines) {
      const page = await browser.newPage({ deviceScaleFactor: stage.capture.desktop.dpr });
      // Fail on software GL in CI — the ANGLE-Metal lane must render for real.
      if (gpuProbe.length === 0) {
        const gl = await page.evaluate(() => {
          const c = document.createElement("canvas");
          const g = c.getContext("webgl2");
          const ext = g?.getExtension("WEBGL_debug_renderer_info");
          return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
        });
        gpuProbe.push(gl);
        if (/swiftshader/i.test(gl)) {
          if (process.env.A3D_LOOKDEV_ALLOW_SWIFTSHADER === "1") {
            console.warn(`capture: WARNING — running on software GL (${gl}); results are dev-only, not release evidence`);
          } else {
            console.error(`capture: refusing software GL (${gl}) — the look-dev stage needs a real GPU`);
            process.exit(2);
          }
        }
      }

      const views = [];
      // Contact ring: 8 yaw stops + top-down.
      for (let i = 0; i < stage.contact.yawStops; i += 1) {
        const cam = cameraFor(gameplay, bounds, stage.contact.fovDegrees, stage.contact.elevationDegrees, i * stage.contact.yawStepDegrees);
        views.push({ name: `contact-yaw${i}`, cam, debug: null, bucket: "contact" });
      }
      views.push({
        name: "contact-top",
        cam: cameraFor(gameplay, bounds, stage.contact.fovDegrees, stage.contact.topDownElevationDegrees, 0),
        debug: null,
        bucket: "contact"
      });
      // Debug views.
      for (const view of stage.debugViews) {
        const cam = cameraFor(gameplay, bounds, gameplay.fovDegrees, 15, 0);
        views.push({ name: `debug-${view}`, cam, debug: view, bucket: "debug" });
      }
      // Gameplay shots: desktop + mobile viewport.
      for (const [viewportName, vp] of Object.entries(stage.capture)) {
        const cam = cameraFor(gameplay, bounds, gameplay.fovDegrees, 10, 0);
        views.push({ name: `gameplay-${viewportName}`, cam, debug: null, bucket: `gameplay-${viewportName}`, width: vp.width, height: vp.height, dpr: vp.dpr });
      }

      for (const view of views) {
        const framePath = join(outDir, "frames", `${engine}-${view.name}.jpg`);
        try {
          const result = await shot(page, engine, glbUrl, view.cam, {
            gh: glbHash,
            hdri: stage.hdris[0].id,
            debug: view.debug,
            outPath: framePath,
            width: view.width ?? stage.capture.desktop.width,
            height: view.height ?? stage.capture.desktop.height,
            dpr: view.dpr ?? stage.capture.desktop.dpr
          });
          metrics.views[`${engine}/${view.name}`] = { frame: `frames/${engine}-${view.name}.jpg`, debugApplied: result?.debugApplied ?? null };
          metrics.drawCalls[engine] = result?.drawCalls ?? 0;
          metrics.triangles[engine] = result?.triangles ?? 0;
          if (result?.errors?.length) metrics.errors[`${engine}/${view.name}`] = result.errors;
          if (view.bucket === "contact") contactFrames[engine].push(framePath);
          if (view.bucket === "debug") debugFrames[engine].push(framePath);
        } catch (error) {
          metrics.errors[`${engine}/${view.name}`] = [error instanceof Error ? error.message : String(error)];
        }
      }
      await page.close();
    }

    // Sheets: Aura tiles are the canonical look-dev artifact; three tiles are
    // written beside them for diffing.
    if (contactFrames.aura.length === stage.contact.yawStops + 1) {
      await composeGrid(contactFrames.aura, join(outDir, "contact.jpg"), 3, 640);
    }
    if (contactFrames.three.length === stage.contact.yawStops + 1) {
      await composeGrid(contactFrames.three, join(outDir, "contact-three.jpg"), 3, 640);
    }
    if (debugFrames.aura.length > 0) await composeGrid(debugFrames.aura, join(outDir, "debug.jpg"), 4, 480);
    if (debugFrames.three.length > 0) await composeGrid(debugFrames.three, join(outDir, "debug-three.jpg"), 4, 480);
    for (const vp of ["desktop", "mobile"]) {
      const pair = [`aura-gameplay-${vp}`, `three-gameplay-${vp}`]
        .map((n) => join(outDir, "frames", `${n}.jpg`))
        .filter((p) => existsSync(p));
      if (pair.length === 2) {
        await composeGrid(pair, join(outDir, vp === "desktop" ? "gameplay.jpg" : `gameplay-${vp}.jpg`), 2, 960);
      }
    }

    // three-vs-Aura masked SSIM per comparable view.
    metrics.ssim = {};
    for (const key of Object.keys(metrics.views)) {
      if (!key.startsWith("aura/")) continue;
      const aFrame = join(outDir, metrics.views[key].frame);
      const tFrame = aFrame.replace(/aura-/, "three-");
      if (!existsSync(tFrame)) continue;
      const view = key.slice(5);
      metrics.ssim[view] = Number((await maskedSsim(aFrame, tFrame)).toFixed(4));
    }

    writeFileSync(join(outDir, "metrics.json"), JSON.stringify(metrics, null, 2));
    writeFileSync(join(outDir, "review.json"), JSON.stringify({
      schema: "aura3d.lookdev-review/1",
      assetId,
      derivedHash: metrics.derivedSha256,
      stageVersion: metrics.stageVersion,
      capturedAt: metrics.capturedAt,
      reviews: []
    }, null, 2));
    console.log(`capture: ${assetId} → ${outDir}`);
  }

  await browser.close();
} finally {
  server.kill("SIGTERM");
}
