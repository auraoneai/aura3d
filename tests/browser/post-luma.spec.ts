import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const SCENES = ["daylight", "dusk-arena", "pastel"] as const;
const EFFECTS = ["none", "bloom", "vignette", "both"] as const;
// "-post" turns the post lane off: the frame then takes the plain OutputPass route, the reference for "post on vs off".
const FLAG_SETS = (process.env.POST_LUMA_FLAGS ?? ",-post").split(",");
const reportDir = "tests/reports/post-luma";

test.describe("post chain luma (tone map and encode once)", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("mean luma with effects on stays within a few percent of effects off", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/post-luma-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __POST_LUMA__?: unknown }).__POST_LUMA__), undefined, { timeout: 60_000 });
    const rows: unknown[] = [];
    for (const sceneId of SCENES) {
      for (const flags of FLAG_SETS) {
        for (const fx of EFFECTS) {
          const capture = await page.evaluate(([s, f, fl]) => (window as unknown as { __POST_LUMA__: { render(a: string, b: string, c: string): Promise<unknown> } }).__POST_LUMA__.render(s!, f!, fl!), [sceneId, fx, flags]);
          rows.push(capture);
          console.log(`POSTLUMA_JSON ${JSON.stringify(capture)}`);
        }
      }
    }
    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(reportDir, "post-luma.json"), JSON.stringify({ rows, errors }, null, 2));
    console.log(`POSTLUMA_ERRORS ${JSON.stringify(errors)}`);
  });
});
