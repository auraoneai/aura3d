import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectAISceneRouteReady } from "./ai-scene-route-helper";

test.describe("Aura shot director", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders camera and shot planning diagnostics", async ({ page }) => {
    const runtime = await expectAISceneRouteReady(page, `${server.origin}/apps/aura-shot-director/`, "Aura Shot Director");
    expect(runtime.mode).toBe("shot");
    expect(runtime.diagnostics?.warnings?.length ?? 0).toBeGreaterThan(0);
  });
});
