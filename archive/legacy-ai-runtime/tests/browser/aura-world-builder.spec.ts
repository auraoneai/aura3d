import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectAISceneRouteReady } from "./ai-scene-route-helper";

test.describe("Aura world builder", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a generated world graph from AI scene intent", async ({ page }) => {
    const runtime = await expectAISceneRouteReady(page, `${server.origin}/apps/aura-world-builder/`, "Aura World Builder");
    expect(runtime.mode).toBe("world");
    expect(runtime.ir?.objects?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
