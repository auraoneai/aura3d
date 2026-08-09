import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const PROJECT = resolve("benchmark/current-head-to-head/skinned-morph-animation");
const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/skinned-morph-animation");

test.describe("current head-to-head skinned and morph animation", () => {
  let server: ViteDevServer;
  let origin: string;
  test.beforeAll(async () => {
    server = await createServer({ root: PROJECT, logLevel: "error" });
    await server.listen(0);
    origin = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0] ?? "";
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });
  test.afterAll(async () => { await server?.close(); });

  test("animates the same skinned asset and morph target through both real stacks", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__?.ready || window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH_ERROR__), undefined, { timeout: 240_000 }).catch(async (error) => {
      const partial = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__);
      throw new Error(`Skinned/morph workload did not become ready: ${JSON.stringify(partial)}; pageErrors=${errors.join(" | ")}`, { cause: error });
    });
    const failure = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH_ERROR__);
    expect(failure ?? errors.join(" | ")).toBeFalsy();
    const before = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__);
    expect(before.aura.fallbackUsed, JSON.stringify(before.aura)).toBe(false);
    expect(before).toMatchObject({
      ready: true,
      workload: "skinned-morph-animation",
      viewport: { width: 1440, height: 900, dpr: 1 },
      assets: {
        skinnedCharacter: { id: "showcaseAnimatedRunnerHero", sha256: "9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f", clip: "OffensiveIdle" },
        morphExpression: { id: "showcaseMorphExpression", sha256: "7617880e389ad59912ac1efaced7d127e50372aaeb3b1ab8dceefe4bdca39474", target: "target-0", runtimeTarget: "morph-expression-morph-1" }
      },
      aura: { publicPackageOnly: true, backend: "webgl2", runtimeBackend: "production-runtime", fallbackUsed: false, clip: "OffensiveIdle", activeMorphTargets: { "target-0": 0 } },
      three: { revision: "185", actualRenderer: true, actualGLTFLoader: true, actualAnimationMixer: true, clip: "OffensiveIdle", morphWeight: 0 }
    });
    expect(before.aura.assetStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "showcaseAnimatedRunnerHero", status: "ready", provenance: expect.objectContaining({ source: "typed-aura-assets-manifest" }) }),
      expect.objectContaining({ id: "showcaseMorphExpression", status: "ready", provenance: expect.objectContaining({ source: "typed-aura-assets-manifest" }) })
    ]));
    expect(before.aura.clipCount).toBeGreaterThanOrEqual(3);
    expect(before.aura.skeletonBoneCount).toBeGreaterThan(20);
    expect(before.aura.skinningPaletteUpdated).toBe(true);
    expect(before.aura.skinnedRenderItemCount).toBeGreaterThan(0);
    expect(before.aura.morphTargets).toContain("morph-expression-morph-1");
    expect(before.aura.manifestToRuntimeMorphTarget).toEqual({ manifest: "target-0", runtime: "morph-expression-morph-1" });
    expect(before.aura.morphRenderItemCount).toBeGreaterThan(0);
    expect(before.aura.missingMorphTargets).toEqual([]);
    expect(before.three.clipCount).toBeGreaterThanOrEqual(3);
    expect(before.three.skinnedMeshCount).toBeGreaterThan(0);
    expect(before.three.skeletonBoneCount).toBeGreaterThan(20);
    expect(before.three.morphMeshCount).toBeGreaterThan(0);
    expect(before.three.morphTargetCount).toBeGreaterThan(0);
    expect(before.three.triangles).toBeGreaterThan(1_000);
    expect(maxChannelDelta(before.aura.backgroundPixel, before.three.backgroundPixel), `Aura ${JSON.stringify(before.aura.backgroundPixel)} vs Three ${JSON.stringify(before.three.backgroundPixel)}`).toBeLessThanOrEqual(3);
    await capturePair(page, "before");

    await page.locator("#advance").click();
    await page.waitForFunction(() => window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__?.aura?.sampleSeconds === 1.2 && window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__?.three?.sampleSeconds === 1.2);
    const after = await page.evaluate(() => window.__AURA_THREE_HEAD_TO_HEAD_SKINNED_MORPH__);
    expect(after.interaction.applied).toBe(true);
    expect(after.aura.activeMorphTargets["target-0"]).toBe(1);
    expect(after.three.morphWeight).toBe(1);
    expect(after.aura.skinningPaletteUpdated).toBe(true);
    expect(after.aura.pixelHash).not.toBe(before.aura.pixelHash);
    expect(after.three.pixelHash).not.toBe(before.three.pixelHash);
    await capturePair(page, "after");

    const hashes = {
      skinnedCharacter: hashFile("public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb"),
      morphExpression: hashFile("public/aura-assets/showcaseMorphExpression.7617880e.gltf")
    };
    expect(hashes.skinnedCharacter).toBe(before.assets.skinnedCharacter.sha256);
    expect(hashes.morphExpression).toBe(before.assets.morphExpression.sha256);
    writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, hashes, before, after }, null, 2)}\n`);
  });
});

function hashFile(path: string): string { return createHash("sha256").update(readFileSync(resolve(path))).digest("hex"); }
function maxChannelDelta(left: readonly number[], right: readonly number[]): number { return Math.max(...left.slice(0, 3).map((value, index) => Math.abs(value - (right[index] ?? 0)))); }
async function capturePair(page: Page, suffix: "before" | "after"): Promise<void> {
  const captures = await page.evaluate(() => {
    const aura = document.querySelector<HTMLCanvasElement>("#aura");
    const three = document.querySelector<HTMLCanvasElement>("#three");
    if (!aura || !three) throw new Error("Both native renderer canvases are required for capture.");
    return { aura: aura.toDataURL("image/png"), three: three.toDataURL("image/png") };
  });
  for (const [engine, dataUrl] of Object.entries(captures)) writeFileSync(resolve(REPORT_DIRECTORY, `${engine}-${suffix}.png`), Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
}
