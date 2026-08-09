import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const PROJECT = resolve("benchmark/current-head-to-head/postprocessed-scene");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/postprocessed-scene");
test.describe("current head-to-head postprocessed scene", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_DIRECTORY, { recursive: true }); });
  test.afterAll(async () => { await server?.close(); });
  test("loads the frozen product and proves bloom off/on through both real composers", async ({ page }) => {
    test.setTimeout(240_000); const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${server.origin}/benchmark/current-head-to-head/postprocessed-scene/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS_ERROR__), undefined, { timeout: 180_000 }).catch(async (error) => { const probe = await page.evaluate(() => ({ state: window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS__, error: window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS_ERROR__ })); throw new Error(`${String(error)}\nProbe: ${JSON.stringify(probe)}\nPage errors: ${errors.join(" | ")}`); });
    expect(await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS_ERROR__) ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS__);
    expect(before).toMatchObject({ ready: true, workload: "postprocessed-scene", asset: { id: "showcaseHeadphones", bytes: 1_589_596, sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833" }, viewport: { width: 1440, height: 900, dpr: 1 }, baseline: { enabled: false, aura: { publicPackageOnly: true, backend: "webgl2", passNames: ["tone-mapping"] }, three: { revision: "185", actualRenderer: true, actualEffectComposer: true, actualRenderPass: true, actualUnrealBloomPass: true, actualOutputPass: true, enabledPasses: ["RenderPass", "OutputPass"] } } });
    expect(before.baseline.aura.drawCalls).toBeGreaterThan(0); expect(before.baseline.three.drawCalls).toBeGreaterThan(0); expect(before.baseline.aura.metadata.unsupportedExtensions).toEqual([]);
    expect(before.baseline.aura.backgroundPixel).toEqual(before.baseline.three.backgroundPixel);
    const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex"); expect(assetHash).toBe(before.asset.sha256);
    await capturePair(page, "off"); await page.locator("#enable").click();
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS__?.enabled), undefined, { timeout: 180_000 });
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS__);
    expect(after.enabled.aura.passNames).toEqual(["bloom", "tone-mapping"]); expect(after.enabled.aura.executionMode).toBe("renderer-owned-fused-ldr-native"); expect(after.enabled.three.enabledPasses).toEqual(["RenderPass", "UnrealBloomPass", "OutputPass"]);
    expect(after.enabled.aura.hash).not.toBe(after.baseline.aura.hash); expect(after.enabled.three.hash).not.toBe(after.baseline.three.hash); expect(after.enabled.delta.aura.changedPixels).toBeGreaterThan(1_000); expect(after.enabled.delta.three.changedPixels).toBeGreaterThan(1_000); expect(after.enabled.delta.aura.meanRgbDelta).toBeGreaterThan(0); expect(after.enabled.delta.three.meanRgbDelta).toBeGreaterThan(0);
    expect(after.enabled.aura.backgroundPixel).toEqual(after.enabled.three.backgroundPixel);
    expect(after.enabled.aura.frameCost.samples).toBe(11); expect(after.enabled.three.frameCost.samples).toBe(11); expect(after.enabled.aura.frameCost.medianMs).toBeGreaterThan(0); expect(after.enabled.three.frameCost.medianMs).toBeGreaterThan(0);
    await capturePair(page, "on"); const lifecycle = await page.evaluate(() => (window as any).__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS_DISPOSE__()); expect(Object.values(lifecycle).every(Boolean), JSON.stringify(lifecycle)).toBe(true); expect(errors).toEqual([]);
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: assetHash, baseline: after.baseline, enabled: after.enabled, lifecycle }, null, 2)}\n`);
  });
  test("uses public Aura packages and official current Three addons", () => { const source = readFileSync(resolve(PROJECT, "main.ts"), "utf8"); expect(source).toContain('from "@aura3d/'); expect(source).toContain('from "three/addons/postprocessing/EffectComposer.js"'); expect(source).toContain("UnrealBloomPass"); expect(source).toContain("OutputPass"); expect(source).not.toContain("packages/"); });
});
async function capturePair(page: Page, suffix: "off" | "on"): Promise<void> { const captures = await page.evaluate(() => ({ aura: document.querySelector<HTMLCanvasElement>("#aura")!.toDataURL("image/png"), three: document.querySelector<HTMLCanvasElement>("#three")!.toDataURL("image/png") })); for (const [engine, dataUrl] of Object.entries(captures)) writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")); }
