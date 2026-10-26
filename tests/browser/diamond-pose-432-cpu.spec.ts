import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { runPose } from "./diamond-pose-lib";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });
test("diamond batter pose frames (cpu)", async ({ page }) => {
  await runPose(page, server.origin, "cpu");
});
