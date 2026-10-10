/**
 * prd04-scene-capture.spec.ts — PRD-04 §13 phase-1 flag-`none` baseline
 * captures. Iterates every registered prd04-* scene on both engines through
 * the lane harness page, screenshots each and writes
 * tests/reports/prd04/captures/<flags>/<scene>/<engine>.png plus a report.
 * The same spec is the `capture` job of qr-prd04-materials.yml.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { prd04SceneSpecs } from "../../../../benchmarks/quality-rebuild/scenes/prd04/index";

const FLAGS = process.env.PRD04_FLAGS ?? "none";
const SCENES = (process.env.PRD04_SCENES ?? Object.keys(prd04SceneSpecs).join(","))
  .split(",")
  .filter(Boolean);
const ENGINES = (process.env.PRD04_ENGINES ?? "aura3d,three").split(",").filter(Boolean) as ("aura3d" | "three")[];

const outDir = resolve("tests/reports/prd04/captures", FLAGS);

test.describe(`prd04 lane captures (flags=${FLAGS})`, () => {
  let server: ExampleDevServer;
  const results: { scene: string; engine: string; status: string; loadMs?: number; error?: string }[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(outDir, { recursive: true });
  });

  test.afterAll(async () => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      resolve(outDir, "report.json"),
      `${JSON.stringify({ flags: FLAGS, scenes: results }, null, 2)}\n`
    );
    await server.close();
  });

  for (const sceneId of SCENES) {
    for (const engine of ENGINES) {
      test(`${sceneId} on ${engine}`, async ({ page }) => {
        const url = `${server.origin}/tests/qr/prd04/harness/prd04-capture.html?engine=${engine}&scene=${sceneId}&flags=${FLAGS}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        // P-20: no mask — a wedge must fail the test and the page's
        // __QR_STAGE__ names where it died.
        const ready = await page.waitForFunction(
          () =>
            (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
          undefined,
          { timeout: 120_000 }
        ).then(() => true, () => false);
        if (!ready) {
          const stage = await page
            .evaluate(() => (window as any).__QR_STAGE__ ?? "pre-adapter")
            .catch(() => "unreadable");
          results.push({ scene: sceneId, engine, status: "timeout" });
          throw new Error(`${sceneId}/${engine} timed out at stage "${stage}" (no ready/error in 120s)`);
        }
        const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
        const payload = await page.evaluate(() => (window as any).__QR_READY__ ?? null);
        const png = resolve(outDir, sceneId);
        mkdirSync(png, { recursive: true });
        await page.screenshot({ path: resolve(png, `${engine}.png`) });
        results.push({
          scene: sceneId,
          engine,
          status: error ? "error" : "ready",
          loadMs: payload?.loadMs,
          error: error ?? payload?.errors?.join("; ") ?? undefined
        });
        expect(error, `${sceneId}/${engine} harness error`).toBeNull();
        expect(payload, "payload present").not.toBeNull();
      });
    }
  }
});
