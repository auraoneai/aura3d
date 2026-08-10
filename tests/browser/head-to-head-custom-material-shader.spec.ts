import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./installed-package-resolve";

const PROJECT = resolve("benchmark/current-head-to-head/custom-material-shader");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/custom-material-shader");
test.describe("current head-to-head custom material shader", () => {
  let server: ViteDevServer; let origin: string;
  test.beforeAll(async () => { server = await createServer({ root: PROJECT, logLevel: "error", resolve: { alias: [...installedAuraPackageAliases()] } }); await server.listen(0); origin = server.resolvedUrls?.local[0] ?? ""; mkdirSync(REPORT_DIRECTORY, { recursive: true }); });
  test.afterAll(async () => { await server?.close(); });
  test("compiles, changes a uniform, captures pixels, and disposes both real stacks", async ({ page }) => {
    test.setTimeout(180_000); const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER_ERROR__), undefined, { timeout: 120_000 });
    expect(await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER_ERROR__) ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER__);
    expect(before).toMatchObject({ ready: true, workload: "custom-material-shader", viewport: { width: 1440, height: 900, dpr: 1 }, aura: { publicPackageOnly: true, backend: "webgl2", actualPortableShaderMaterial: true, actualCompiledShaderProgram: true, pairedSources: ["GLSL", "WGSL"], compileOk: true, time: 0 }, three: { revision: "185", actualRenderer: true, actualShaderMaterial: true, actualCompiledShaderProgram: true, singleGlslPair: true, time: 0 } });
    expect(before.aura.drawCalls).toBe(1); expect(before.aura.deviceDrawCalls).toBeGreaterThan(0); expect(before.three.drawCalls).toBe(1); expect(before.three.triangles).toBeGreaterThan(3_000); await capturePair(page, "before");
    await page.locator("#advance").click(); await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER__?.aura?.time === 1.75 && window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER__?.three?.time === 1.75);
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER__);
    expect(after.interaction.applied).toBe(true);
    expect(after.aura.pixelHash, `Aura hashes: ${before.aura.pixelHash} -> ${after.aura.pixelHash}`).not.toBe(before.aura.pixelHash);
    expect(after.three.pixelHash, `Three hashes: ${before.three.pixelHash} -> ${after.three.pixelHash}`).not.toBe(before.three.pixelHash);
    await capturePair(page, "after");
    const lifecycle = await page.evaluate(() => (window as any).__AURA_THREE_HEAD_TO_HEAD_CUSTOM_SHADER_DISPOSE__()); expect(Object.values(lifecycle).every(Boolean), JSON.stringify(lifecycle)).toBe(true);
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, before, after, lifecycle }, null, 2)}\n`);
  });
  test("uses public packages and real shader APIs", () => { const source = readFileSync(resolve(PROJECT, "main.ts"), "utf8"); expect(source).toContain('from "@aura3d/rendering"'); expect(source).toContain('from "three"'); expect(source).toContain("PortableShaderMaterial"); expect(source).toContain("THREE.ShaderMaterial"); expect(source).not.toContain("packages/"); expect(source).not.toContain("createProgram("); });
});
async function capturePair(page: Page, suffix: "before" | "after"): Promise<void> { const captures = await page.evaluate(() => ({ aura: document.querySelector<HTMLCanvasElement>("#aura")!.toDataURL("image/png"), three: document.querySelector<HTMLCanvasElement>("#three")!.toDataURL("image/png") })); for (const [engine, dataUrl] of Object.entries(captures)) writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")); }
