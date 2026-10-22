import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const routes = [
  {
    route: "/apps/hello-world-typed-asset/",
    slug: "hello-world-typed-asset",
    asserts: (profile: CanvasProfile) => {
      expect(profile.centerObjectPixels).toBeGreaterThan(900);
      expect(profile.cyanPixels).toBeGreaterThan(16);
      expect(profile.amberPixels).toBeGreaterThan(16);
      expect(profile.yellowPixels).toBeGreaterThan(70);
      expect(profile.uniqueBuckets).toBeGreaterThan(16);
    }
  },
  {
    route: "/apps/material-lighting/",
    slug: "material-lighting",
    asserts: (profile: CanvasProfile) => {
      expect(profile.centerObjectPixels).toBeGreaterThan(900);
      expect(profile.cyanPixels).toBeGreaterThan(18);
      expect(profile.amberPixels).toBeGreaterThan(18);
      expect(profile.magentaPixels).toBeGreaterThan(16);
      expect(profile.brightNeutralPixels).toBeGreaterThan(140);
      expect(profile.uniqueBuckets).toBeGreaterThan(18);
    }
  },
  {
    route: "/apps/camera-path/",
    slug: "camera-path",
    asserts: (profile: CanvasProfile) => {
      expect(profile.centerObjectPixels).toBeGreaterThan(800);
      expect(profile.cyanPixels).toBeGreaterThan(18);
      expect(profile.amberPixels).toBeGreaterThan(18);
      expect(profile.darkDetailPixels).toBeGreaterThan(140);
      expect(profile.uniqueBuckets).toBeGreaterThan(18);
    }
  }
] as const;

test.describe("starter examples", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("route health and screenshot report", async ({ page }) => {
    const results = [];
    const screenshotDir = resolve("tests/reports/agent-examples/screenshots");
    mkdirSync(screenshotDir, { recursive: true });
    for (const { route, slug, asserts } of routes) {
      await page.goto(`${server.origin}${route}`);
      await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
      // drawCalls/backend attributes are mirrored live by the frame loop; the
      // first post-ready frames still report the mount-time snapshot, so poll
      // until a real frame has been recorded.
      await expect.poll(() =>
        page.locator("body").getAttribute("data-aura3d-draw-calls").then((value) => Number(value))
      ).toBeGreaterThan(0);
      const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
      const runtimeBackend = await page.locator("body").getAttribute("data-aura3d-runtime-backend");
      const rendererMode = await page.locator("body").getAttribute("data-aura3d-renderer-mode");
      expect(drawCalls).toBeGreaterThan(0);
      expect(runtimeBackend).toBe("production-runtime");
      expect(rendererMode).toBe("production");
      const canvas = page.locator("canvas");
      // Route-ready can precede async asset/streamed-model attach; every route
      // asserts a rendered center object, so wait for it to appear before
      // taking the report screenshot and canvas profile. Profiling reads the
      // composited screenshot: the 4.0 renderer does not preserve the drawing
      // buffer, so raw gl.readPixels on the canvas context returns zeros.
      await expect.poll(async () => profileCanvasPng(await canvas.screenshot()).centerObjectPixels, { timeout: 60_000 }).toBeGreaterThan(0);
      const screenshotPath = resolve(screenshotDir, `${slug}.png`);
      const screenshot = await canvas.screenshot({ path: screenshotPath });
      const profile = profileCanvasPng(screenshot);
      asserts(profile);
      expect(screenshot.byteLength).toBeGreaterThan(1000);
      results.push({
        route,
        slug,
        drawCalls,
        runtimeBackend,
        rendererMode,
        screenshot: screenshotPath,
        screenshotBytes: screenshot.byteLength,
        screenshotSha256: createHash("sha256").update(screenshot).digest("hex"),
        profile
      });
    }
    expect(new Set(results.map((result) => result.screenshotSha256)).size).toBe(results.length);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/agent-examples-playwright.json"), `${JSON.stringify({ schema: "aura3d-example-route-health", pass: true, routes: results }, null, 2)}\n`);
  });
});

interface CanvasProfile {
  readonly centerObjectPixels: number;
  readonly cyanPixels: number;
  readonly amberPixels: number;
  readonly magentaPixels: number;
  readonly yellowPixels: number;
  readonly brightNeutralPixels: number;
  readonly darkDetailPixels: number;
  readonly uniqueBuckets: number;
}

function profileCanvasPng(bytes: Buffer): CanvasProfile {
  const empty: CanvasProfile = {
    centerObjectPixels: 0,
    cyanPixels: 0,
    amberPixels: 0,
    magentaPixels: 0,
    yellowPixels: 0,
    brightNeutralPixels: 0,
    darkDetailPixels: 0,
    uniqueBuckets: 0
  };
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, signature.byteLength).equals(signature)) return empty;
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
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (width <= 0 || height <= 0 || bytesPerPixel === 0) return empty;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowLength = width * bytesPerPixel;
  const rows = new Uint8Array(width * height * bytesPerPixel);
  let previous = new Uint8Array(rowLength);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1);
    const filter = inflated[rowOffset] ?? 0;
    // PNG rows are top-down; the metric loop below uses GL readPixels-style
    // bottom-up coordinates, so store each decoded row flipped.
    const row = rows.subarray((height - 1 - y) * rowLength, (height - y) * rowLength);
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[rowOffset + 1 + x] ?? 0;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] ?? 0 : 0;
      row[x] = (raw + pngFilterPredictor(filter, left, up, upLeft)) & 0xff;
    }
    previous = row;
  }
  {
    const pixels = rows;
    const canvas = { width, height };
    const buckets = new Set<string>();
    let centerObjectPixels = 0;
    let cyanPixels = 0;
    let amberPixels = 0;
    let magentaPixels = 0;
    let yellowPixels = 0;
    let brightNeutralPixels = 0;
    let darkDetailPixels = 0;

    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        if (x > canvas.width * 0.76 && y > canvas.height * 0.74) continue;
        const offset = (y * canvas.width + x) * bytesPerPixel;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 24) buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
        const inCenter = x > canvas.width * 0.23 && x < canvas.width * 0.77 && y > canvas.height * 0.14 && y < canvas.height * 0.84;
        if (inCenter && luminance > 30) centerObjectPixels += 1;
        if (g > 120 && b > 140 && r < 130) cyanPixels += 1;
        if (r > 165 && g > 120 && r > b + 18 && g > b + 6) amberPixels += 1;
        if (r > 165 && b > 145 && g < 130) magentaPixels += 1;
        if (r > 160 && g > 140 && b < 120) yellowPixels += 1;
        if (Math.abs(r - g) < 20 && Math.abs(g - b) < 28 && luminance > 130) brightNeutralPixels += 1;
        if (inCenter && luminance > 22 && luminance < 88 && Math.max(r, g, b) - Math.min(r, g, b) > 18) darkDetailPixels += 1;
      }
    }
    return {
      centerObjectPixels,
      cyanPixels,
      amberPixels,
      magentaPixels,
      yellowPixels,
      brightNeutralPixels,
      darkDetailPixels,
      uniqueBuckets: buckets.size
    };
  }
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
