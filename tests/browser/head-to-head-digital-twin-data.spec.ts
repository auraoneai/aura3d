import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const PROJECT = resolve("benchmark/current-head-to-head/digital-twin-data");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/digital-twin-data");

test.describe("current head-to-head digital twin data application", () => {
  let server: ViteDevServer;
  let origin: string;
  test.beforeAll(async () => {
    server = await createServer({ root: PROJECT, logLevel: "error" });
    await server.listen(0);
    origin = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0] ?? "";
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });
  test.afterAll(async () => { await server?.close(); });

  test("renders the exact workcell and binds one deterministic alert to telemetry and visible 3D state", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN_ERROR__), undefined, { timeout: 240_000 }).catch(async (error) => {
      const partial = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__);
      throw new Error(`Digital-twin workload did not become ready: ${JSON.stringify(partial)}; pageErrors=${errors.join(" | ")}`, { cause: error });
    });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN_ERROR__);
    expect(failure ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__);
    expect(before).toMatchObject({
      ready: true,
      workload: "digital-twin-data",
      asset: { id: "showcaseRoboticWeldingWorkcell", sha256: "cb604e0cce4f624672f88fc81d9f35374e43847e37b436e2048699416b1f6387" },
      viewport: { width: 1440, height: 900, dpr: 1 },
      aura: { publicPackageOnly: true, backend: "webgl2", telemetry: { mode: "normal", temperature: 31.5, incidents: 0, load: 64 }, visibleDataBinding: "green-zone" },
      three: { revision: "185", actualR3F: true, actualDrei: true, actualRenderer: true, telemetry: { mode: "normal", temperature: 31.5, incidents: 0, load: 64 }, visibleDataBinding: "green-zone" }
    });
    expect(before.aura.drawCalls).toBeGreaterThan(25);
    expect(before.aura.assetState).toMatchObject({ id: "showcaseRoboticWeldingWorkcell", status: "ready", provenance: { source: "typed-aura-assets-manifest" } });
    expect(before.three.drawCalls).toBeGreaterThan(25);
    expect(before.three.triangles).toBeGreaterThan(10_000);
    expect(before.three.nodeCount).toBeGreaterThan(100);
    expect(maxChannelDelta(before.aura.backgroundPixel, before.three.backgroundPixel), `Aura ${JSON.stringify(before.aura.backgroundPixel)} vs Three ${JSON.stringify(before.three.backgroundPixel)}`).toBeLessThanOrEqual(3);
    await capturePair(page, "before");
    const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseRoboticWeldingWorkcell.cb604e0c.glb"))).digest("hex");
    expect(assetHash).toBe(before.asset.sha256);

    await page.locator("#inject-alert").click();
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__?.aura?.telemetry?.incidents === 1 && window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__?.three?.telemetry?.incidents === 1);
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_DIGITAL_TWIN__);
    expect(after.interaction).toMatchObject({ applied: true, action: "inject-alert", to: { mode: "incident", temperature: 37, incidents: 1, load: 72 } });
    expect(after.aura.visibleDataBinding).toBe("red-zone-and-beacon");
    expect(after.three.visibleDataBinding).toBe("red-zone-and-beacon");
    expect(after.aura.pixelHash).not.toBe(before.aura.pixelHash);
    expect(after.three.pixelHash).not.toBe(before.three.pixelHash);
    await expect(page.locator("#telemetry")).toHaveText("incident · 37.0 C · 1 incident");

    await capturePair(page, "after");
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
    if (!aura || !three) throw new Error("Both native renderer canvases are required for capture.");
    return { aura: aura.toDataURL("image/png"), three: three.toDataURL("image/png") };
  });
  for (const [engine, dataUrl] of Object.entries(captures)) {
    writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
}
