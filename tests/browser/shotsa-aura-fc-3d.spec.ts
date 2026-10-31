import { test } from "@playwright/test";
import { runShots, startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

test("shotsa aura-fc-3d", async ({ page }) => {
  await runShots(page, server, {
    slug: "aura-fc-3d",
    route: "/apps/showcase-aura-fc-3d/index.html",
    titleQuery: "",
    playQuery: "?demo=1",
    // wait for the turf texture (software WebGL2 uploads it 25-60 s after ready; the card used to show the mint tint)
    readyGlobals: ["__AURA_FC_SETTLED__"],
    endPattern: /=(gameover|ended|results|final|finished|complete)\b/i
  });
});
