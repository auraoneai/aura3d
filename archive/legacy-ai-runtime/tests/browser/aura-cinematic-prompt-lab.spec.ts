import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectAISceneRouteReady } from "./ai-scene-route-helper";

test.describe("Aura cinematic prompt lab", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders generated cinematic direction from a mock provider", async ({ page }) => {
    const runtime = await expectAISceneRouteReady(page, `${server.origin}/apps/aura-cinematic-prompt-lab/`, "Aura Cinematic Prompt Lab");
    expect(runtime.mode).toBe("cinematic");
    expect(runtime.ir?.sceneId).toContain("mock-scene");
  });
});
