import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { readRenderedProbeMetadata } from "../../packages/aura3d-cli/src";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/createAuraApp-asset-probe/robotcand.probe.json";
const screenshotPath = "tests/reports/createAuraApp-asset-probe/robotcand.probe.png";

test.describe("createAuraApp asset probe contract", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("writes release-grade renderedProbe metadata from root public API pixels", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-asset-probe-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_ASSET_PROBE_CONTRACT__ || (window as any).__AURA3D_ASSET_PROBE_ERROR__), undefined, { timeout: 20_000 });

    const harnessError = await page.evaluate(() => (window as any).__AURA3D_ASSET_PROBE_ERROR__);
    if (harnessError) throw new Error(String(harnessError));

    const evidence = await page.evaluate(() => (window as any).__AURA3D_ASSET_PROBE_CONTRACT__);
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    await page.locator("#probe-stage canvas").screenshot({ path: screenshotPath });

    const screenshotBytes = readFileSync(resolve(screenshotPath));
    const pngMetrics = readProbePngMetrics(screenshotBytes);
    const renderedProbe = {
      url: screenshotPath,
      kind: "browser-screenshot" as const,
      renderer: "createAuraApp @aura3d/engine",
      route: "tests/browser/createAuraApp-asset-probe-harness",
      width: pngMetrics.width,
      height: pngMetrics.height,
      checkedAt: new Date().toISOString(),
      sha256: `sha256-${createHash("sha256").update(screenshotBytes).digest("hex")}`,
      assetHash: evidence.asset.hash,
      nonBlankPixels: pngMetrics.nonBlankPixels,
      colorBuckets: pngMetrics.colorBuckets
    };
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      screenshotPath,
      renderedProbe,
      evidence
    }, null, 2)}\n`);

    const parsedProbe = readRenderedProbeMetadata({ file: reportPath });

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.asset).toMatchObject({
      id: "robotcand",
      typed: "assets.robotcand",
      hash: expect.stringMatching(/^sha256-[a-f0-9]{64}$/)
    });
    expect(evidence?.diagnostics?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.diagnostics?.drawCalls).toBeGreaterThan(0);
    expect(evidence?.pixels?.nonBackgroundPixels).toBeGreaterThan(2500);
    expect(evidence?.pixels?.colorBuckets).toBeGreaterThan(5);
    expect(evidence?.pass).toBe(true);
    expect(renderedProbe.width).toBeGreaterThanOrEqual(320);
    expect(renderedProbe.height).toBeGreaterThanOrEqual(180);
    expect(renderedProbe.nonBlankPixels).toBeGreaterThan(5000);
    expect(renderedProbe.colorBuckets).toBeGreaterThanOrEqual(3);
    expect(parsedProbe).toEqual(renderedProbe);
    expect(errors).toEqual([]);
  });
});

function readProbePngMetrics(bytes: Buffer): {
  readonly width: number;
  readonly height: number;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
} {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, signature.byteLength).equals(signature)) {
    throw new Error("Probe screenshot is not a PNG.");
  }
  let offset = signature.byteLength;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  while (offset + 12 <= bytes.byteLength) {
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    const type = bytes.subarray(offset, offset + 4).toString("ascii");
    offset += 4;
    const data = bytes.subarray(offset, offset + length);
    offset += length + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (width <= 0 || height <= 0 || bytesPerPixel === 0) {
    throw new Error(`Unsupported probe PNG encoding: colorType=${colorType}, size=${width}x${height}.`);
  }
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowLength = width * bytesPerPixel;
  let previous = new Uint8Array(rowLength);
  let nonBlankPixels = 0;
  const buckets = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1);
    const filter = inflated[rowOffset] ?? 0;
    const row = new Uint8Array(rowLength);
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[rowOffset + 1 + x] ?? 0;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] ?? 0 : 0;
      row[x] = (raw + pngFilterPredictor(filter, left, up, upLeft)) & 0xff;
    }
    for (let pixel = 0; pixel < width; pixel += 1) {
      const pixelOffset = pixel * bytesPerPixel;
      const red = row[pixelOffset] ?? 0;
      const green = colorType === 0 ? red : row[pixelOffset + 1] ?? 0;
      const blue = colorType === 0 ? red : row[pixelOffset + 2] ?? 0;
      const alpha = colorType === 6 ? row[pixelOffset + 3] ?? 255 : 255;
      if (alpha > 8 && (red > 8 || green > 8 || blue > 8)) {
        nonBlankPixels += 1;
        buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
      }
    }
    previous = row;
  }
  return { width, height, nonBlankPixels, colorBuckets: buckets.size };
}

function pngFilterPredictor(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paethPredictor(left, up, upLeft);
  throw new Error(`unsupported PNG filter ${filter}`);
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}
