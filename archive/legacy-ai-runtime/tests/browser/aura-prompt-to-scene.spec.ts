import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectAISceneRouteReady } from "./ai-scene-route-helper";

test.describe("Aura prompt to scene route", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("generates, patches, screenshots, and exports a no-key scene", async ({ page }) => {
    const runtime = await expectAISceneRouteReady(page, `${server.origin}/apps/aura-prompt-to-scene/`, "Aura Prompt To Scene");
    expect(runtime.diagnostics?.placeholders?.length ?? 0).toBeGreaterThan(0);

    await page.fill("#edit-input", "Make the robot smaller, add more fog, and move the camera lower.");
    await page.click("#patch-button");
    await page.waitForFunction(() => (window.__AURA3D_AI_SCENE_PROMPT_LAB__?.patchHistory?.length ?? 0) >= 1);
    await page.click("#screenshot-button");
    await page.waitForFunction(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__?.screenshotCaptured === true);
    await page.click("#export-button");
    await page.waitForFunction(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__?.exportReady === true);
  });
});
