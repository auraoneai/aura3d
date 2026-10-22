import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Lane L8 browser acceptance (docs/workflows/threejs-parity-gaps.md §5.8/§8):
 * `characters.clone` produces ten skinned clones on one GLB — each with an
 * independent skeleton/mixer (bone transforms differ in the rendered frame)
 * while decoded+uploaded GPU texture entries stay flat from 1 → 10 clones.
 *
 * Remote-only: this spec must run on the browser runner, not locally.
 */

interface ParityAnimationState {
  readonly status: "loading" | "ready" | "error";
  readonly backend?: string;
  readonly cloneCount?: number;
  readonly clipName?: string;
  readonly clipPhases?: readonly number[];
  readonly sharedTextureEntries?: { readonly afterOne: number; readonly afterTen: number };
  readonly sharedTextureRefCount?: { readonly afterOne: number; readonly afterTen: number };
  readonly jointName?: string;
  readonly boneWorldTranslations?: readonly (readonly [number, number, number])[];
  readonly distinctBoneTranslations?: number;
  readonly drawCalls?: number;
  readonly litPixels?: number;
  readonly actorIds?: readonly string[];
  readonly clipsAvailable?: readonly string[];
  readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PARITY_ANIMATION__?: ParityAnimationState;
  }
}

test.describe("L8 parity — animation", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("ten clones: independent mixers, differing bones, flat texture growth", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/parity-animation/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_PARITY_ANIMATION__?.status === "ready" || window.__AURA3D_PARITY_ANIMATION__?.status === "error",
      undefined,
      { timeout: 60_000 },
    );

    const state = await page.evaluate(() => window.__AURA3D_PARITY_ANIMATION__);
    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");

    // SA-04: ten independent clones, one clip, staggered phases.
    expect(state?.cloneCount).toBe(10);
    expect(state?.actorIds).toHaveLength(10);
    expect(new Set(state?.actorIds ?? []).size).toBe(10);
    expect(state?.clipPhases).toHaveLength(10);
    expect(state?.clipName).toBeTruthy();
    expect((state?.clipsAvailable ?? []).length).toBeGreaterThan(0);

    // Independent mixers → the probe joint's world translation differs across
    // clones in the sampled frame (a shared skeleton would collapse these).
    expect(state?.boneWorldTranslations).toHaveLength(10);
    expect(state?.distinctBoneTranslations ?? 0).toBeGreaterThan(1);

    // Shared GPU textures: identical entry count at 1 and 10 clones — bytes
    // stay flat — while the pin count grew to ten.
    const entries = state?.sharedTextureEntries;
    expect(entries?.afterOne).toBeGreaterThan(0);
    expect(entries?.afterTen).toBe(entries?.afterOne);
    expect(state?.sharedTextureRefCount).toEqual({ afterOne: 1, afterTen: 10 });

    // A real frame was submitted: non-zero draw calls and lit pixels.
    expect(state?.drawCalls ?? 0).toBeGreaterThan(0);
    expect(state?.litPixels ?? 0).toBeGreaterThan(1_000);

    // §8/§11.3: route-health names the parity IDs this port exercised.
    expect(state?.routeHealth?.parityIds).toEqual(["SA-01", "SA-02", "SA-03", "SA-04", "SA-05", "SA-06", "SM-03"]);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
