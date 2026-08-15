import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ORIGIN = process.env.A3D_PUBLIC_DEMO_URL ?? "https://aura3d.auraone.ai";
const REPORT_DIR = resolve("tests/reports/production-catalog-audit");
const SCRATCH_JSON = "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer/production-audit.json";
const SCRATCH_DIR = "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer/production-catalog";

const ROUTES = [
  { id: "01-product-configurator-studio", path: "/apps/showcase-product-configurator/" },
  { id: "02-smart-city-control-room", path: "/apps/showcase-smart-city-control/" },
  { id: "03-cinematic-architecture-tour", path: "/apps/showcase-cinematic-architecture/" },
  { id: "04-digital-twin-operations-center", path: "/apps/showcase-digital-twin-ops/" },
  { id: "05-blockfall-reactor", path: "/apps/showcase-blockfall-reactor/" },
  { id: "06-turbo-drift-circuit", path: "/apps/showcase-turbo-drift-circuit/" },
  { id: "07-skyline-runner", path: "/apps/showcase-skyline-runner/" },
  { id: "08-aura-clash-arena", path: "/showcase/aura-clash/playable/" },
  { id: "09-interactive-water-lab", path: "/apps/advanced-examples-gallery/#water-lab" },
  { id: "10-ocean-surface-showcase", path: "/apps/advanced-examples-gallery/#ocean-observatory" },
  { id: "11-cinematic-post-pipeline", path: "/apps/advanced-examples-gallery/#reactor-post" },
  { id: "12-smart-city-stress-test", path: "/apps/advanced-examples-gallery/#smart-city" },
  { id: "13-ai-data-galaxy", path: "/apps/advanced-examples-gallery/#data-galaxy" },
  { id: "14-concept-car-configurator", path: "/apps/advanced-examples-gallery/#product-configurator" },
  { id: "15-animated-robotics-lab", path: "/apps/advanced-examples-gallery/#robotics-lab" },
  { id: "16-physics-manipulation-lab", path: "/apps/advanced-examples-gallery/#physics-playground" },
  { id: "17-fog-cathedral", path: "/apps/advanced-examples-gallery/#fog-cathedral" },
  { id: "18-factory-digital-twin", path: "/apps/advanced-examples-gallery/#digital-twin" },
  { id: "19-gltf-material-variants", path: "/apps/loader-gltf-variants/" },
  { id: "20-obj-loader", path: "/apps/loader-obj/" },
  { id: "21-texture-anisotropy", path: "/apps/texture-anisotropy/" },
  { id: "22-depth-outline", path: "/apps/postprocessing-depth-outline/" },
  { id: "23-trackball-controls", path: "/apps/controls-trackball/" },
  { id: "24-geometry-draw-range", path: "/apps/geometry-drawrange/" },
  { id: "25-interactive-picking", path: "/apps/interactive-picking/" },
  { id: "26-multiple-camera-views", path: "/apps/camera-multiple-views/" },
  { id: "27-webxr-interactions", path: "/apps/webxr-interactions/" },
  { id: "28-simple-transforms", path: "/apps/wow-simple-transforms/" },
  { id: "29-expressive-robot-rig", path: "/apps/wow-robot-expressive-rig/" },
  { id: "30-avocado-texture-lab", path: "/apps/wow-boombox-texture-lab/" },
  { id: "31-material-spheres", path: "/apps/wow-standard-material-spheres/" },
  { id: "32-accelerated-particle-field", path: "/apps/wow-webgpu-compute-particles/" },
  { id: "33-tokyo-keyframes", path: "/apps/wow-tokyo-keyframes/" },
  { id: "34-damaged-helmet-detail", path: "/apps/wow-damaged-helmet-pbr-detail/" },
  { id: "35-concept-car-cinema", path: "/apps/wow-concept-car-cinema/" },
  { id: "36-advanced-gallery-console", path: "/apps/advanced-examples-gallery/" }
] as const;

interface RouteAudit {
  readonly id: string;
  readonly path: string;
  readonly url: string;
  readonly httpStatus: number | null;
  readonly canvasReady: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly authoredAssetFailed: boolean;
  readonly claims201: boolean;
  readonly consoleErrors: readonly string[];
  readonly failedAssets: readonly string[];
  readonly screenshot: string;
  readonly pass: boolean;
}

async function waitReady(page: Page): Promise<{ width: number; height: number; ready: boolean }> {
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return canvas instanceof HTMLCanvasElement && canvas.width > 8 && canvas.height > 8;
  }, undefined, { timeout: 75_000 }).catch(() => undefined);
  await page.waitForFunction(() => {
    const gallery = (window as unknown as {
      __A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__?: {
        status?: string;
        authoredAsset?: { status?: string };
        frameCount?: number;
      };
    }).__A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__;
    if (!gallery) return true;
    if (gallery.status === "error") return true;
    return (gallery.frameCount ?? 0) >= 3 && (gallery.authoredAsset?.status ?? "ready") !== "loading";
  }, undefined, { timeout: 75_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return { width: 0, height: 0, ready: false };
    return { width: canvas.width, height: canvas.height, ready: canvas.width > 8 && canvas.height > 8 };
  });
}

test("audit all 36 production catalog routes", async ({ page }, testInfo) => {
  testInfo.setTimeout(900_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(SCRATCH_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const audits: RouteAudit[] = [];

  for (const route of ROUTES) {
    const consoleErrors: string[] = [];
    const failedAssets: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    };
    const onPageError = (error: Error) => consoleErrors.push(`pageerror: ${error.message}`);
    const onResponse = (response: { status(): number; url(): string }) => {
      if (response.status() >= 400 && !/favicon/i.test(response.url())) {
        failedAssets.push(`${response.status()} ${response.url()}`);
      }
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    const url = `${ORIGIN}${route.path}`;
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const canvas = await waitReady(page);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const authoredAssetFailed = /authored asset failed to load/i.test(bodyText);
    const claims201 = /2\.0\.1/.test(bodyText) || /aura3d/i.test(bodyText);
    const screenshot = join(REPORT_DIR, `${route.id}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    await page.screenshot({ path: join(SCRATCH_DIR, `${route.id}.png`), fullPage: false });

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);

    const httpOk = response === null || response.ok();
    const materialConsoleErrors = consoleErrors.filter((text) => {
      if (failedAssets.length === 0 && /Failed to load resource: the server responded with a status of 404/.test(text)) {
        return false;
      }
      return true;
    });
    const pass = httpOk
      && canvas.ready
      && !authoredAssetFailed
      && materialConsoleErrors.length === 0
      && failedAssets.length === 0;
    audits.push({
      id: route.id,
      path: route.path,
      url,
      httpStatus: response?.status() ?? null,
      canvasReady: canvas.ready,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      authoredAssetFailed,
      claims201,
      consoleErrors,
      failedAssets,
      screenshot,
      pass
    });
  }

  const report = {
    schema: "aura3d-production-catalog-audit/1.0",
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    routeCount: audits.length,
    passed: audits.filter((entry) => entry.pass).length,
    failed: audits.filter((entry) => !entry.pass).map((entry) => entry.id),
    routes: audits
  };
  writeFileSync(join(REPORT_DIR, "production-catalog-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(SCRATCH_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer/catalog-audit.json",
    `${JSON.stringify(report, null, 2)}\n`
  );
  writeFileSync(
    join(REPORT_DIR, "production-catalog-audit.md"),
    [
      `# Production catalog audit`,
      ``,
      `- Origin: ${ORIGIN}`,
      `- Routes: ${report.routeCount}`,
      `- Passed: ${report.passed}`,
      `- Failed: ${report.failed.length === 0 ? "none" : report.failed.join(", ")}`,
      ``
    ].join("\n")
  );

  expect(audits.length, "catalog must list 36 public experiences").toBe(36);
  expect(report.failed, report.failed.join("\n")).toEqual([]);
});
