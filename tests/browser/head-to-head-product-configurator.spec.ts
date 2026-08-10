import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./installed-package-resolve";

const PROJECT = resolve("benchmark/current-head-to-head/product-configurator");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/product-configurator");

test.describe("current head-to-head product configurator", () => {
  let server: ViteDevServer;
  let origin: string;
  test.beforeAll(async () => {
    server = await createServer({ root: PROJECT, logLevel: "error", resolve: { alias: [...installedAuraPackageAliases()] } });
    await server.listen(0);
    origin = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0] ?? "";
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  test("applies the same material, finish, and environment configuration to the exact headphone asset", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR_ERROR__), undefined, { timeout: 240_000 });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR_ERROR__);
    expect(failure ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR__);
    expect(before).toMatchObject({
      ready: true,
      workload: "product-configurator",
      asset: { id: "showcaseHeadphones", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833" },
      viewport: { width: 1440, height: 900, dpr: 1 },
      aura: { publicPackageOnly: true, backend: "webgl2", configuration: "copper-gloss-studio", environment: "studio" },
      three: { revision: "185", actualR3F: true, actualDrei: true, actualRenderer: true, actualGLTFLoader: true, configuration: "copper-gloss-studio", environment: "studio" }
    });
    expect(before.aura.material).toEqual(before.three.material);
    expect(maxChannelDelta(before.aura.backgroundPixel, before.three.backgroundPixel)).toBeLessThanOrEqual(3);
    expect(before.aura.assetState).toMatchObject({ id: "showcaseHeadphones", status: "ready", provenance: { source: "typed-aura-assets-manifest" } });
    await capturePair(page, "before");
    await page.locator("#change-configuration").click();
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR__?.aura?.configuration === "ceramic-titanium-inspection" && window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR__?.three?.configuration === "ceramic-titanium-inspection");
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_CONFIGURATOR__);
    expect(after.interaction).toEqual({ applied: true, from: "copper-gloss-studio", to: "ceramic-titanium-inspection" });
    expect(after.aura.material).toEqual(after.three.material);
    expect(after.aura.pixelHash).not.toBe(before.aura.pixelHash);
    expect(after.three.pixelHash).not.toBe(before.three.pixelHash);
    expect(maxChannelDelta(after.aura.backgroundPixel, after.three.backgroundPixel)).toBeLessThanOrEqual(3);
    await capturePair(page, "after");
    const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex");
    expect(assetHash).toBe(before.asset.sha256);
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: assetHash, before, after }, null, 2)}\n`);
  });
});

function maxChannelDelta(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.slice(0, 3).map((value, index) => Math.abs(value - (b[index] ?? 0))));
}

async function capturePair(page: Page, suffix: "before" | "after"): Promise<void> {
  const captures = await page.evaluate(() => {
    const aura = document.querySelector<HTMLCanvasElement>("#aura");
    const three = document.querySelector<HTMLCanvasElement>("#root canvas");
    if (!aura || !three) throw new Error("Both native renderer canvases are required");
    return { aura: aura.toDataURL("image/png"), three: three.toDataURL("image/png") };
  });
  for (const [engine, dataUrl] of Object.entries(captures)) {
    writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
}
