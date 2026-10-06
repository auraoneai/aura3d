/**
 * Lane prd02 capture runner (PRD-02 §16.1). Usage:
 *
 *   pnpm exec tsx benchmarks/quality-rebuild/scenes/prd02/capture-lane.ts \
 *     [--dist benchmarks/quality-rebuild/scenes/prd02/dist] [--out dir] \
 *     [--scenes id,id] [--engines aura3d,three] [--flags none] [--strip]
 *
 * Serves `dist` (built by vite.lane.config.ts), captures `lane.html` renders
 * (default + declared broken controls + optional strip frames), writes PNG
 * screenshots, JPEG q90 exports, derived mask PNGs, and a `report.json`
 * containing every §16.4 metric — matching the parent `capture.mjs` contract
 * while staying entirely inside lane-owned files.
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { chromium, type Browser } from "@playwright/test";
import { getPrd02Spec, prd02SceneIds } from "./specs";

interface Args {
  dist: string;
  out: string;
  scenes: string[];
  engines: string[];
  flags: string;
  strip: boolean;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dist: resolve("benchmarks/quality-rebuild/scenes/prd02/dist"),
    out: resolve(process.env.QR_PRD02_OUT ?? "benchmarks/quality-rebuild/scenes/prd02/out"),
    scenes: [...prd02SceneIds],
    engines: ["aura3d", "three"],
    flags: process.env.QRC_FLAGS ?? "none",
    strip: false,
    timeoutMs: 240_000
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--dist" && value) { args.dist = resolve(value); index += 1; }
    else if (flag === "--out" && value) { args.out = resolve(value); index += 1; }
    else if (flag === "--scenes" && value) { const list = value.split(",").filter(Boolean); if (list.length > 0) args.scenes = list; index += 1; }
    else if (flag === "--engines" && value) { args.engines = value.split(",").filter(Boolean); index += 1; }
    else if (flag === "--flags" && value) { args.flags = value; index += 1; }
    else if (flag === "--strip") { args.strip = true; }
    else if (flag === "--timeout-ms" && value) { args.timeoutMs = Number(value); index += 1; }
  }
  return args;
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".hdr": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".map": "application/json"
};

function serve(dist: string, capturesRoot: string): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
    const captures = pathname.startsWith("/captures/");
    const file = captures ? join(capturesRoot, pathname.slice("/captures/".length)) : join(dist, pathname === "/" ? "scenes/prd02/lane.html" : pathname);
    const root = captures ? capturesRoot : dist;
    if (!file.startsWith(root) || !existsSync(file)) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
    response.end(readFileSync(file));
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

const GPU_ARGS = (process.env.QR_BENCH_CHROME_ARGS ?? process.env.QRC_GPU_ARGS ?? "--use-angle=metal --enable-gpu --ignore-gpu-blocklist").split(/\s+/).filter(Boolean);

interface CaptureResult {
  engine: string;
  scene: string;
  control: string;
  status: "ready" | "error";
  payload?: unknown;
  error?: unknown;
  screenshot?: string;
  jpeg?: string;
  wallMs: number;
}

async function captureOne(
  browser: Browser,
  baseUrl: string,
  scene: string,
  engine: string,
  control: string | null,
  outDir: string,
  timeoutMs: number,
  flags: string
): Promise<CaptureResult> {
  const flagsQuery = flags && flags !== "none" ? `&a3d-qr=${encodeURIComponent(flags)}` : "";
  const controlQuery = control ? `&control=${encodeURIComponent(control)}` : "";
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, colorScheme: "dark" });
  const page = await context.newPage();
  const started = Date.now();
  const result: CaptureResult = { engine, scene, control: control ?? "default", status: "error", wallMs: 0 };
  try {
    await page.goto(`${baseUrl}/scenes/prd02/lane.html?engine=${engine}&scene=${scene}${flagsQuery}${controlQuery}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__QR_READY__ || window.__QR_ERROR__), undefined, { timeout: timeoutMs, polling: 250 });
    const state = await page.evaluate(() => ({ ready: window.__QR_READY__ ?? null, error: window.__QR_ERROR__ ?? null }));
    if (state.error) {
      result.error = state.error;
    } else {
      result.status = "ready";
      result.payload = state.ready;
    }
    mkdirSync(join(outDir, scene), { recursive: true });
    const stem = `${engine}${control ? `-${control}` : ""}`;
    const png = join(outDir, scene, `${stem}.png`);
    await page.locator("#stage").screenshot({ path: png, animations: "disabled", timeout: 30_000 });
    result.screenshot = png;
    const jpg = join(outDir, scene, `${stem}.jpg`);
    const dataUrl = await page.locator("#stage").screenshot({ type: "jpeg", quality: 90, animations: "disabled" });
    writeFileSync(jpg, dataUrl);
    result.jpeg = jpg;
  } catch (error) {
    result.error = String(error instanceof Error ? error.stack ?? error : error).slice(0, 4000);
  } finally {
    result.wallMs = Date.now() - started;
    await context.close();
  }
  return result;
}

/** Runs inside a `?mode=metrics` page: decode all PNGs, build masks, run §16.4 metrics. */
async function metricsPass(
  browser: Browser,
  baseUrl: string,
  sceneIds: string[],
  engines: string[]
): Promise<Record<string, unknown>> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/scenes/prd02/lane.html?mode=metrics`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => Boolean((window as { __qrPrd02?: unknown }).__qrPrd02), undefined, { timeout: 60_000, polling: 250 });

  const report = await page.evaluate(async ({ sceneIds, engines }) => {
    const api = (window as unknown as { __qrPrd02: {
      specs: { getPrd02Spec: (id: string) => unknown };
      masks: { analyticMasks: (spec: never, size: { width: number; height: number }) => Record<string, Uint8Array>; shadowReceiverMask: (a: never, b: never) => Uint8Array };
      sceneMetrics: { computeSceneMetrics: (id: string, spec: never, capture: unknown) => unknown };
      regionMetrics: Record<string, unknown>;
    } }).__qrPrd02;

    const loadPixels = async (path: string): Promise<{ width: number; height: number; data: Uint8ClampedArray } | null> => {
      try {
        const response = await fetch(`/captures/${path.split("/").map(encodeURIComponent).join("/")}`);
        if (!response.ok) return null;
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return { width: bitmap.width, height: bitmap.height, data: imageData.data };
      } catch {
        return null;
      }
    };

    const out: Record<string, unknown> = {};
    for (const sceneId of sceneIds) {
      const spec = api.specs.getPrd02Spec(sceneId) as { masks?: readonly string[]; brokenControls?: readonly string[]; strip?: { frames: number } };
      const aura = await loadPixels(`${sceneId}/aura3d.png`);
      const three = engines.includes("three") ? await loadPixels(`${sceneId}/three.png`) : aura;
      if (!aura || !three) {
        out[sceneId] = { error: "missing capture(s)" };
        continue;
      }
      const controls: Record<string, { width: number; height: number; data: Uint8ClampedArray }> = {};
      for (const control of spec.brokenControls ?? []) {
        for (const engine of ["aura3d", "three"]) {
          const pixels = await loadPixels(`${sceneId}/${engine}-${control}.png`);
          if (pixels) controls[`${engine === "aura3d" ? "aura" : "three"}-${control}`] = pixels;
        }
      }
      out[sceneId] = api.sceneMetrics.computeSceneMetrics(sceneId, spec as never, { aura, three, controls });
    }
    return out;
  }, { sceneIds, engines });

  await context.close();
  return report as Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(join(args.dist, "scenes/prd02/lane.html"))) {
    throw new Error(`lane bundle not found at ${args.dist} — run 'vite build --config benchmarks/quality-rebuild/scenes/prd02/vite.lane.config.ts' first`);
  }
  mkdirSync(args.out, { recursive: true });
  const { server, url } = await serve(args.dist, args.out);
  const browser = await chromium.launch({ args: GPU_ARGS });
  const results: CaptureResult[] = [];
  try {
    for (const scene of args.scenes) {
      const spec = getPrd02Spec(scene);
      for (const engine of args.engines) {
        results.push(await captureOne(browser, url, scene, engine, null, args.out, args.timeoutMs, args.flags));
        for (const control of spec.brokenControls ?? []) {
          results.push(await captureOne(browser, url, scene, engine, control, args.out, args.timeoutMs, args.flags));
        }
      }
    }
    const metrics = await metricsPass(browser, url, args.scenes, args.engines);
    const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const report = {
      lane: "prd02",
      flags: args.flags,
      commit: gitSha,
      generatedAt: new Date().toISOString(),
      captures: results.map(({ engine, scene, control, status, wallMs, error }) => ({ engine, scene, control, status, wallMs, ...(error !== undefined ? { error } : {}) })),
      metrics
    };
    writeFileSync(join(args.out, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ captures: results.length, errors: results.filter((r) => r.status !== "ready").length, out: args.out }));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
