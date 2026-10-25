import { test } from "@playwright/test";
import { runShots, startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

test("shotsa aura-hoops-3d", async ({ page }) => {
  await runShots(page, server, {
    slug: "aura-hoops-3d",
    route: "/apps/showcase-aura-hoops-3d/index.html",
    titleQuery: "?menu=1",
    playQuery: "?autostart=1&autoplay=1",
    endPattern: /=(gameover|ended|results|final|finished|complete)\b/i
  });
});
