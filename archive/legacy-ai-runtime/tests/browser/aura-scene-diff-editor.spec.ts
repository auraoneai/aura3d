import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectAISceneRouteReady } from "./ai-scene-route-helper";

test.describe("Aura scene diff editor", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a before-after scene patch view", async ({ page }) => {
    const runtime = await expectAISceneRouteReady(page, `${server.origin}/apps/aura-scene-diff-editor/`, "Aura Scene Diff Editor");
    expect(runtime.mode).toBe("diff");
    expect(runtime.ir?.provenance?.patchCount).toBe(1);
    expect(runtime.patchHistory?.[0]?.operations?.length ?? 0).toBeGreaterThan(0);
  });
});
