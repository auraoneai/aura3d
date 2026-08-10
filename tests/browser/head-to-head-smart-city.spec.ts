import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./installed-package-resolve";

const PROJECT = resolve("benchmark/current-head-to-head/smart-city");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/smart-city");

test.describe("current head-to-head smart city", () => {
  let server: ViteDevServer;
  let origin: string;
  test.beforeAll(async () => {
    server = await createServer({ root: PROJECT, logLevel: "error", resolve: { alias: [...installedAuraPackageAliases()] } });
    await server.listen(0);
    origin = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0] ?? "";
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  test("renders the exact shared city descriptor and typed vehicle through night/day district states", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY_ERROR__), undefined, { timeout: 240_000 });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY_ERROR__);
    expect(failure ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY__);
    expect(before).toMatchObject({
      ready: true,
      workload: "smart-city",
      asset: { id: "showcaseCityVehicle", sha256: "15552b57377570b1c9d9fe8fa9476856a6ee357e4c7d8be1c6dd191e1ef7d27e" },
      viewport: { width: 1440, height: 900, dpr: 1 },
      contract: { blocks: 8, transition: "night/core to day/industrial" },
      aura: { publicPackageOnly: true, backend: "webgl2", state: "night-core-district", timeOfDay: "night", district: "core" },
      three: { revision: "185", actualRenderer: true, actualGLTFLoader: true, state: "night-core-district", timeOfDay: "night", district: "core" }
    });
    expect(before.aura.cityNodeCount).toBe(before.three.cityNodeCount);
    expect(before.aura.cityNodeCount).toBeGreaterThan(200);
    expect(before.aura.assetState).toMatchObject({ id: "showcaseCityVehicle", status: "ready", provenance: { source: "typed-aura-assets-manifest" } });
    expect(before.three.assetNodeCount).toBeGreaterThanOrEqual(5);
    expect(maxChannelDelta(before.aura.backgroundPixel, before.three.backgroundPixel)).toBeLessThanOrEqual(3);
    await capturePair(page, "night-core");

    await page.locator("#change-city-state").click();
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY__?.aura?.state === "day-industrial-district" && window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY__?.three?.state === "day-industrial-district");
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY__);
    expect(after.interaction).toEqual({ applied: true, from: "night-core-district", to: "day-industrial-district", actions: ["toggle-day", "select-industrial-district"] });
    expect(after.aura.cityNodeCount).toBe(after.three.cityNodeCount);
    expect(after.aura.pixelHash).not.toBe(before.aura.pixelHash);
    expect(after.three.pixelHash).not.toBe(before.three.pixelHash);
    expect(maxChannelDelta(after.aura.backgroundPixel, after.three.backgroundPixel)).toBeLessThanOrEqual(20);
    await capturePair(page, "day-industrial");

    const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseCityVehicle.15552b57.glb"))).digest("hex");
    expect(assetHash).toBe(before.asset.sha256);
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: assetHash, before, after }, null, 2)}\n`);
  });
});

async function capturePair(page: Page, suffix: "night-core" | "day-industrial"): Promise<void> {
  const captures = await page.evaluate(() => {
    const aura = document.querySelector<HTMLCanvasElement>("#aura");
    const three = document.querySelector<HTMLCanvasElement>("#three");
    if (!aura || !three) throw new Error("Both native renderer canvases are required");
    return { aura: aura.toDataURL("image/png"), three: three.toDataURL("image/png") };
  });
  for (const [engine, dataUrl] of Object.entries(captures)) {
    writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
}

function maxChannelDelta(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.slice(0, 3).map((value, index) => Math.abs(value - (b[index] ?? 0))));
}
