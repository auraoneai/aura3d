import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/certified-hero-rigs-harness.ts");
const reportDir = "tests/reports/certified-hero-rigs";

interface RigCase {
  readonly rig: string;
  readonly kind: string;
  readonly assetId: string;
  readonly clip: string;
  /** Minimum changed subject-region pixels between two clip times (stable camera). */
  readonly minChangedSubjectPixels: number;
  readonly minJointCount: number;
  readonly minSkinnedRenderItems: number;
  readonly minMorphTargets: number;
}

const RIGS: readonly RigCase[] = [
  { rig: "humanoid-a", kind: "humanoid", assetId: "showcaseWalkAnimatedGirl", clip: "Take 001", minChangedSubjectPixels: 120, minJointCount: 78, minSkinnedRenderItems: 1, minMorphTargets: 0 },
  { rig: "humanoid-b", kind: "humanoid", assetId: "showcaseAnimatedRunnerHero", clip: "OffensiveIdle", minChangedSubjectPixels: 120, minJointCount: 136, minSkinnedRenderItems: 1, minMorphTargets: 0 },
  { rig: "creature", kind: "creature", assetId: "showcaseRunnerRobot", clip: "WALK", minChangedSubjectPixels: 120, minJointCount: 34, minSkinnedRenderItems: 1, minMorphTargets: 0 },
  { rig: "vehicle-driver", kind: "vehicle-driver", assetId: "showcaseKenneyOobiPlatformerHero", clip: "walk", minChangedSubjectPixels: 120, minJointCount: 6, minSkinnedRenderItems: 1, minMorphTargets: 0 },
  { rig: "face", kind: "face", assetId: "showcaseAnimatedRunnerHero", clip: "FacialExpressions", minChangedSubjectPixels: 40, minJointCount: 136, minSkinnedRenderItems: 1, minMorphTargets: 0 }
];

test.describe("E1 certified hero rigs — clip-playback pixel proof per rig", () => {
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

  for (const rig of RIGS) {
    test(`${rig.rig} (${rig.kind}): ${rig.assetId} plays "${rig.clip}" with visible pixel change`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${server.origin}/tests/browser/certified-hero-rigs-harness.html?rig=${rig.rig}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as any).__AURA3D_CERTIFIED_RIG__), undefined, { timeout: 30_000 });

      const evidence = await page.evaluate(() => (window as any).__AURA3D_CERTIFIED_RIG__);

      await page.screenshot({ path: `${reportDir}/${rig.rig}.png` });
      writeJson(`${reportDir}/${rig.rig}.json`, { ...evidence, pageErrors: errors, generatedAt: new Date().toISOString() });

      expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
      expect(evidence?.rig).toBe(rig.rig);
      expect(evidence?.kind).toBe(rig.kind);
      expect(evidence?.renderer?.runtimeBackend).toBe("production-runtime");
      expect(evidence?.renderer?.fallbackUsed).toBe(false);
      expect(evidence?.asset?.assetId).toBe(rig.assetId);
      expect(evidence?.asset?.clips).toEqual(expect.arrayContaining([rig.clip]));
      expect(evidence?.asset?.activeClip).toBe(rig.clip);
      expect(evidence?.asset?.jointCount).toBeGreaterThanOrEqual(rig.minJointCount);
      expect(evidence?.asset?.skinnedRenderItemCount).toBeGreaterThanOrEqual(rig.minSkinnedRenderItems);
      expect(evidence?.asset?.morphTargetCount).toBeGreaterThanOrEqual(rig.minMorphTargets);
      expect(evidence?.animation?.runtimeClip).toBe(rig.clip);
      expect(evidence?.animation?.bindingClip).toBe(rig.clip);
      expect(evidence?.animation?.cameraStable).toBe(true);
      expect(evidence?.animation?.diff?.hashA).not.toBe(evidence?.animation?.diff?.hashB);
      expect(evidence?.animation?.diff?.changedSubjectPixels).toBeGreaterThanOrEqual(rig.minChangedSubjectPixels);
      expect(evidence?.animation?.diff?.meanDelta).toBeGreaterThan(0.05);
      expect(errors).toEqual([]);
    });
  }
});

function writeJson(path: string, value: unknown): void { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
