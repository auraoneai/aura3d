import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Matcher = "green" | "yellow" | "red" | "bright";

declare global {
  interface Window {
    __GALILEO3D_GLTF_CORPUS_GALLERY__?: {
      readonly status: "ready" | "error";
      readonly assetCount: number;
      readonly pass: number;
      readonly warn: number;
      readonly expectedFail: number;
      readonly sourceRevision: string;
      readonly renderedCards: number;
      readonly error?: string;
    };
  }
}

test.describe("glTF corpus gallery visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders classified corpus cards with status color evidence", async ({ page }) => {
    await page.goto(`${server.origin}/examples/gltf-corpus-gallery/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_GLTF_CORPUS_GALLERY__?.status === "ready" || window.__GALILEO3D_GLTF_CORPUS_GALLERY__?.status === "error",
      undefined,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(150);

    const state = await page.evaluate(() => window.__GALILEO3D_GLTF_CORPUS_GALLERY__);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.assetCount).toBe(17);
    expect(state?.pass).toBe(13);
    expect(state?.warn).toBe(4);
    expect(state?.expectedFail).toBe(0);
    expect(state?.renderedCards).toBe(17);
    expect(state?.sourceRevision).toMatch(/^[a-f0-9]{40}$/);

    await expectCanvasFrame(page);
    await expect(countMatchingPixels(page, { x: 0, y: 0, width: 960, height: 540 }, "bright")).resolves.toBeGreaterThan(1_000);
    await expect(countMatchingPixels(page, { x: 20, y: 100, width: 920, height: 420 }, "green")).resolves.toBeGreaterThan(6_000);
    await expect(countMatchingPixels(page, { x: 20, y: 100, width: 920, height: 420 }, "yellow")).resolves.toBeGreaterThan(900);
    await expect(countMatchingPixels(page, { x: 20, y: 100, width: 920, height: 420 }, "red")).resolves.toBeLessThan(300);
  });
});

async function expectCanvasFrame(page: Page): Promise<void> {
  const frame = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height };
  });

  expect(frame?.width).toBe(960);
  expect(frame?.height).toBe(540);
  expect(frame?.cssWidth).toBeGreaterThan(0);
  expect(frame?.cssHeight).toBeGreaterThan(0);
}

async function countMatchingPixels(page: Page, region: Region, matcher: Matcher): Promise<number> {
  return page.evaluate(
    ({ input, pixelMatcher }) => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
      if (!canvas) throw new Error("glTF corpus gallery canvas is unavailable.");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("glTF corpus gallery 2D context is unavailable.");
      const pixels = context.getImageData(input.x, input.y, input.width, input.height).data;
      let matching = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];

        if (
          (pixelMatcher === "green" && g > 150 && r < 130 && b < 170) ||
          (pixelMatcher === "yellow" && r > 180 && g > 155 && b < 110) ||
          (pixelMatcher === "red" && r > 190 && g < 150 && b < 130) ||
          (pixelMatcher === "bright" && r > 200 && g > 210 && b > 220)
        ) {
          matching += 1;
        }
      }

      return matching;
    },
    { input: region, pixelMatcher: matcher },
  );
}
