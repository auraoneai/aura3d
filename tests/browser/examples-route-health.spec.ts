import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
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
      const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      const canvas = page.locator("canvas");
      const screenshotPath = resolve(screenshotDir, `${slug}.png`);
      const profile = await readCanvasProfile(page);
      const screenshot = await canvas.screenshot({ path: screenshotPath });
      asserts(profile);
      expect(screenshot.byteLength).toBeGreaterThan(1000);
      results.push({
        route,
        slug,
        drawCalls,
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

async function readCanvasProfile(page: Page): Promise<CanvasProfile> {
  return page.locator("canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) {
      return {
        centerObjectPixels: 0,
        cyanPixels: 0,
        amberPixels: 0,
        magentaPixels: 0,
        yellowPixels: 0,
        brightNeutralPixels: 0,
        darkDetailPixels: 0,
        uniqueBuckets: 0
      };
    }
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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
        const offset = (y * canvas.width + x) * 4;
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
  });
}
