#!/usr/bin/env node
/**
 * Captures every quality-rebuild scene for both engines and writes:
 *   out/<scene>/aura3d.png, out/<scene>/three.png
 *   out/<scene>/side-by-side.png  (Aura3D left, three.js right)
 *   out/<scene>/diff.png          (per-pixel abs difference, amplified x4)
 *   out/report.json               (capability logs, console errors, GPU string, pixel metrics)
 *
 * Usage (after `vite build` of this directory):
 *   node benchmarks/quality-rebuild/capture.mjs [--dist <dir>] [--out <dir>] [--scenes a,b] [--engines aura3d,three]
 *
 * Browser work runs remotely (GitHub Actions macos-14); this script is not meant
 * to be run on a developer Mac under the AuraOne policy.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
// `playwright` is not hoisted at the repo root; `@playwright/test` (root devDependency, 1.59.1) re-exports it.
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));

function parseArgs(argv) {
  const args = { dist: join(here, "dist"), out: process.env.QR_BENCH_OUT ? resolve(process.env.QR_BENCH_OUT) : join(here, "out"), scenes: undefined, engines: ["aura3d", "three"], timeoutMs: 240_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--dist") { args.dist = resolve(value); index += 1; }
    else if (flag === "--out") { args.out = resolve(value); index += 1; }
    else if (flag === "--scenes") { args.scenes = value.split(",").filter(Boolean); index += 1; }
    else if (flag === "--engines") { args.engines = value.split(",").filter(Boolean); index += 1; }
    else if (flag === "--timeout") { args.timeoutMs = Number(value); index += 1; }
    else if (flag === "--flags") { args.flags = value; index += 1; }
  }
  return args;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ktx2": "image/ktx2",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml"
};

function startStaticServer(root) {
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  const server = createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
    const candidate = normalize(join(root, urlPath === "/" ? "index.html" : urlPath));
    if (!candidate.startsWith(rootWithSep) || !existsSync(candidate) || !statSync(candidate).isFile()) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.setHeader("Content-Type", MIME[extname(candidate).toLowerCase()] ?? "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    createReadStream(candidate).pipe(response);
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise({ server, port: server.address().port }));
  });
}

function launchArgs() {
  const common = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--force-color-profile=srgb"];
  // CI contract (.github/workflows/quality-rebuild-capture.yml): QR_BENCH_CHROME_ARGS overrides the GPU flags.
  const override = (process.env.QR_BENCH_CHROME_ARGS ?? "").split(/\s+/).filter(Boolean);
  if (override.length > 0) return [...new Set([...common, ...override])];
  if (process.platform === "darwin") return [...common, "--use-angle=metal", "--enable-gpu"];
  // Linux runners have no GPU: SwiftShader is the deterministic software fallback.
  return [...common, "--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader"];
}

async function gpuInfo(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return { webgl2: false };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      webgl2: true,
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxSamples: gl.getParameter(gl.MAX_SAMPLES),
      floatColorBuffer: Boolean(gl.getExtension("EXT_color_buffer_float"))
    };
  });
}

async function captureOne(browser, baseUrl, scene, engine, outDir, timeoutMs, flags) {
  // C-33 (PR 0b-3): --flags passthrough appends a3d-qr=<list>; resolveQrFlags reads it.
  const flagsQuery = flags && flags !== "none" ? `&a3d-qr=${encodeURIComponent(flags)}` : "";
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, colorScheme: "dark" });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleMessages.push({ type: message.type(), text: message.text().slice(0, 2000) });
  });
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error).slice(0, 4000)));
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() });
  });
  const started = Date.now();
  const result = { engine, scene, status: "error", screenshot: null };
  try {
    await page.goto(`${baseUrl}/index.html?engine=${engine}&scene=${scene}${flagsQuery}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__QR_READY__ || window.__QR_ERROR__), undefined, { timeout: timeoutMs, polling: 250 });
    const state = await page.evaluate(() => ({ ready: window.__QR_READY__ ?? null, error: window.__QR_ERROR__ ?? null }));
    result.gpu = await gpuInfo(page);
    if (state.error) {
      result.error = state.error;
    } else {
      result.status = "ready";
      result.payload = state.ready;
    }
    const target = join(outDir, scene, `${engine}.png`);
    await page.locator("#stage").screenshot({ path: target, animations: "disabled", timeout: 30_000 });
    result.screenshot = target;
  } catch (error) {
    result.error = String(error?.stack ?? error).slice(0, 4000);
    try {
      const target = join(outDir, scene, `${engine}.png`);
      await page.locator("#stage").screenshot({ path: target, timeout: 10_000 });
      result.screenshot = target;
    } catch {
      // nothing renderable
    }
  } finally {
    result.wallMs = Date.now() - started;
    result.consoleMessages = consoleMessages;
    result.pageErrors = pageErrors;
    result.failedRequests = failedRequests;
    await context.close();
  }
  return result;
}

/**
 * Runs in a blank browser page: decodes both PNGs, computes metrics, and
 * returns side-by-side + diff PNG data URLs. Keeps the script dependency-free
 * (no pngjs in node_modules).
 */
async function compareInBrowser(page, auraPng, threePng, labels) {
  return page.evaluate(async ({ auraUrl, threeUrl, labels }) => {
    const load = (src) => new Promise((resolveImage, reject) => {
      const image = new Image();
      image.onload = () => resolveImage(image);
      image.onerror = () => reject(new Error("image decode failed"));
      image.src = src;
    });
    const [aura, three] = await Promise.all([load(auraUrl), load(threeUrl)]);
    const width = Math.min(aura.naturalWidth, three.naturalWidth);
    const height = Math.min(aura.naturalHeight, three.naturalHeight);
    const pixels = (image) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    };
    const a = pixels(aura);
    const b = pixels(three);
    const count = width * height;

    // Mean absolute difference (0-255 scale), per channel and overall; PSNR; changed-pixel ratio.
    let sumR = 0, sumG = 0, sumB = 0, sse = 0, changed = 0;
    const diff = new Uint8ClampedArray(count * 4);
    const lumaA = new Float64Array(count);
    const lumaB = new Float64Array(count);
    for (let index = 0; index < count; index += 1) {
      const o = index * 4;
      const dr = Math.abs(a[o] - b[o]);
      const dg = Math.abs(a[o + 1] - b[o + 1]);
      const db = Math.abs(a[o + 2] - b[o + 2]);
      sumR += dr; sumG += dg; sumB += db;
      sse += dr * dr + dg * dg + db * db;
      if (Math.max(dr, dg, db) > 16) changed += 1;
      diff[o] = Math.min(255, dr * 4);
      diff[o + 1] = Math.min(255, dg * 4);
      diff[o + 2] = Math.min(255, db * 4);
      diff[o + 3] = 255;
      lumaA[index] = 0.299 * a[o] + 0.587 * a[o + 1] + 0.114 * a[o + 2];
      lumaB[index] = 0.299 * b[o] + 0.587 * b[o + 1] + 0.114 * b[o + 2];
    }
    const mse = sse / (count * 3);
    const psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);

    // SSIM on luma: 8x8 uniform windows, stride 4, via summed-area tables (Wang et al. 2004 constants).
    const stride = width + 1;
    const table = () => new Float64Array((width + 1) * (height + 1));
    const sa = table(), sb = table(), saa = table(), sbb = table(), sab = table();
    for (let y = 0; y < height; y += 1) {
      let ra = 0, rb = 0, raa = 0, rbb = 0, rab = 0;
      for (let x = 0; x < width; x += 1) {
        const va = lumaA[y * width + x];
        const vb = lumaB[y * width + x];
        ra += va; rb += vb; raa += va * va; rbb += vb * vb; rab += va * vb;
        const at = (y + 1) * stride + (x + 1);
        const up = y * stride + (x + 1);
        sa[at] = sa[up] + ra; sb[at] = sb[up] + rb; saa[at] = saa[up] + raa; sbb[at] = sbb[up] + rbb; sab[at] = sab[up] + rab;
      }
    }
    const boxSum = (t, x0, y0, x1, y1) => t[y1 * stride + x1] - t[y0 * stride + x1] - t[y1 * stride + x0] + t[y0 * stride + x0];
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    const win = 8;
    let ssimSum = 0, windows = 0, ssimMin = 1;
    for (let y = 0; y + win <= height; y += 4) {
      for (let x = 0; x + win <= width; x += 4) {
        const n = win * win;
        const ma = boxSum(sa, x, y, x + win, y + win) / n;
        const mb = boxSum(sb, x, y, x + win, y + win) / n;
        const va = boxSum(saa, x, y, x + win, y + win) / n - ma * ma;
        const vb = boxSum(sbb, x, y, x + win, y + win) / n - mb * mb;
        const cov = boxSum(sab, x, y, x + win, y + win) / n - ma * mb;
        const ssim = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
        ssimSum += ssim;
        windows += 1;
        if (ssim < ssimMin) ssimMin = ssim;
      }
    }

    // Mean luma (sRGB 0-255) per image, a coarse exposure-match signal.
    let meanLumaA = 0, meanLumaB = 0;
    for (let index = 0; index < count; index += 1) { meanLumaA += lumaA[index]; meanLumaB += lumaB[index]; }
    meanLumaA /= count; meanLumaB /= count;

    // Side-by-side composite with a label bar.
    const bar = 32;
    const composite = document.createElement("canvas");
    composite.width = width * 2;
    composite.height = height + bar;
    const cctx = composite.getContext("2d");
    cctx.fillStyle = "#111";
    cctx.fillRect(0, 0, composite.width, composite.height);
    cctx.drawImage(aura, 0, bar, width, height);
    cctx.drawImage(three, width, bar, width, height);
    cctx.fillStyle = "#fff";
    cctx.font = "16px system-ui, sans-serif";
    cctx.textBaseline = "middle";
    cctx.fillText(labels.left, 12, bar / 2);
    cctx.fillText(labels.right, width + 12, bar / 2);
    cctx.fillStyle = "#555";
    cctx.fillRect(width - 1, 0, 2, composite.height);

    const diffCanvas = document.createElement("canvas");
    diffCanvas.width = width;
    diffCanvas.height = height;
    diffCanvas.getContext("2d").putImageData(new ImageData(diff, width, height), 0, 0);

    return {
      metrics: {
        width,
        height,
        meanAbsDiff: (sumR + sumG + sumB) / (count * 3),
        meanAbsDiffPerChannel: { r: sumR / count, g: sumG / count, b: sumB / count },
        psnr,
        ssim: ssimSum / Math.max(1, windows),
        ssimMinWindow: ssimMin,
        ssimMethod: "luma, 8x8 uniform window, stride 4",
        changedPixelRatio: changed / count,
        changedPixelThreshold: 16,
        meanLuma: { aura3d: meanLumaA, three: meanLumaB }
      },
      sideBySide: composite.toDataURL("image/png"),
      diff: diffCanvas.toDataURL("image/png")
    };
  }, { auraUrl: `data:image/png;base64,${auraPng.toString("base64")}`, threeUrl: `data:image/png;base64,${threePng.toString("base64")}`, labels });
}

function writeDataUrl(path, dataUrl) {
  writeFileSync(path, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(join(args.dist, "index.html"))) {
    throw new Error(`No build at ${args.dist}. Run: pnpm exec vite build --config benchmarks/quality-rebuild/vite.config.ts`);
  }
  mkdirSync(args.out, { recursive: true });
  const { server, port } = await startStaticServer(args.dist);
  const baseUrl = `http://127.0.0.1:${port}`;
  // QR_BENCH_CHANNEL=headless-shell uses chromium-headless-shell; required on GitLab saas-macos runners,
  // where full Chromium crashes on the second page (tools/quality-rebuild-capture/gpu-probe.mjs).
  const benchChannel = process.env.QR_BENCH_CHANNEL === "headless-shell" ? undefined : (process.env.QR_BENCH_CHANNEL || "chromium");
  const browser = await chromium.launch({ channel: benchChannel, headless: true, args: launchArgs() });
  const report = {
    schema: "aura3d-quality-rebuild-report/1.0",
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      node: process.version,
      ci: Boolean(process.env.CI),
      runner: process.env.RUNNER_OS ? `${process.env.RUNNER_OS}/${process.env.RUNNER_ARCH ?? ""}` : null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      ciProvider: process.env.GITLAB_CI ? "gitlab" : process.env.GITHUB_ACTIONS ? "github" : "local",
      gitlabPipeline: process.env.CI_PIPELINE_ID ?? null,
      githubTriggerRun: process.env.QR_GITHUB_RUN || null,
      browserChannel: process.env.QR_BENCH_CHANNEL || "chromium",
      browserVersion: browser.version(),
      launchArgs: launchArgs(),
      assetCopy: existsSync(join(args.dist, "qr-assets", "asset-copy-report.json"))
        ? JSON.parse(readFileSync(join(args.dist, "qr-assets", "asset-copy-report.json"), "utf8"))
        : null,
      gpu: null
    },
    scenes: []
  };

  try {
    // Discover scene ids from the built page itself (single source of truth).
    const discovery = await browser.newPage();
    await discovery.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await discovery.waitForFunction(() => Array.isArray(window.__QR_SCENES__), undefined, { timeout: 60_000 });
    const allScenes = await discovery.evaluate(() => window.__QR_SCENES__);
    report.environment.gpu = await gpuInfo(discovery);
    await discovery.close();
    const scenes = args.scenes ? allScenes.filter((id) => args.scenes.includes(id)) : allScenes;
    console.log(`[quality-rebuild] GPU: ${report.environment.gpu?.renderer ?? "unknown"}; ${scenes.length} scenes x ${args.engines.join("+")}`);

    const comparePage = await browser.newPage();
    await comparePage.goto("about:blank");
    for (const scene of scenes) {
      mkdirSync(join(args.out, scene), { recursive: true });
      const entry = { scene, engines: {}, metrics: null, sideBySide: null, diff: null };
      for (const engine of args.engines) {
        const result = await captureOne(browser, baseUrl, scene, engine, args.out, args.timeoutMs, args.flags ?? process.env.QRC_FLAGS ?? "none");
        entry.engines[engine] = result;
        console.log(`[quality-rebuild] ${scene} ${engine}: ${result.status} in ${result.wallMs} ms${result.error ? ` (${result.error.split("\n")[0]})` : ""}`);
      }
      const aura = entry.engines.aura3d;
      const three = entry.engines.three;
      if (aura?.screenshot && three?.screenshot) {
        const auraLabel = `Aura3D ${aura.payload?.engineVersion ?? ""} (${aura.status})`;
        const threeLabel = `three.js ${three.payload?.engineVersion ?? ""} (${three.status})`;
        const comparison = await compareInBrowser(comparePage, readFileSync(aura.screenshot), readFileSync(three.screenshot), { left: auraLabel, right: threeLabel });
        entry.metrics = comparison.metrics;
        entry.sideBySide = join(args.out, scene, "side-by-side.png");
        entry.diff = join(args.out, scene, "diff.png");
        writeDataUrl(entry.sideBySide, comparison.sideBySide);
        writeDataUrl(entry.diff, comparison.diff);
      }
      report.scenes.push(entry);
      writeFileSync(join(args.out, "report.json"), JSON.stringify(report, null, 2));
    }
    await comparePage.close();
  } finally {
    await browser.close();
    server.close();
  }

  report.summary = report.scenes.map((entry) => ({
    scene: entry.scene,
    aura3d: entry.engines.aura3d?.status ?? "skipped",
    three: entry.engines.three?.status ?? "skipped",
    meanAbsDiff: entry.metrics?.meanAbsDiff ?? null,
    ssim: entry.metrics?.ssim ?? null,
    auraMissing: (entry.engines.aura3d?.payload?.capabilityLog ?? []).filter((item) => item.status === "missing").map((item) => item.feature)
  }));
  writeFileSync(join(args.out, "report.json"), JSON.stringify(report, null, 2));
  const failures = report.scenes.flatMap((entry) => Object.values(entry.engines).filter((result) => result.status !== "ready").map((result) => `${entry.scene}/${result.engine}`));
  console.log(`[quality-rebuild] report: ${join(args.out, "report.json")}; non-ready captures: ${failures.length ? failures.join(", ") : "none"}`);
  // Capture failures are audit data, not a script failure; exit non-zero only when nothing rendered at all.
  if (report.scenes.length > 0 && report.scenes.every((entry) => !entry.metrics)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
