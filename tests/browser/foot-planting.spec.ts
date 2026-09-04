import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/foot-planting-harness.ts");
const reportDir = "tests/reports/foot-planting";

test.describe("E2 feet plant on terrain + moving platforms — root browser proof", () => {
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
    expect(source).not.toMatch(/from\s+["'](?:three|@aura3d\/rendering|@aura3d\/engine\/rendering|@aura3d\/engine\/production-runtime|@aura3d\/assets|@aura3d\/assets\/browser|@aura3d\/animation)/);
    expect(source).not.toContain("GLTFLoader");
    expect(source).not.toContain("unsafeModelUrl");
    expect(source).not.toMatch(/model\(\s*["'`]/);
  });

  test("walk feet plant on steps and ride the moving platform", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/foot-planting-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_FOOT_PLANTING__), undefined, { timeout: 30_000 });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_FOOT_PLANTING__);

    await page.screenshot({ path: `${reportDir}/foot-planting.png` });
    writeJson(`${reportDir}/foot-planting.json`, { ...evidence, pageErrors: errors, generatedAt: new Date().toISOString() });

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.renderer?.fallbackUsed).toBe(false);
    expect(evidence?.asset?.typedRef).toBe("assets.showcaseWalkAnimatedGirl");
    expect(evidence?.asset?.assetId).toBe("showcaseWalkAnimatedGirl");
    expect(evidence?.asset?.clips).toEqual(expect.arrayContaining(["Take 001"]));
    expect(evidence?.asset?.activeClip).toBe("Take 001");
    expect(evidence?.asset?.renderItemCount).toBeGreaterThanOrEqual(1);
    expect(evidence?.animation?.runtimeClip).toBe("Take 001");
    expect(evidence?.animation?.bindingClip).toBe("Take 001");
    expect(evidence?.animation?.cameraStable).toBe(true);
    // Mechanics: stance feet planted across the walk on steps + breathing platform.
    expect(evidence?.animation?.configured).toBe(true);
    expect(evidence?.animation?.missingLegs).toEqual([]);
    expect(evidence?.animation?.groundedFrames).toBeGreaterThanOrEqual(4);
    expect(evidence?.animation?.maxTargetError).toBeLessThan(0.1);
    // The walk is visible: stable camera, only the character moves.
    expect(evidence?.animation?.frameA?.nonBackgroundPixels).toBeGreaterThan(100);
    expect(evidence?.animation?.hashA).not.toBe(evidence?.animation?.hashB);
    expect(evidence?.animation?.changedSubjectPixels).toBeGreaterThanOrEqual(100);
    expect(evidence?.animation?.meanDelta).toBeGreaterThan(0.05);
    expect(errors).toEqual([]);
  });
});

function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
