import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const PROJECT = resolve("benchmark/current-head-to-head/instancing-lod");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/instancing-lod");

test.describe("current head-to-head instancing and LOD", () => {
  let server: ViteDevServer;
  let origin: string;
  test.beforeAll(async () => {
    server = await createServer({ root: PROJECT, logLevel: "error" });
    await server.listen(0);
    origin = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0] ?? "";
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });
  test.afterAll(async () => { await server?.close(); });

  test("submits 2500 native instances and crosses the paired LOD threshold", async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD_ERROR__), undefined, { timeout: 180_000 }).catch(async (error) => {
      const partial = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__);
      throw new Error(`Instancing/LOD workload did not become ready: ${JSON.stringify(partial)}; pageErrors=${errors.join(" | ")}`, { cause: error });
    });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD_ERROR__);
    expect(failure ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__);
    expect(before).toMatchObject({
      ready: true,
      workload: "instancing-lod",
      asset: { id: "showcaseHeadphones", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833" },
      viewport: { width: 1440, height: 900, dpr: 1 },
      contract: { count: 2500, camera: { near: { position: [8, 6, 12], target: [0, 1, 0] }, fov: 45 }, lodThreshold: 20 },
      aura: { publicPackageOnly: true, backend: "webgl2", instanceCount: 2500, lodLevel: 0 },
      three: { revision: "185", actualRenderer: true, actualInstancedMesh: true, actualLod: true, actualStatsJs: true, actualGLTFLoader: true, instanceCount: 2500, lodLevel: 0 }
    });
    expect(before.aura.nativeInstancedSubmissions).toBeGreaterThan(0);
    expect(before.aura.assetState).toMatchObject({ id: "showcaseHeadphones", status: "ready", provenance: { source: "typed-aura-assets-manifest" } });
    expect(before.three.assetNodeCount).toBeGreaterThan(5);
    expect(before.aura.drawCalls).toBeLessThan(100);
    expect(before.three.drawCalls).toBeLessThan(100);
    expect(before.three.triangles).toBeGreaterThan(25_000);
    expect(maxChannelDelta(before.aura.backgroundPixel, before.three.backgroundPixel), `Aura ${JSON.stringify(before.aura.backgroundPixel)} vs Three ${JSON.stringify(before.three.backgroundPixel)}`).toBeLessThanOrEqual(3);
    expect(before.aura.cameraDistance).toBeLessThan(20);
    expect(before.three.cameraDistance).toBeLessThan(20);
    await expect(page.locator("#stats-js-panel")).toBeAttached();
    await capturePair(page, "near");

    await page.locator("#move-far").click();
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__?.aura?.lodLevel === 1 && window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__?.three?.lodLevel === 1);
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__);
    expect(after.interaction).toEqual({ applied: true, action: "cross-lod-threshold", from: "near-sphere", to: "far-box" });
    expect(after.aura.cameraDistance).toBeGreaterThan(20);
    expect(after.three.cameraDistance).toBeGreaterThan(20);
    expect(after.aura.pixelHash).not.toBe(before.aura.pixelHash);
    expect(after.three.pixelHash).not.toBe(before.three.pixelHash);
    expect(after.aura.drawCalls).toBeLessThan(100);
    expect(after.three.drawCalls).toBeLessThan(100);
    const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex");
    expect(assetHash).toBe(before.asset.sha256);

    await capturePair(page, "far");
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: assetHash, before, after }, null, 2)}\n`);
  });
});

async function capturePair(page: Page, suffix: "near" | "far"): Promise<void> {
  const captures = await page.evaluate(() => {
    const aura = document.querySelector<HTMLCanvasElement>("#aura");
    const three = document.querySelector<HTMLCanvasElement>("#three");
    if (!aura || !three) throw new Error("Both native renderer canvases are required for capture.");
    return { aura: aura.toDataURL("image/png"), three: three.toDataURL("image/png") };
  });
  for (const [engine, dataUrl] of Object.entries(captures)) {
    writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
}

function maxChannelDelta(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.slice(0, 3).map((value, index) => Math.abs(value - (b[index] ?? 0))));
}
