// PRD-06 T0.17 — gallery-shift gait verification, no route edits
// (`apps/showcase-gallery-shift/src/main.ts` is PRD 14's). Under
// `?a3d-qr=animation` the thief and guard-2 controller bindings publish
// `clipSamples` into the actor path, so `handle.animation.animationState()`
// (T0.18, C-19) reports `tracksApplied > 0` every pumped frame, and
// `socket("Hips")` matrices show the sprint-vs-sneak hip-height difference.
// Under `?a3d-qr=none` the C-19 api is absent entirely — today's freeze path
// (controllers store `{bones:{}}` poses, no clip drive, no state api) — so
// that leg is the failing control.
//
// Reads reach the live app through the engine's `__AURA3D_LIVE_APPS__`
// registry + the route's deterministic `__GS_PUMP__` stepper — no route
// instrumentation is touched.

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "prd06", "gallery-shift-thief-gait");

declare global {
  interface Window {
    __AURA3D_LIVE_APPS__?: {
      count(): number;
      all(): readonly {
        nodes: {
          get(id: string): unknown;
          all(): readonly unknown[];
          ids?(): readonly string[];
        };
        diagnostics(): unknown;
      }[];
    };
    __GS_PUMP__?: (frames: number) => number;
    __GALLERY_SHIFT_EVIDENCE__?: {
      thiefGait?: string;
      animation?: { thiefActiveClip?: string | null; guardActiveClips?: (string | null)[] };
    };
  }
}

interface AnimationStateProbe {
  readonly available: boolean;
  readonly state?: {
    readonly activeClip: string | null;
    readonly tracksApplied: number;
    readonly activeActions: readonly unknown[];
    readonly timeScale: number;
  } | null;
}

/** Reads `nodes.get(id).animation.animationState()` — `available:false` when the C-19 api isn't attached. */
function readAnimationState(page: Page, nodeId: string): Promise<AnimationStateProbe> {
  return page.evaluate((id) => {
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const handle = app?.nodes.get(id) as { animation?: { animationState?: () => unknown } } | undefined;
    const api = handle?.animation;
    if (typeof api?.animationState !== "function") return { available: false };
    return { available: true, state: api.animationState() as AnimationStateProbe["state"] };
  }, nodeId);
}

const HIP_BONE_CANDIDATES = ["Hips", "hips", "Hip", "Root", "root", "Spine", "mixamorigHips", "mixamorig:Hips"];

/** Discovers the rig's hip bone name through `socket(bone).valid`. */
function findHipsBone(page: Page, nodeId: string): Promise<string | null> {
  return page.evaluate(([id, candidates]) => {
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const handle = app?.nodes.get(id) as { animation?: { socket?: (bone: string) => { valid: boolean } } } | undefined;
    if (typeof handle?.animation?.socket !== "function") return null;
    for (const bone of candidates) {
      if (handle.animation.socket(bone).valid) return bone;
    }
    return null;
  }, [nodeId, HIP_BONE_CANDIDATES] as const);
}

/** Pumps `frames` fixed steps and returns the hip world-matrix Y after each. */
async function sampleHipHeights(page: Page, nodeId: string, bone: string, frames: number): Promise<number[]> {
  const heights: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    const y = await page.evaluate(([id, boneName]) => {
      window.__GS_PUMP__?.(1);
      const app = window.__AURA3D_LIVE_APPS__?.all()[0];
      const handle = app?.nodes.get(id) as { animation?: { socket?: (b: string) => { worldMatrix(o?: Float32Array): Float32Array } } } | undefined;
      const m = handle?.animation?.socket?.(boneName)?.worldMatrix();
      return m ? m[13] : null;
    }, [nodeId, bone] as const);
    if (y !== null && y !== undefined) heights.push(y);
  }
  return heights;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

test.describe("PRD-06 T0.17 gallery-shift thief gait", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("thief + guard-2 report tracksApplied every frame and sprint vs sneak hip heights differ", async ({ page }) => {
    test.setTimeout(540_000);
    await page.goto(`${server.origin}/apps/showcase-gallery-shift/?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    // Shared-Metal CI runners starve rAF — first-frame plumbing takes minutes.
    // One merged wait (was 180+60+180s serial): app mounted, deterministic
    // pump installed, and the thief's clip wired — `polling` on a timer so the
    // predicate isn't itself throttled by rAF starvation.
    await page.waitForFunction(
      () =>
        (window.__AURA3D_LIVE_APPS__?.count() ?? 0) > 0 &&
        !!window.__GS_PUMP__ &&
        window.__GALLERY_SHIFT_EVIDENCE__?.animation?.thiefActiveClip != null,
      undefined,
      { timeout: 360_000, polling: 2_000 }
    );

    // Phase-0 exit criteria: tracksApplied > 0 on every pumped frame, thief + guard-2.
    const thiefFrames: number[] = [];
    const guardFrames: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const [thief, guard] = await Promise.all([readAnimationState(page, "thief"), readAnimationState(page, "guard-2")]);
      thiefFrames.push(thief.state?.tracksApplied ?? -1);
      guardFrames.push(guard.state?.tracksApplied ?? -1);
      await page.evaluate(() => window.__GS_PUMP__?.(1));
    }
    writeFileSync(join(ARTIFACT_DIR, "tracks-applied.json"), JSON.stringify({ thiefFrames, guardFrames }, null, 2));
    expect(thiefFrames.every((t) => t > 0), `thief tracksApplied per frame: ${thiefFrames.join(",")}`).toBe(true);
    expect(guardFrames.every((t) => t > 0), `guard-2 tracksApplied per frame: ${guardFrames.join(",")}`).toBe(true);

    // Sprint vs sneak: hip world-Y over a gait cycle each (sprint uses the real
    // sprint clip; sneak maps onto the walk clip — different curves).
    const hipsBone = await findHipsBone(page, "thief");
    expect(hipsBone, "no valid hip bone socket on thief (Hips/hips/Root/Spine candidates)").not.toBeNull();

    await page.keyboard.down("x"); // hold X → sprint gait
    await page.evaluate(() => window.__GS_PUMP__?.(6));
    const sprintHeights = await sampleHipHeights(page, "thief", hipsBone!, 24);
    await page.keyboard.up("x");
    await page.evaluate(() => window.__GS_PUMP__?.(4));

    await page.keyboard.press("Shift"); // toggle sneak on (sneak := walk clip at sneaking speed)
    await page.evaluate(() => window.__GS_PUMP__?.(6));
    const sneakHeights = await sampleHipHeights(page, "thief", hipsBone!, 24);
    await page.keyboard.press("Shift"); // toggle back

    writeFileSync(join(ARTIFACT_DIR, "hip-heights.json"), JSON.stringify({ bone: hipsBone, sprintHeights, sneakHeights }, null, 2));

    const sprintMean = mean(sprintHeights);
    const sneakMean = mean(sneakHeights);
    const sprintBob = Math.max(...sprintHeights) - Math.min(...sprintHeights);
    const sneakBob = Math.max(...sneakHeights) - Math.min(...sneakHeights);
    const hipsDelta = Math.max(Math.abs(sprintMean - sneakMean), Math.abs(sprintBob - sneakBob));
    expect(
      hipsDelta,
      `sprint vs sneak hip-height delta ${(hipsDelta * 100).toFixed(1)}cm < 5cm (means ${sprintMean.toFixed(3)}/${sneakMean.toFixed(3)}, bobs ${sprintBob.toFixed(3)}/${sneakBob.toFixed(3)})`
    ).toBeGreaterThanOrEqual(0.05);
  });

  test("flag-off (?a3d-qr=none) keeps the pre-lane shape — no C-19 api on the thief node", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(`${server.origin}/apps/showcase-gallery-shift/?a3d-qr=none`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window.__AURA3D_LIVE_APPS__?.count() ?? 0) > 0, undefined, { timeout: 180_000 });
    await page.waitForFunction(() => !!window.__GS_PUMP__, undefined, { timeout: 60_000 });
    await page.evaluate(() => window.__GS_PUMP__?.(8));

    const probe = await readAnimationState(page, "thief");
    expect(probe.available, "prd06.animation api should be absent with A3D_QR_ANIMATION off").toBe(false);
  });
});
