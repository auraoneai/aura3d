import { test } from "@playwright/test";
import { runShots, startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

test("pola rz", async ({ page }) => {
  await runShots(page, server, {
    slug: "red-zone-3d",
    route: "/apps/showcase-red-zone-3d/index.html",
    titleQuery: "",
    playQuery: "?autoplay=1",
    onlyViewports: ["1280x720"],
    skipCards: true,
    playBudgetMs: 150_000,
    endPattern: /=(gameover|ended|results|final|finished|complete)\b/i
  });
});
