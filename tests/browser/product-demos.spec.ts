import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { validateProductDemoSources } from "../../tools/demo-validation/product-demo-source-validation";

type DemoDefinition = {
  id: string;
  stateName: "__GALILEO3D_PRODUCT_DEMO__" | "__GALILEO3D_ARCHITECTURE_DEMO__" | "__GALILEO3D_GAME_DEMO__";
  canvasSelector: string;
};

const productDemos: readonly DemoDefinition[] = [
  {
    id: "product-configurator",
    stateName: "__GALILEO3D_PRODUCT_DEMO__",
    canvasSelector: "[data-testid='product-configurator-canvas']",
  },
  {
    id: "architecture-viewer",
    stateName: "__GALILEO3D_ARCHITECTURE_DEMO__",
    canvasSelector: "[data-testid='architecture-viewer-canvas']",
  },
  {
    id: "game-slice",
    stateName: "__GALILEO3D_GAME_DEMO__",
    canvasSelector: "[data-testid='game-slice-canvas']",
  },
] as const;

test.describe("v2 product demos", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    const sourceValidation = validateProductDemoSources();
    expect(sourceValidation.violations).toEqual([]);
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const demo of productDemos) {
    test(`${demo.id} product demo reaches ready in Chromium`, async ({ page }) => {
      const errors = await collectPageErrors(page, async () => {
        await openProductDemo(page, server, demo);
      });
      const state = await readDemoState(page, demo.stateName);
      const canvasCount = await page.locator(demo.canvasSelector).count();
      const nonBlank = await canvasHasNonBlankWebGLPixels(page, demo.canvasSelector);

      expect(errors).toEqual([]);
      expect(canvasCount).toBe(1);
      expect(state.status).toBe("ready");
      expect(state.renderer).toBe("webgl2");
      expect(state.metrics.rendererBacked).toBe(true);
      expect(state.metrics.drawCalls).toBe(state.diagnostics?.drawCalls);
      expect(Number(state.diagnostics?.drawCalls ?? 0)).toBeGreaterThan(0);
      expect(state.diagnostics?.contextLost).toBe(false);
      expect(state.diagnostics?.lastError).toBeNull();
      expect(nonBlank).toBe(true);
    });
  }

  test("product configurator cycles material variants on pointer input", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);
    const before = await readDemoState(page, "__GALILEO3D_PRODUCT_DEMO__");

    await page.locator(productDemos[0].canvasSelector).click({ position: { x: 320, y: 280 } });
    await page.waitForFunction(() => window.__GALILEO3D_PRODUCT_DEMO__?.interactions === 1);
    const after = await readDemoState(page, "__GALILEO3D_PRODUCT_DEMO__");

    expect(before.activeVariant).toBe("graphite");
    expect(after.activeVariant).toBe("copper");
    expect(after.interactions).toBe(1);
    expect(after.metrics.materialVariants).toBe(3);
    expect(after.metrics.renderItems).toBeGreaterThanOrEqual(4);
  });

  test("product configurator swatch buttons select material variants", async ({ page }) => {
    await openProductDemo(page, server, productDemos[0]);

    await page.getByRole("button", { name: "ceramic" }).click();
    await page.waitForFunction(() => window.__GALILEO3D_PRODUCT_DEMO__?.activeVariant === "ceramic");
    const state = await readDemoState(page, "__GALILEO3D_PRODUCT_DEMO__");

    expect(state.activeVariant).toBe("ceramic");
    expect(state.interactions).toBe(1);
    await expect(page.getByRole("button", { name: "ceramic" })).toHaveAttribute("aria-pressed", "true");
  });

  test("architecture viewer updates selected zone and measurement on pointer input", async ({ page }) => {
    await openProductDemo(page, server, productDemos[1]);

    await page.locator(productDemos[1].canvasSelector).click({ position: { x: 220, y: 240 } });
    await page.waitForFunction(() => window.__GALILEO3D_ARCHITECTURE_DEMO__?.selectedZone === "gallery");
    const state = await readDemoState(page, "__GALILEO3D_ARCHITECTURE_DEMO__");

    expect(state.selectedZone).toBe("gallery");
    expect(state.interactions).toBe(1);
    expect(state.measurements.areaSqm).toBe(310);
    expect(state.measurements.spanMeters).toBeGreaterThan(17);
    expect(state.metrics.zones).toBe(3);
    expect(state.metrics.selectedAreaSqm).toBe(310);
  });

  test("game slice responds to pointer input while stepping runtime systems", async ({ page }) => {
    await openProductDemo(page, server, productDemos[2]);

    await page.locator(productDemos[2].canvasSelector).click({ position: { x: 220, y: 260 } });
    await page.waitForFunction(() => (window.__GALILEO3D_GAME_DEMO__?.interactions ?? 0) >= 1);
    const state = await readDemoState(page, "__GALILEO3D_GAME_DEMO__");

    expect(state.interactions).toBeGreaterThanOrEqual(1);
    expect(Number(state.metrics.physicsBodies)).toBeGreaterThanOrEqual(2);
    expect(Number(state.metrics.liveParticles)).toBeGreaterThan(0);
    expect(state.metrics.inputSnapshot).toBe(true);
    expect(state.metrics.audioState).toBe("locked");
  });

  test("game slice responds to keyboard input through the input system", async ({ page }) => {
    await openProductDemo(page, server, productDemos[2]);

    await page.locator(productDemos[2].canvasSelector).focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(() => (window.__GALILEO3D_GAME_DEMO__?.interactions ?? 0) >= 1);
    const state = await readDemoState(page, "__GALILEO3D_GAME_DEMO__");

    expect(state.interactions).toBeGreaterThanOrEqual(1);
    expect(state.metrics.inputSnapshot).toBe(true);
    expect(Number(state.metrics.physicsBodies)).toBeGreaterThanOrEqual(2);
  });
});

async function collectPageErrors(page: Page, run: () => Promise<void>): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await run();
  return errors;
}

async function openProductDemo(page: Page, server: ExampleDevServer, demo: DemoDefinition): Promise<void> {
  await page.goto(`${server.origin}/examples/${demo.id}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (stateName) => {
      const state = (globalThis as Record<string, any>)[stateName];
      return state?.status === "ready" || state?.status === "error";
    },
    demo.stateName,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(250);
}

async function readDemoState(page: Page, stateName: DemoDefinition["stateName"]): Promise<Record<string, any>> {
  return page.evaluate((name) => {
    const state = (globalThis as Record<string, any>)[name];
    if (!state) {
      throw new Error(`Missing product demo state ${name}.`);
    }
    if (state.status !== "ready") {
      throw new Error(`Product demo ${name} did not reach ready: ${state.error ?? "missing error detail"}`);
    }
    return state;
  }, stateName);
}

async function canvasHasNonBlankWebGLPixels(page: Page, canvasSelector: string): Promise<boolean> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas) {
      return false;
    }

    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      return false;
    }

    const width = Math.min(96, canvas.width);
    const height = Math.min(96, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8 || pixels[index + 3] > 8) {
        return true;
      }
    }
    return false;
  }, canvasSelector);
}
