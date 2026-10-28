import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Q1 / Q2 on the real bench scene: the skinned character, mounted against the workspace engine.
 * three.js reference: evidence/vs-threejs/results.json skinned-character `meanLuma.three[0]` = 143.96 at frame 25
 * (software WebGL2, 640x360). Aura3D must land within 10% of it and print nothing on the console (Q2).
 */
const THREE_MEAN_LUMA_F25 = 143.95643352887492;
const FRAME_BEFORE_CAPTURE = 24;

test.describe("skinned character exposure (Q1) and console (Q2)", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("mean luma within 10% of three.js and no console output", async ({ page }) => {
    const problems: string[] = [];
    // "GPU stall due to ReadPixels" is Chromium's driver note about the bench glue's own readPixels sync, not app output.
    page.on("console", (m) => { if ((m.type() === "warning" || m.type() === "error") && !/GPU stall due to ReadPixels/.test(m.text())) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
    const glb = readFileSync(new URL("../../fixtures/threejs-parity/assets/character/soldier.glb", import.meta.url));
    await page.route("**/model.glb", (route) => route.fulfill({ status: 200, contentType: "model/gltf-binary", body: glb }));
    await page.goto(`${server.origin}/tests/browser/exposure-skinned-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __BENCH__?: { ready?: boolean } }).__BENCH__?.ready), undefined, { timeout: 240_000 });
    const result = await page.evaluate((n) => {
      const api = (window as unknown as { __BENCH__: { frame(dt: number): void; capture(dt: number): { mean: number; std: number; jpeg: string }; errors: string[] } }).__BENCH__;
      for (let i = 0; i < n; i += 1) api.frame(1 / 60);
      const c = api.capture(1 / 60);
      return { mean: c.mean, std: c.std, jpeg: c.jpeg, errors: api.errors };
    }, FRAME_BEFORE_CAPTURE);
    console.log(`EXPOSURE_SKINNED ${JSON.stringify({ mean: result.mean, std: result.std, three: THREE_MEAN_LUMA_F25, ratio: result.mean / THREE_MEAN_LUMA_F25, problems, errors: result.errors })}`);
    console.log(`EXPOSURE_SCENE_FRAME skinned-character ${result.jpeg.replace(/^data:image\/jpeg;base64,/, "")}`);
    expect([...problems, ...result.errors], "Q2 console warnings/errors").toEqual([]);
    expect(Math.abs(result.mean / THREE_MEAN_LUMA_F25 - 1), `Q1 mean luma ${result.mean.toFixed(1)} vs three ${THREE_MEAN_LUMA_F25.toFixed(1)}`).toBeLessThanOrEqual(0.1);
  });
});
