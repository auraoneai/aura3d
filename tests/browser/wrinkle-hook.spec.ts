import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/wrinkle-hook-harness.ts");
const reportDir = "tests/reports/wrinkle-hook";

test.describe("E1 wrinkle-map hook on a face rig — root browser proof", () => {
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

  test("morph weights drive wrinkle detail on the expressive face", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${server.origin}/tests/browser/wrinkle-hook-harness.html?wrinkle=on`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_WRINKLE_HOOK__), undefined, { timeout: 30_000 });
    const on = await page.evaluate(() => (window as any).__AURA3D_WRINKLE_HOOK__);

    await page.goto(`${server.origin}/tests/browser/wrinkle-hook-harness.html?wrinkle=off`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_WRINKLE_HOOK__), undefined, { timeout: 30_000 });
    const off = await page.evaluate(() => (window as any).__AURA3D_WRINKLE_HOOK__);

    await page.goto(`${server.origin}/tests/browser/wrinkle-hook-harness.html?wrinkle=on`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_WRINKLE_HOOK__), undefined, { timeout: 30_000 });
    await page.screenshot({ path: `${reportDir}/wrinkle-hook.png` });
    writeJson(`${reportDir}/wrinkle-hook.json`, {
      on: { ...on, pageErrors: errors },
      offHashNeutral: off?.animation?.hashNeutral,
      offHashFrown: off?.animation?.hashFrown,
      generatedAt: new Date().toISOString()
    });

    expect(on?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(on?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(on?.renderer?.fallbackUsed).toBe(false);
    expect(on?.asset?.typedRef).toBe("assets.showcaseExpressiveRobot");
    expect(on?.asset?.assetId).toBe("showcaseExpressiveRobot");
    expect(on?.animation?.cameraStable).toBe(true);
    // The hook follows real morph targets: Angry applies with nothing missing.
    expect(on?.animation?.frames?.[1]?.activeMorphTargets?.Angry).toBeCloseTo(1, 2);
    expect(on?.animation?.frames?.[1]?.missingMorphTargets ?? []).toEqual([]);
    expect(on?.animation?.frames?.[0]?.strength).toBe(0);
    expect(on?.animation?.frames?.[1]?.strength).toBeCloseTo(1, 6);
    // The expression itself shows (morph deformation, both runs).
    expect(on?.animation?.changedSubjectPixels).toBeGreaterThanOrEqual(40);
    // Strength 0 renders exactly as no hook: bit-exact default preservation.
    expect(on?.animation?.hashNeutral).toBe(off?.animation?.hashNeutral);
    // Full frown differs with the hook on: the uniform modulates face normals.
    expect(on?.animation?.hashFrown).not.toBe(off?.animation?.hashFrown);
    expect(on?.animation?.frameFrown?.nonBackgroundPixels).toBeGreaterThan(100);
  });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
