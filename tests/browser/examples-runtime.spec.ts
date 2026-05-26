import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const examples = [
  "00-basic-triangle",
  "01-basic-scene",
  "02-materials-pbr",
  "03-shadows",
  "04-physics-stack",
  "05-animation-character",
  "06-asset-gltf",
  "07-input-controls",
  "08-audio-spatial",
  "09-editor-runtime",
  "10-particles",
] as const;

const flagshipExamples = [
  "11-showcase-world",
] as const;

test.describe("roadmap examples runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const id of examples) {
    test(`${id} reaches ready in Chromium`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });

      await openExample(page, server, id);
      const state = await readExampleState(page);

      expect(errors).toEqual([]);
      expect(state.id).toBe(id);
      expect(state.status).toBe("ready");
      expect(state.acceptance.length).toBeGreaterThan(12);
      expect(await page.locator("[data-testid='example-canvas']").count()).toBe(1);

      const nonBlank = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='example-canvas']");
        if (!canvas) return false;
        const context = canvas.getContext("2d");
        if (context) {
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let index = 0; index < data.length; index += 4) {
            if (data[index] > 5 || data[index + 1] > 5 || data[index + 2] > 5 || data[index + 3] > 5) {
              return true;
            }
          }
          return false;
        }
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!gl) return false;
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const data = pixels;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] > 5 || data[index + 1] > 5 || data[index + 2] > 5 || data[index + 3] > 5) {
            return true;
          }
        }
        return false;
      });
      expect(nonBlank).toBe(true);
    });
  }

  for (const id of flagshipExamples) {
    test(`${id} reaches ready in Chromium`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });

      await openExample(page, server, id);
      const state = await readExampleState(page);

      expect(errors).toEqual([]);
      expect(state.id).toBe(id);
      expect(state.status).toBe("ready");
      expect(state.metrics?.renderItems).toBe(7);
      expect(Number(state.metrics?.physicsBodies)).toBeGreaterThanOrEqual(7);
      expect(Number(state.metrics?.gltfMeshes)).toBe(1);
      expect(Number(state.metrics?.liveParticles)).toBeGreaterThan(0);
      expect(state.metrics?.selected).toBe("hero,gltf-asset");
      expect(state.metrics?.orbitControl).toBe(true);
      expect(state.metrics?.firstPersonControl).toBe(true);
      expect(state.metrics?.webgl2).toBe(true);
      expect(await page.locator("[data-testid='example-canvas']").count()).toBe(1);
    });
  }

  test("input and editor examples expose first-person, orbit, and editor selection metrics", async ({ page }) => {
    await openExample(page, server, "07-input-controls");
    const inputState = await readExampleState(page);
    expect(inputState.metrics?.orbitControl).toBe(true);
    expect(inputState.metrics?.firstPersonControl).toBe(true);
    expect(Number(inputState.metrics?.firstPersonZ)).toBeGreaterThan(0);

    await openExample(page, server, "09-editor-runtime");
    const editorState = await readExampleState(page);
    expect(editorState.metrics?.selected).toBe("cube");
    expect(editorState.metrics?.canUndo).toBe(true);
  });
});

async function openExample(page: Page, server: ExampleDevServer, id: string): Promise<void> {
  await page.goto(`${server.origin}/examples/${id}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__AURA3D_EXAMPLE__?.status === "ready" || window.__AURA3D_EXAMPLE__?.status === "error", undefined, { timeout: 30_000 });
  await page.waitForTimeout(100);
}

async function readExampleState(page: Page): Promise<NonNullable<Window["__AURA3D_EXAMPLE__"]>> {
  return page.evaluate(() => {
    if (!window.__AURA3D_EXAMPLE__) {
      throw new Error("Example did not publish runtime state.");
    }
    return window.__AURA3D_EXAMPLE__;
  });
}
