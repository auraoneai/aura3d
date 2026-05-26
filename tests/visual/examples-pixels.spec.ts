import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Average = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type PixelMatcher = "blue" | "bright" | "green" | "orange" | "pink" | "purple" | "yellow";

type PixelCheck = {
  name: string;
  region: Region;
  matcher: PixelMatcher;
  minimumPixels: number;
};

declare global {
  interface Window {
    __AURA3D_EXAMPLE__?: {
      id: string;
      status: "ready" | "error";
      acceptance: string;
      diagnostics?: { drawCalls: number; lastError: string | null };
      metrics?: Record<string, string | number | boolean>;
      error?: string;
    };
  }
}

const visualTargets = [
  {
    id: "00-basic-triangle",
    region: { x: 430, y: 300, width: 100, height: 80 },
    assertion: (average: Average) => average.r > 120 && average.g > 35 && average.b < 90,
    pixelChecks: [{ name: "triangle-fill", region: { x: 380, y: 190, width: 220, height: 240 }, matcher: "orange", minimumPixels: 8_000 }],
  },
  {
    id: "01-basic-scene",
    region: { x: 325, y: 240, width: 90, height: 90 },
    assertion: (average: Average) => average.b > 120 && average.r < 90,
    pixelChecks: [{ name: "cube-fill", region: { x: 300, y: 210, width: 150, height: 150 }, matcher: "blue", minimumPixels: 1_500 }],
  },
  {
    id: "02-materials-pbr",
    region: { x: 390, y: 205, width: 70, height: 70 },
    assertion: (average: Average) => average.r > 140 && average.g > 140 && average.b > 120,
    pixelChecks: [{ name: "pbr-swatches", region: { x: 300, y: 120, width: 360, height: 300 }, matcher: "bright", minimumPixels: 12_000 }],
  },
  {
    id: "03-shadows",
    region: { x: 420, y: 260, width: 120, height: 120 },
    assertion: (average: Average) => average.b > 120 && average.r > 90,
    pixelChecks: [{ name: "shadow-caster", region: { x: 360, y: 210, width: 240, height: 200 }, matcher: "blue", minimumPixels: 1_000 }],
  },
  {
    id: "04-physics-stack",
    region: { x: 420, y: 150, width: 140, height: 280 },
    assertion: (average: Average) => average.g > 80 && average.r < 130 && average.b > 70,
    pixelChecks: [{ name: "stacked-bodies", region: { x: 400, y: 130, width: 180, height: 320 }, matcher: "green", minimumPixels: 3_000 }],
  },
  {
    id: "05-animation-character",
    region: { x: 250, y: 215, width: 460, height: 180 },
    assertion: (average: Average) => average.r > 24 && average.g > 30 && average.b < 60,
    pixelChecks: [{ name: "animated-marker", region: { x: 230, y: 180, width: 500, height: 240 }, matcher: "yellow", minimumPixels: 2_000 }],
  },
  {
    id: "06-asset-gltf",
    region: { x: 420, y: 235, width: 120, height: 120 },
    assertion: (average: Average) => average.b > 120 && average.r > 100,
    pixelChecks: [{ name: "gltf-mesh", region: { x: 360, y: 190, width: 240, height: 200 }, matcher: "purple", minimumPixels: 8_000 }],
  },
  {
    id: "07-input-controls",
    region: { x: 420, y: 190, width: 120, height: 170 },
    assertion: (average: Average) => average.r > 25 && average.g > 25 && average.b > 25,
    pixelChecks: [{ name: "orbit-reticle", region: { x: 390, y: 160, width: 180, height: 220 }, matcher: "yellow", minimumPixels: 700 }],
  },
  {
    id: "08-audio-spatial",
    region: { x: 640, y: 155, width: 90, height: 90 },
    assertion: (average: Average) => average.r > 90 && average.b > 70,
    pixelChecks: [
      { name: "listener", region: { x: 435, y: 225, width: 90, height: 90 }, matcher: "blue", minimumPixels: 2_500 },
      { name: "source", region: { x: 635, y: 150, width: 100, height: 100 }, matcher: "pink", minimumPixels: 2_000 },
    ],
  },
  {
    id: "09-editor-runtime",
    region: { x: 500, y: 130, width: 190, height: 190 },
    assertion: (average: Average) => average.g > 100 && average.r < 150,
    pixelChecks: [
      { name: "selected-cube", region: { x: 495, y: 125, width: 200, height: 210 }, matcher: "green", minimumPixels: 5_000 },
    ],
  },
  {
    id: "10-particles",
    region: { x: 330, y: 250, width: 300, height: 180 },
    assertion: (average: Average) => average.r > 20 && average.g > 20 && average.b > 25,
    pixelChecks: [{ name: "particle-cloud", region: { x: 300, y: 220, width: 360, height: 240 }, matcher: "pink", minimumPixels: 500 }],
  },
  {
    id: "11-showcase-world",
    region: { x: 180, y: 160, width: 560, height: 300 },
    assertion: (average: Average) => average.r > 60 && average.g > 45 && average.b > 25,
    pixelChecks: [
      { name: "showcase-pbr-sphere", region: { x: 230, y: 165, width: 250, height: 250 }, matcher: "yellow", minimumPixels: 12_000 },
      { name: "showcase-normal-pbr-cube", region: { x: 625, y: 300, width: 150, height: 115 }, matcher: "blue", minimumPixels: 80 },
      { name: "showcase-gltf-texture", region: { x: 585, y: 180, width: 135, height: 105 }, matcher: "purple", minimumPixels: 600 },
    ],
  },
] as const;

test.describe("example visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const target of visualTargets) {
    test(`${target.id} has expected visible pixels`, async ({ page }) => {
      await openReadyExample(page, server, target.id);
      await expectCanvasFrame(page, target.region);
      const nonBlank = await canvasIsNonBlank(page);
      const average = await averageCanvasRegion(page, target.region);

      expect(nonBlank).toBe(true);
      expect(target.assertion(average), `${target.id} average ${JSON.stringify(average)}`).toBe(true);
      for (const pixelCheck of target.pixelChecks) {
        const matchingPixels = await countMatchingPixels(page, pixelCheck.region, pixelCheck.matcher);
        expect(
          matchingPixels,
          `${target.id} ${pixelCheck.name} expected at least ${pixelCheck.minimumPixels} ${pixelCheck.matcher} pixels`,
        ).toBeGreaterThanOrEqual(pixelCheck.minimumPixels);
      }
    });
  }

  test("renderer diagnostics are exposed for render-backed examples", async ({ page }) => {
    await openReadyExample(page, server, "00-basic-triangle");
    const diagnostics = await page.evaluate(() => window.__AURA3D_EXAMPLE__?.diagnostics);
    expect(diagnostics?.drawCalls).toBe(1);
    expect(diagnostics?.lastError).toBeNull();
  });
});

async function expectCanvasFrame(page: Page, region: Region): Promise<void> {
  const frame = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    return {
      width: canvas.width,
      height: canvas.height,
      cssWidth: rect.width,
      cssHeight: rect.height
    };
  });

  expect(frame?.width).toBeGreaterThan(0);
  expect(frame?.height).toBeGreaterThan(0);
  expect(frame?.cssWidth).toBeGreaterThan(0);
  expect(frame?.cssHeight).toBeGreaterThan(0);
  expect(region.x).toBeGreaterThanOrEqual(0);
  expect(region.y).toBeGreaterThanOrEqual(0);
  expect(region.x + region.width).toBeLessThanOrEqual(frame?.width ?? 0);
  expect(region.y + region.height).toBeLessThanOrEqual(frame?.height ?? 0);
}

async function openReadyExample(page: Page, server: ExampleDevServer, id: string): Promise<void> {
  await page.goto(`${server.origin}/examples/${id}/index.html`, { waitUntil: "commit" });
  const state = await waitForExampleState(page, 30_000);
  if (state?.status !== "ready") {
    throw new Error(`${id} did not reach ready: ${state?.error ?? "missing error detail"}`);
  }
  await page.waitForTimeout(id === "10-particles" || id === "11-showcase-world" ? 500 : 150);
}

async function waitForExampleState(page: Page, timeoutMs: number): Promise<Window["__AURA3D_EXAMPLE__"]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.__AURA3D_EXAMPLE__);
    if (state?.status === "ready" || state?.status === "error") {
      return state;
    }
    await page.waitForTimeout(100);
  }

  const detail = await page.evaluate(() => ({
    bodyText: document.body.textContent?.slice(0, 240) ?? "",
    scripts: Array.from(document.scripts, (script) => script.src || script.textContent?.slice(0, 80) || "")
  }));
  throw new Error(`Example did not publish readiness within ${timeoutMs}ms: ${JSON.stringify(detail)}`);
}

async function canvasIsNonBlank(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
    if (!canvas) return false;
    const readWebGLPixels = (region: { x: number; y: number; width: number; height: number }): Uint8Array | null => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
      const pixels = new Uint8Array(region.width * region.height * 4);
      const y = canvas.height - region.y - region.height;
      gl.readPixels(region.x, y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const context2d = canvas.getContext("2d");
    const data = context2d
      ? context2d.getImageData(0, 0, canvas.width, canvas.height).data
      : readWebGLPixels({ x: 0, y: 0, width: canvas.width, height: canvas.height });
    if (!data) return false;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 8 || data[index + 1] > 8 || data[index + 2] > 8 || data[index + 3] > 8) {
        return true;
      }
    }
    return false;
  });
}

async function averageCanvasRegion(page: Page, region: Region): Promise<Average> {
  return page.evaluate((input) => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
    if (!canvas) throw new Error("Example canvas is unavailable.");
    const readWebGLPixels = (region: { x: number; y: number; width: number; height: number }): Uint8Array | null => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
      const pixels = new Uint8Array(region.width * region.height * 4);
      const y = canvas.height - region.y - region.height;
      gl.readPixels(region.x, y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };

    const context2d = canvas.getContext("2d");
    const pixels = context2d
      ? context2d.getImageData(input.x, input.y, input.width, input.height).data
      : readWebGLPixels(input);
    if (!pixels) throw new Error("Example canvas pixels are unavailable.");
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const count = pixels.length / 4;
    for (let index = 0; index < pixels.length; index += 4) {
      r += pixels[index];
      g += pixels[index + 1];
      b += pixels[index + 2];
      a += pixels[index + 3];
    }
    return { r: r / count, g: g / count, b: b / count, a: a / count };
  }, region);
}

async function countMatchingPixels(page: Page, region: Region, matcher: PixelMatcher): Promise<number> {
  return page.evaluate(
    ({ input, pixelMatcher }) => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
      if (!canvas) throw new Error("Example canvas is unavailable.");
      const readWebGLPixels = (region: { x: number; y: number; width: number; height: number }): Uint8Array | null => {
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!gl) return null;
        const pixels = new Uint8Array(region.width * region.height * 4);
        const y = canvas.height - region.y - region.height;
        gl.readPixels(region.x, y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return pixels;
      };

      const context2d = canvas.getContext("2d");
      const pixels = context2d
        ? context2d.getImageData(input.x, input.y, input.width, input.height).data
        : readWebGLPixels(input);
      if (!pixels) throw new Error("Example canvas pixels are unavailable.");
      let matching = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];

        if (
          (pixelMatcher === "blue" && b > 130 && g > 80 && r < 170) ||
          (pixelMatcher === "bright" && r > 140 && g > 140 && b > 100) ||
          (pixelMatcher === "green" && g > 120 && r < 180 && b < 210) ||
          (pixelMatcher === "orange" && r > 180 && g > 45 && g < 150 && b < 90) ||
          (pixelMatcher === "pink" && r > 150 && b > 80 && g < 180) ||
          (pixelMatcher === "purple" && r > 120 && b > 170 && g < 180) ||
          (pixelMatcher === "yellow" && r > 170 && g > 140 && b < 140)
        ) {
          matching += 1;
        }
      }

      return matching;
    },
    { input: region, pixelMatcher: matcher },
  );
}
