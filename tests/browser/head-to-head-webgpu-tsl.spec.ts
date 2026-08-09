import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/webgpu-tsl");
test.describe("current head-to-head WebGPU / TSL", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_DIRECTORY, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });
  test("renders the frozen product through native Aura WebGPU/WGSL and Three WebGPU/TSL", async ({ page }) => {
    test.setTimeout(300_000); const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${server.origin}/benchmark/current-head-to-head/webgpu-tsl/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL_ERROR__), undefined, { timeout: 240_000 }).catch(async (error) => { const probe = await page.evaluate(() => ({ state: window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL__, error: window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL_ERROR__ })); throw new Error(`${String(error)}\n${JSON.stringify(probe)}\n${errors.join(" | ")}`); });
    expect(await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL_ERROR__) ?? errors.join(" | ")).toBeFalsy(); const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL__);
    expect(before).toMatchObject({ ready: true, workload: "webgpu-tsl", viewport: { width: 1440, height: 900, dpr: 1 }, before: { aura: { publicPackageOnly: true, backend: "webgpu", actualPortableWGSL: true }, three: { revision: "185", actualWebGPURenderer: true, actualNativeWebGPUBackend: true, actualTSLNodeMaterial: true } } }); expect(before.before.aura.nativeSubmissions).toBeGreaterThan(0); expect(before.before.aura.nativePassthroughSubmissions).toBeGreaterThan(0);
    const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex"); expect(assetHash).toBe(before.asset.sha256); const beforeHashes = await capturePair(page, "before");
    await page.locator("#advance").click(); await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL__?.after), undefined, { timeout: 120_000 }); const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL__); const afterHashes = await capturePair(page, "after");
    expect(after.after.aura.materialStateHash).not.toBe(after.before.aura.materialStateHash); expect(afterHashes.aura).not.toBe(beforeHashes.aura); expect(afterHashes.three).not.toBe(beforeHashes.three); expect(after.after.aura.drawCalls).toBeGreaterThan(0); expect(after.after.three.drawCalls).toBeGreaterThan(0);
    const lifecycle = await page.evaluate(() => (window as any).__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL_DISPOSE__()); expect(Object.values(lifecycle).every(Boolean), JSON.stringify(lifecycle)).toBe(true); expect(errors).toEqual([]);
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: assetHash, captureHashes: { before: beforeHashes, after: afterHashes }, before: after.before, after: after.after, lifecycle }, null, 2)}\n`);
  });
  test("uses public Aura packages and real current Three WebGPU/TSL entries", () => { const source = readFileSync(resolve("benchmark/current-head-to-head/webgpu-tsl/main.ts"), "utf8"); expect(source).toContain('from "@aura3d/rendering"'); expect(source).toContain('from "three/webgpu"'); expect(source).toContain('from "three/tsl"'); expect(source).not.toContain("packages/"); });
});
async function capturePair(page: Page, suffix: "before" | "after"): Promise<{ aura: string; three: string }> { const result = {} as { aura: string; three: string }; for (const engine of ["aura", "three"] as const) { const bytes = await page.locator(`#${engine}`).screenshot({ path: resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`) }); result[engine] = createHash("sha256").update(bytes).digest("hex"); } return result; }
