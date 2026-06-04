import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { readProductionPngStats, type ProductionPngStats } from "../../tools/production-runtime-report-bridge/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface WebGPUVisualRoute {
  readonly id: string;
  readonly path: string;
  readonly minimumUniqueColorBuckets: number;
  readonly minimumForegroundCoverage: number;
  readonly minimumCenterForegroundCoverage: number;
  readonly minimumDetailEdgeDensity: number;
  readonly minimumForegroundAverageSaturation: number;
  readonly minimumSaturatedPixelCoverage: number;
  readonly maximumAverageLuma: number;
  readonly minimumOrangeAccentCoverage?: number;
  readonly maximumYellowMaterialEdgeDensity?: number;
}

interface WebGPUVisualRuntime {
  readonly status?: "running" | "ready" | "unsupported" | "error";
  readonly backend?: string;
  readonly error?: string;
  readonly unsupportedReason?: string;
  readonly drawCalls?: number;
  readonly nativePbrSubmissions?: number;
}

const routes: readonly WebGPUVisualRoute[] = [
  {
    id: "webgpu-product-viewer",
    path: "/apps/wow-webgpu-product-viewer/?chrome=hidden&quality=marketing",
    minimumUniqueColorBuckets: 45,
    minimumForegroundCoverage: 0.06,
    minimumCenterForegroundCoverage: 0.14,
    minimumDetailEdgeDensity: 0.0018,
    minimumForegroundAverageSaturation: 0.16,
    minimumSaturatedPixelCoverage: 0.025,
    maximumAverageLuma: 100,
    minimumOrangeAccentCoverage: 0.007,
    maximumYellowMaterialEdgeDensity: 0.007
  },
  {
    id: "webgpu-pbr-asset",
    path: "/apps/wow-webgpu-pbr-asset/?chrome=hidden&quality=marketing",
    minimumUniqueColorBuckets: 70,
    minimumForegroundCoverage: 0.18,
    minimumCenterForegroundCoverage: 0.3,
    minimumDetailEdgeDensity: 0.0055,
    minimumForegroundAverageSaturation: 0.18,
    minimumSaturatedPixelCoverage: 0.05,
    maximumAverageLuma: 45
  }
];

test.describe("WebGPU product visual quality", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const route of routes) {
    test(`${route.id} renders imported PBR assets in front of the stage`, async ({ page }) => {
      const errors: string[] = [];
      const webgpuWarnings: string[] = [];
      page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
        if (message.type() === "warning" && /WebGPU|WGSL|RenderPipeline|ShaderModule|validation/i.test(message.text())) {
          webgpuWarnings.push(message.text());
        }
      });
      page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });

      await page.setViewportSize({ width: 1440, height: 809 });
      await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => {
          const runtime = window.__a3dWowRuntime as WebGPUVisualRuntime | undefined;
          return runtime?.status === "running" || runtime?.status === "unsupported" || runtime?.status === "error";
        },
        undefined,
        { timeout: 60_000 }
      );
      await page.waitForTimeout(800);

      const runtime = await page.evaluate(() => window.__a3dWowRuntime) as WebGPUVisualRuntime | undefined;
      test.skip(runtime?.status === "unsupported", runtime?.unsupportedReason ?? "WebGPU is not available in this browser.");
      expect(runtime?.status, runtime?.error ?? errors.join("\n")).toBe("running");
      expect(runtime?.backend).toBe("a3d-webgpu");
      expect(runtime?.drawCalls ?? 0).toBeGreaterThanOrEqual(3);
      expect(runtime?.nativePbrSubmissions ?? 0).toBeGreaterThan(0);
      expect(webgpuWarnings.join("\n"), `${route.id} should not emit native WebGPU validation warnings`).toBe("");

      const screenshotPath = `tests/reports/webgpu-product-quality/${route.id}.png`;
      mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
      const viewport = page.locator("#viewport");
      const firstFrame = await viewport.screenshot({ path: screenshotPath });
      if (route.id === "webgpu-product-viewer") {
        const frameCountBefore = await page.evaluate(() => window.__a3dWowRuntime?.frameCount ?? 0);
        await page.waitForTimeout(900);
        const secondFrame = await viewport.screenshot();
        const frameCountAfter = await page.evaluate(() => window.__a3dWowRuntime?.frameCount ?? 0);
        expect(frameCountAfter, `${route.id} render loop should keep submitting frames`).toBeGreaterThan(frameCountBefore + 5);
        expect(imageDigest(secondFrame), `${route.id} camera should orbit over time`).not.toBe(imageDigest(firstFrame));
      }
      const stats = readProductionPngStats(resolve(screenshotPath));
      assertVisualQuality(route, stats);
      assertProductMaterialQuality(route, screenshotPath);
      writeFileSync(resolve(`tests/reports/webgpu-product-quality/${route.id}.json`), `${JSON.stringify({
        schema: "a3d-webgpu-product-quality",
        route: route.path,
        runtime,
        screenshotPath,
        stats
      }, null, 2)}\n`);
    });
  }
});

function imageDigest(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertVisualQuality(route: WebGPUVisualRoute, stats: ProductionPngStats): void {
  expect(stats.uniqueColorBuckets, `${route.id} should not collapse into a flat overdrawn block`).toBeGreaterThanOrEqual(route.minimumUniqueColorBuckets);
  expect(stats.foregroundCoverage, `${route.id} product/stage foreground coverage`).toBeGreaterThanOrEqual(route.minimumForegroundCoverage);
  expect(stats.centerForegroundCoverage, `${route.id} centered product coverage`).toBeGreaterThanOrEqual(route.minimumCenterForegroundCoverage);
  expect(stats.detailEdgeDensity, `${route.id} imported-asset detail edges`).toBeGreaterThanOrEqual(route.minimumDetailEdgeDensity);
  expect(stats.foregroundAverageSaturation, `${route.id} should preserve visible material color, not grayscale lighting only`).toBeGreaterThanOrEqual(route.minimumForegroundAverageSaturation);
  expect(stats.saturatedPixelCoverage, `${route.id} should contain enough colored product pixels`).toBeGreaterThanOrEqual(route.minimumSaturatedPixelCoverage);
  expect(stats.averageLuma, `${route.id} should not be dominated by washed-out stage overdraw`).toBeLessThanOrEqual(route.maximumAverageLuma);
}

function assertProductMaterialQuality(route: WebGPUVisualRoute, screenshotPath: string): void {
  if (route.minimumOrangeAccentCoverage === undefined && route.maximumYellowMaterialEdgeDensity === undefined) return;
  const stats = readProductPropMaterialStats(resolve(screenshotPath));
  if (route.minimumOrangeAccentCoverage !== undefined) {
    expect(stats.orangeAccentCoverage, `${route.id} should preserve orange accent material, not collapse the product to all-yellow/grayscale`).toBeGreaterThanOrEqual(route.minimumOrangeAccentCoverage);
  }
  if (route.maximumYellowMaterialEdgeDensity !== undefined) {
    expect(stats.yellowMaterialEdgeDensity, `${route.id} yellow product surface should stay smooth instead of liquid/noisy`).toBeLessThanOrEqual(route.maximumYellowMaterialEdgeDensity);
  }
}

function readProductPropMaterialStats(path: string): {
  readonly orangeAccentCoverage: number;
  readonly yellowMaterialEdgeDensity: number;
} {
  const image = readPngPixels(path);
  let orangePixels = 0;
  let yellowComparisons = 0;
  let yellowEdges = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * image.channels;
      const red = image.pixels[offset] ?? 0;
      const green = image.pixels[offset + 1] ?? 0;
      const blue = image.pixels[offset + 2] ?? 0;
      const saturation = rgbSaturation(red, green, blue);
      const yellow = red > 205 && green > 185 && blue < 90 && saturation > 0.45;
      const orange = red > 190 && green > 80 && green < 190 && blue < 120 && saturation > 0.45;
      if (orange) orangePixels += 1;
      if (!yellow) continue;
      const luma = rgbLuma(red, green, blue);
      if (x + 1 < image.width) {
        const rightOffset = offset + image.channels;
        const rightLuma = rgbLuma(image.pixels[rightOffset] ?? 0, image.pixels[rightOffset + 1] ?? 0, image.pixels[rightOffset + 2] ?? 0);
        if (Math.abs(luma - rightLuma) > 12) yellowEdges += 1;
        yellowComparisons += 1;
      }
      if (y + 1 < image.height) {
        const downOffset = offset + image.width * image.channels;
        const downLuma = rgbLuma(image.pixels[downOffset] ?? 0, image.pixels[downOffset + 1] ?? 0, image.pixels[downOffset + 2] ?? 0);
        if (Math.abs(luma - downLuma) > 12) yellowEdges += 1;
        yellowComparisons += 1;
      }
    }
  }
  const totalPixels = image.width * image.height;
  return {
    orangeAccentCoverage: Number((orangePixels / Math.max(1, totalPixels)).toFixed(6)),
    yellowMaterialEdgeDensity: Number((yellowEdges / Math.max(1, yellowComparisons)).toFixed(6))
  };
}

function readPngPixels(path: string): {
  readonly width: number;
  readonly height: number;
  readonly channels: 3 | 4;
  readonly pixels: Uint8Array;
} {
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`${path} is not a PNG file.`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (width <= 0 || height <= 0 || channels === 0) throw new Error(`${path} uses unsupported PNG color type ${colorType}.`);
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset] ?? 0;
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset++] ?? 0;
      const left = x >= channels ? pixels[y * stride + x - channels] ?? 0 : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] ?? 0 : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] ?? 0 : 0;
      pixels[y * stride + x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
  }
  return { width, height, channels: channels as 3 | 4, pixels };
}

function rgbLuma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function rgbSaturation(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return max > 0 ? (max - min) / max : 0;
}

function unfilterPngByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 255;
    case 2:
      return (raw + up) & 255;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 255;
    case 4:
      return (raw + paethPredictor(left, up, upLeft)) & 255;
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const predictor = left + up - upLeft;
  const leftDistance = Math.abs(predictor - left);
  const upDistance = Math.abs(predictor - up);
  const upLeftDistance = Math.abs(predictor - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}
