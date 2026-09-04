import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/animation-pointer-material-harness.ts");
const reportDir = "tests/reports/animation-pointer-material";

test.describe("M1 animation-pointer material track — root browser proof", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness imports only the root public API and generated typed assets", () => {
    const source = readFileSync(harnessSource, "utf8");
    expect(source).toContain('from "@aura3d/engine"');
    expect(source).toContain('from "../../src/aura-assets"');
    expect(source).not.toMatch(/from\s+["'](?:three|@aura3d\/rendering|@aura3d\/engine\/rendering|@aura3d\/engine\/production-runtime|@aura3d\/assets|@aura3d\/assets\/browser)/);
    expect(source).not.toContain("GLTFLoader");
    expect(source).not.toContain("unsafeModelUrl");
    expect(source).not.toMatch(/model\(\s*["'`]/);
  });

  test("pointerFade clip drives GlowPanelMat baseColorFactor white to near-black", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/animation-pointer-material-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_POINTER_MATERIAL__), undefined, { timeout: 30_000 });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_POINTER_MATERIAL__);

    await page.screenshot({ path: `${reportDir}/pointer-fade.png` });
    writeJson(`${reportDir}/pointer-fade.json`, { ...evidence, pageErrors: errors, generatedAt: new Date().toISOString() });

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.renderer?.fallbackUsed).toBe(false);
    expect(evidence?.asset?.typedRef).toBe("assets.animationPointerPanel");
    expect(evidence?.asset?.assetId).toBe("animationPointerPanel");
    expect(evidence?.asset?.clips).toEqual(expect.arrayContaining(["pointerFade"]));
    expect(evidence?.asset?.activeClip).toBe("pointerFade");
    // The runtime's own counter: the pointer channel applied to the live material.
    expect(evidence?.asset?.materialTracksApplied).toBeGreaterThanOrEqual(1);
    expect(evidence?.asset?.renderItemCount).toBeGreaterThanOrEqual(1);
    expect(evidence?.animation?.runtimeClip).toBe("pointerFade");
    expect(evidence?.animation?.bindingClip).toBe("pointerFade");
    expect(evidence?.animation?.cameraStable).toBe(true);
    // The panel visibly fades: stable camera, same scene, only the material changed.
    expect(evidence?.animation?.frameA?.nonBackgroundPixels).toBeGreaterThan(100);
    expect(evidence?.animation?.frameA?.meanLuma).toBeGreaterThan((evidence?.animation?.frameB?.meanLuma ?? 0) + 20);
    expect(evidence?.animation?.diff?.hashA).not.toBe(evidence?.animation?.diff?.hashB);
    expect(evidence?.animation?.diff?.changedSubjectPixels).toBeGreaterThanOrEqual(100);
    expect(evidence?.animation?.diff?.meanDelta).toBeGreaterThan(0.05);
    expect(errors).toEqual([]);
  });
});

function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
