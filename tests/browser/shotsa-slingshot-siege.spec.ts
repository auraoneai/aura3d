import { test } from "@playwright/test";
import { runShots, startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

test("shotsa slingshot-siege", async ({ page }) => {
  await runShots(page, server, {
    slug: "slingshot-siege",
    route: "/apps/showcase-slingshot-siege/index.html",
    titleQuery: "",
    playQuery: "?autoplay=1",
    endPattern: /=(gameover|ended|results|final|finished|complete)\b/i
  });
});
