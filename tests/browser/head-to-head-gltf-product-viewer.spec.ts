import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/gltf-product-viewer");

test.describe("current head-to-head glTF product viewer", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_DIRECTORY, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  test("loads the exact headphone GLB through both realistic public stacks and orbits both", async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/benchmark/current-head-to-head/gltf-product-viewer/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT__ || window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_ERROR__), undefined, { timeout: 120_000 });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_ERROR__);
    expect(failure ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT__);
    expect(before).toMatchObject({ ready: true, workload: "gltf-product-viewer", asset: { id: "showcaseHeadphones", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833" }, viewport: { width: 1440, height: 900, dpr: 1 }, aura: { publicPackageOnly: true }, three: { revision: "185", actualRenderer: true, actualGLTFLoader: true, addons: { draco: true, ktx2: true, meshopt: true, orbit: true } } });
    expect(before.aura.drawCalls).toBeGreaterThan(0); expect(before.three.drawCalls).toBeGreaterThan(0); expect(before.three.triangles).toBeGreaterThan(0);
    expect(before.aura.metadata.unsupportedExtensions).toEqual([]);
    const actualHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex");
    expect(actualHash).toBe(before.asset.sha256);
    await page.locator("#orbit").click();
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT__?.interaction?.applied === true);
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT__);
    expect(after.interaction).toEqual({ applied: true, auraChanged: true, threeChanged: true });
    const captures = await page.evaluate(() => ({ aura: (document.getElementById("aura") as HTMLCanvasElement).toDataURL("image/png"), three: (document.getElementById("three") as HTMLCanvasElement).toDataURL("image/png") }));
    for (const [engine, dataUrl] of Object.entries(captures)) writeFileSync(resolve(REPORT_DIRECTORY, `${engine}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: actualHash, before, after }, null, 2)}\n`);
  });
});
