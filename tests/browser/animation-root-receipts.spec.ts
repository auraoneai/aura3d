import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildReceipt, emitReceipt, writeReceipt, type HarnessFrame } from "../support/motion-receipts";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Remote only (tools/remote-acr/run.sh). The page drives four animation capabilities through
// the root `@aura3d/engine` runtime-node handle on real skinned GLBs; each passing capability
// writes evidence/receipts/<capability>/<version>.json (and prints it for the ACR log).

const harnessSource = resolve(process.cwd(), "tests/browser/animation-root-receipts-harness.ts");
const version = (JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { version: string }).version;
const gitSha = process.env.AURA3D_GIT_SHA ?? "unknown-remote";

interface CapabilityResult {
  readonly status: "ok" | "error";
  readonly error?: string;
  readonly measurements: Record<string, unknown>;
  readonly frames: readonly HarnessFrame[];
}
interface Evidence {
  readonly status: "running" | "done";
  readonly imports: readonly string[];
  readonly capabilities: Record<string, CapabilityResult>;
}

async function rendererString(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "no-webgl2";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
}

test.describe.serial("root animation receipts: layers, root motion, retargeting, two-bone IK", () => {
  test.setTimeout(420_000);
  let server: ExampleDevServer;
  let evidence: Evidence;
  let renderer = "unknown";
  const errors: string[] = [];

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/animation-root-receipts-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA3D_ANIMATION_ROOT_RECEIPTS__?: { status: string } }).__AURA3D_ANIMATION_ROOT_RECEIPTS__?.status === "done", undefined, { timeout: 380_000 });
    evidence = await page.evaluate(() => (window as unknown as { __AURA3D_ANIMATION_ROOT_RECEIPTS__: Evidence }).__AURA3D_ANIMATION_ROOT_RECEIPTS__);
    renderer = await rendererString(page);
    await page.close();
    for (const [name, result] of Object.entries(evidence.capabilities)) {
      console.log(`MEASUREMENTS::${name}::${JSON.stringify({ status: result.status, error: result.error, ...result.measurements })}`);
    }
  });

  test.afterAll(async () => {
    await server.close();
  });

  function publish(capability: string, scene: string): void {
    const result = evidence.capabilities[capability]!;
    const { receipt, pngs } = buildReceipt({
      capability,
      version,
      gitSha,
      renderer,
      scene,
      tests: ["tests/browser/animation-root-receipts.spec.ts", "tests/unit/animation/animation-root-retarget.test.ts"],
      frames: result.frames,
      measurements: result.measurements
    });
    writeReceipt(process.cwd(), receipt, pngs);
    emitReceipt(receipt, pngs);
  }

  function measured(capability: string): Record<string, number> & { readonly raw: Record<string, unknown> } {
    const result = evidence.capabilities[capability];
    expect(result, `${capability} did not run`).toBeTruthy();
    expect(result!.status, result!.error).toBe("ok");
    return Object.assign({}, result!.measurements as Record<string, number>, { raw: result!.measurements });
  }

  test("the harness imports only the root public API and the page threw nothing", () => {
    const source = readFileSync(harnessSource, "utf8");
    expect(source).toContain('from "@aura3d/engine"');
    expect(source).not.toMatch(/from\s+["'](?:three|@aura3d\/(?!engine["'])[^"']*|@aura3d\/engine\/[^"']*)["']/);
    expect(evidence.imports).toEqual(["@aura3d/engine"]);
    expect(errors).toEqual([]);
  });

  test("layers: an upper-body Run layer swings the arm and leaves the legs on Idle", () => {
    const m = measured("animation-layers");
    // The hand wanders under the layer and is near-still on Idle and again after stopLayer.
    expect(m.handRangeWithLayer).toBeGreaterThan(0.12);
    expect(m.handRangeWithLayer).toBeGreaterThan(3 * m.handRangeIdle);
    expect(m.handRangeAfterStop).toBeLessThan(0.06);
    // The legs stay on Idle: the foot neither wanders more nor sits elsewhere.
    expect(m.footShiftWithLayer).toBeLessThan(0.06);
    expect(m.footRangeWithLayer).toBeLessThan(0.06);
    expect(m.changedPixelsIdleVsLayer).toBeGreaterThan(300);
    const actions = m.raw.activeActions as readonly { clip: string; layer: string; weight: number }[];
    expect(actions.some((action) => action.layer === "upper" && action.clip === "Run")).toBe(true);
    // The layer clip is not also a base action.
    expect(actions.filter((action) => action.clip === "Run" && action.layer === "")).toEqual([]);
    publish("animation-layers", "Soldier: Idle base + Run on an upper-body masked layer, then stopLayer");
  });

  test("root motion: apply mode travels the node, extract-only and no spec do not", () => {
    const m = measured("animation-root-motion");
    expect(m.appliedTravel).toBeGreaterThan(0.8);
    expect(m.extractOnlyTravel).toBeLessThan(0.02);
    expect(m.noRootMotionTravel).toBeLessThan(0.02);
    expect(m.changedPixelsStartVsEnd).toBeGreaterThan(1500);
    publish("animation-root-motion", "Three Soldiers playing Run: rootMotion apply, extract-only, and unspecified");
  });

  test("retargeting: the Soldier's clips animate the Robot through addClipsFrom(node)", () => {
    const m = measured("animation-retargeting");
    expect(m.raw.bakedClipNames).toEqual(expect.arrayContaining(["Run", "Walk"]));
    expect(m.raw.robotActiveClip).toBe("Run");
    expect(m.robotTracksApplied).toBeGreaterThan(20);
    expect(Math.max(m.robotHandHeightRange, m.robotHandDepthRange)).toBeGreaterThan(0.05);
    expect(m.robotRegionChangedPixels).toBeGreaterThan(400);
    publish("animation-retargeting", "Soldier Run retargeted onto RobotExpressive via node.animation.addClipsFrom(soldierNode)");
  });

  test("two-bone IK: the hand reaches and follows a target, and releases on dispose", () => {
    const m = measured("animation-two-bone-ik");
    expect(m.errorBeforeIk).toBeGreaterThan(0.15);
    expect(m.errorTargetA).toBeLessThan(0.06);
    expect(m.errorTargetB).toBeLessThan(0.06);
    expect(m.handTravelAToB).toBeGreaterThan(0.1);
    expect(m.errorAfterClear).toBeGreaterThan(0.15);
    publish("animation-two-bone-ik", "Soldier right arm: node.animation.ik.add two-bone, target A then B, then disposed");
  });
});
