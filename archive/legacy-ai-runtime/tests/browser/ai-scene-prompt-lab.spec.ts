import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("Aura prompt-to-scene north-star route", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("generates a mock-provider scene, applies a conversation patch, and exports evidence", async ({ page }) => {
    await page.goto(`${server.origin}/apps/aura-prompt-to-scene/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const runtime = window.__AURA3D_AI_SCENE_PROMPT_LAB__;
        return runtime?.status === "ready" && runtime.frameCount >= 2 && runtime.drawCalls > 0;
      },
      undefined,
      { timeout: 20_000 }
    );

    await expect(page.locator("h1")).toContainText("Aura Prompt To Scene");
    await expect(page.locator("#provider-label")).toContainText("MockProvider");
    await expect(page.locator("#ir-output")).toContainText("aura-scene-ir/0.1");
    await expect(page.locator("#diagnostics-output")).toContainText("canvas2d-previs");

    const initial = await page.evaluate(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__);
    expect(initial?.provider).toBe("MockProvider");
    expect(initial?.model).toBe("aura-scene-mock-0.1");
    expect(initial?.ir?.objects.length).toBeGreaterThanOrEqual(4);
    expect(initial?.diagnostics?.placeholders.length).toBeGreaterThan(0);
    expect(initial?.diagnostics?.warnings.length).toBeGreaterThan(0);

    const pixel = await page.locator("canvas#viewport").evaluate((canvas) => {
      const source = canvas as HTMLCanvasElement;
      const context = source.getContext("2d");
      return context?.getImageData(Math.floor(source.width * 0.5), Math.floor(source.height * 0.6), 1, 1).data ? Array.from(context.getImageData(Math.floor(source.width * 0.5), Math.floor(source.height * 0.6), 1, 1).data) : [];
    });
    expect(pixel[3]).toBe(255);
    expect((pixel[0] ?? 0) + (pixel[1] ?? 0) + (pixel[2] ?? 0)).toBeGreaterThan(20);

    await page.fill("#edit-input", "Make the robot smaller, add more fog, and move the camera lower.");
    await page.click("#patch-button");
    await page.waitForFunction(() => (window.__AURA3D_AI_SCENE_PROMPT_LAB__?.patchHistory.length ?? 0) >= 1);

    const patched = await page.evaluate(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__);
    expect(patched?.ir?.provenance.patchCount).toBe(1);
    expect(patched?.patchHistory[0]?.operations.map((operation) => operation.type)).toEqual([
      "set-object-scale",
      "set-fog-density",
      "set-camera-position"
    ]);
    expect(patched?.ir?.environment.fogDensity).toBe(0.48);
    expect(patched?.ir?.objects.find((object) => object.id === "robot_01")?.scale[0]).toBeCloseTo(0.68);

    await page.click("#screenshot-button");
    await page.waitForFunction(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__?.screenshotCaptured === true);
    await page.click("#export-button");
    await page.waitForFunction(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__?.exportReady === true);

    const exported = await page.evaluate(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__?.lastExport);
    expect(exported).toMatchObject({
      schema: "aura-prompt-to-scene-export/0.1"
    });
  });
});

declare global {
  interface Window {
    __AURA3D_AI_SCENE_PROMPT_LAB__?: {
      readonly status: "idle" | "generating" | "ready" | "patching" | "error";
      readonly provider: string;
      readonly model: string;
      readonly frameCount: number;
      readonly drawCalls: number;
      readonly screenshotCaptured: boolean;
      readonly exportReady: boolean;
      readonly lastExport?: unknown;
      readonly ir?: {
        readonly objects: readonly {
          readonly id: string;
          readonly scale: readonly number[];
        }[];
        readonly environment: { readonly fogDensity: number };
        readonly provenance: { readonly patchCount: number };
      } | null;
      readonly diagnostics?: {
        readonly placeholders: readonly string[];
        readonly warnings: readonly string[];
      } | null;
      readonly patchHistory: readonly {
        readonly operations: readonly { readonly type: string }[];
      }[];
    };
  }
}
