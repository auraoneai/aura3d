import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/createAuraApp-animation-bridge-harness.ts");

test.describe("createAuraApp animation bridge contract", () => {
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

  test("renders a skinned typed GLB with meaningful character pose pixel change", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-animation-bridge-harness.html?mode=pose-pair`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__), undefined, { timeout: 25_000 });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__);

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.renderer?.mode).toBe("production");
    expect(evidence?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.renderer?.fallbackUsed).toBe(false);
    expect(evidence?.asset?.typedRef).toBe("assets.showcaseRunnerRobot");
    expect(evidence?.asset?.assetId).toBe("showcaseRunnerRobot");
    expect(evidence?.asset?.clips).toEqual(expect.arrayContaining(["IDLE", "RUN"]));
    expect(evidence?.asset?.activeClip).toBe("RUN");
    expect(evidence?.asset?.skeletonBoneCount).toBeGreaterThan(20);
    expect(evidence?.asset?.skinnedRenderItemCount).toBeGreaterThan(0);
    expect(evidence?.asset?.skinningPaletteUpdated).toBe(true);
    expect(evidence?.animation?.cameraStable).toBe(true);
    expect(evidence?.animation?.runtimeClip).toBe("RUN");
    expect(evidence?.animation?.bindingClip).toBe("RUN");
    expect(evidence?.animation?.diff?.hashA).not.toBe(evidence?.animation?.diff?.hashB);
    expect(evidence?.animation?.diff?.changedSubjectPixels).toBeGreaterThan(120);
    expect(evidence?.animation?.diff?.meanDelta).toBeGreaterThan(0.05);
    expect(evidence?.claims).toEqual(expect.arrayContaining([
      "root-createAuraApp-typed-animation",
      "typed-glb-production-bridge",
      "skinned-glb-visible-animation"
    ]));
    expect(errors).toEqual([]);
  });

  test("public AnimationController controls drive the production GLB actor", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-animation-bridge-harness.html?mode=controls`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__), undefined, { timeout: 25_000 });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__);

    expect(evidence?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(evidence?.asset?.activeClip).toBe("RUN");
    expect(evidence?.asset?.skinningPaletteUpdated).toBe(true);
    expect(evidence?.animation?.controllerId).toBe("root-runner-controller");
    expect(evidence?.animation?.playbackControls).toMatchObject({
      play: true,
      pause: false,
      loop: true,
      crossFade: true,
      speed: true,
      seek: true
    });
    expect(evidence?.animation?.pauseDiff?.changedSubjectPixels).toBeLessThan(20);
    expect(evidence?.animation?.diff?.changedSubjectPixels).toBeGreaterThan(80);
    expect(errors).toEqual([]);
  });

  test("keyboard events switch a public runtime node from idle to run and hit clips", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-animation-bridge-harness.html?mode=keyboard`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__), undefined, { timeout: 25_000 });

    await page.keyboard.press("KeyD");
    await page.waitForFunction(() => (window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__?.keyboard?.state === "run", undefined, { timeout: 5_000 });
    const runEvidence = await page.evaluate(() => (window as any).__AURA3D_ANIMATION_BRIDGE_CAPTURE__?.());

    expect(runEvidence?.keyboard?.pressedRun).toBe(true);
    expect(runEvidence?.animation?.runtimeClip).toBe("RUN");
    expect(runEvidence?.asset?.activeClip).toBe("RUN");
    expect(runEvidence?.animation?.diff?.changedSubjectPixels).toBeGreaterThan(80);

    await page.keyboard.press("KeyH");
    await page.waitForFunction(() => (window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__?.keyboard?.state === "hit", undefined, { timeout: 5_000 });
    const hitEvidence = await page.evaluate(() => (window as any).__AURA3D_ANIMATION_BRIDGE_CAPTURE__?.());

    expect(hitEvidence?.keyboard?.pressedHit).toBe(true);
    expect(hitEvidence?.animation?.runtimeClip).toBe("ALL");
    expect(hitEvidence?.asset?.activeClip).toBe("ALL");
    expect(hitEvidence?.renderer?.runtimeBackend).toBe("production-runtime");
    expect(errors).toEqual([]);
  });
});
