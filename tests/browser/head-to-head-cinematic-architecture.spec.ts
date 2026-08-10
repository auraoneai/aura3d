import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./installed-package-resolve";

const PROJECT = resolve("benchmark/current-head-to-head/cinematic-architecture");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/cinematic-architecture");

test.describe("current head-to-head cinematic architecture", () => {
  let server: ViteDevServer; let origin: string;
  test.beforeAll(async () => { server = await createServer({ root: PROJECT, logLevel: "error", resolve: { alias: [...installedAuraPackageAliases()] } }); await server.listen(0); origin = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0] ?? ""; mkdirSync(REPORT_DIRECTORY, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  test("renders the exact skyline GLB through public Aura3D and idiomatic R3F/drei, then advances both cameras", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__ || window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE_ERROR__), undefined, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE_ERROR__), undefined, { timeout: 240_000 }).catch(async (error) => {
      const partial = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__);
      throw new Error(`Cinematic workload did not become ready: ${JSON.stringify(partial)}; pageErrors=${errors.join(" | ")}`, { cause: error });
    });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE_ERROR__); expect(failure ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__);
    expect(before).toMatchObject({ ready: true, workload: "cinematic-architecture", asset: { id: "showcaseSkylineCity", sha256: "2f6624cdd44b88b4c9b612bf0b9062451c5ade91ed243e0c595672d79dd13338" }, viewport: { width: 1440, height: 900, dpr: 1 }, aura: { publicPackageOnly: true, pathStep: 0 }, three: { revision: "185", actualR3F: true, actualDrei: true, actualRenderer: true, pathStep: 0 } });
    expect(before.aura.drawCalls).toBeGreaterThan(100); expect(before.three.drawCalls).toBeGreaterThan(100); expect(before.three.triangles).toBeGreaterThan(10_000); expect(before.three.nodeCount).toBeGreaterThan(500);
    expect(maxChannelDelta(before.aura.backgroundPixel, before.three.backgroundPixel), `Aura ${JSON.stringify(before.aura.backgroundPixel)} vs Three ${JSON.stringify(before.three.backgroundPixel)}`).toBeLessThanOrEqual(3);
    expect(before.aura.assetState).toMatchObject({
      id: "showcaseSkylineCity",
      status: "ready",
      provenance: {
        source: "typed-aura-assets-manifest",
        hash: "sha256-2f6624cdd44b88b4c9b612bf0b9062451c5ade91ed243e0c595672d79dd13338"
      }
    });
    await capturePair(page, "before");
    const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseSkylineCity.2f6624cd.glb"))).digest("hex"); expect(assetHash).toBe(before.asset.sha256);
    await page.locator("#advance-path").click(); await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__?.aura?.pathStep === 1 && window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__?.three?.pathStep === 1);
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_ARCHITECTURE__); expect(after.interaction).toEqual({ applied: true, from: 0, to: 1 }); expect(after.aura.pixelHash).not.toBe(before.aura.pixelHash); expect(after.three.pixelHash).not.toBe(before.three.pixelHash);
    await capturePair(page, "after");
    writeFileSync(resolve(REPORT_DIRECTORY,"report.json"),`${JSON.stringify({schema:"aura3d.current-head-to-head-workload/1.0",generatedAt:new Date().toISOString(),pass:true,assetSha256:assetHash,before,after},null,2)}\n`);
  });
});

function maxChannelDelta(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.slice(0, 3).map((value, index) => Math.abs(value - (b[index] ?? 0))));
}

async function capturePair(page: Page, suffix: "before" | "after"): Promise<void> {
  const captures = await page.evaluate(() => {
    const aura = document.querySelector<HTMLCanvasElement>("#aura");
    const three = document.querySelector<HTMLCanvasElement>("#root canvas");
    if (!aura || !three) throw new Error("Both native renderer canvases are required for capture.");
    return { aura: aura.toDataURL("image/png"), three: three.toDataURL("image/png") };
  });
  for (const [engine, dataUrl] of Object.entries(captures)) {
    writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
}
