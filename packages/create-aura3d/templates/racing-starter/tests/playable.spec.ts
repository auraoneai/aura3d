import { expect, test } from "@playwright/test";

test("racing starter responds to keyboard input and exposes a multi-lap route contract", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_RACING_STARTER__?: unknown }).__AURA3D_RACING_STARTER__));

  const initial = await racingState(page);
  expect(initial.status).toBe("running");
  expect(initial.speed).toBeCloseTo(0, 5);
  expect(initial.checkpointCount).toBeGreaterThanOrEqual(6);
  expect(initial.lapProof.status).toBe("contract-ready");
  expect(initial.lapProof.events).toEqual(expect.arrayContaining([
    "checkpoint:checkpoint-1",
    "checkpoint:checkpoint-6",
    "lap:multi-lap-contract",
    "reset:available"
  ]));
  expect(initial.lapProof.lapsToWin).toBeGreaterThanOrEqual(3);
  expect(initial.lapProof.minLapSeconds).toBeGreaterThanOrEqual(20);
  expect(initial.lapProof.routeAlignedToVisibleTrack).toBe(true);

  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(260);
  const accelerated = await racingState(page);
  expect(accelerated.speed).toBeGreaterThan(initial.speed + 0.5);
  expect(accelerated.progress).not.toBe(initial.progress);

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowRight");
  const steered = await racingState(page);
  expect(steered.heading).not.toBe(accelerated.heading);

  await page.keyboard.up("ArrowUp");
  const afterInput = await racingState(page);
  expect(afterInput.events.length).toBeGreaterThanOrEqual(initial.events.length);

  await tapKey(page, "KeyR");
  await page.waitForTimeout(140);
  const reset = await racingState(page);
  expect(reset.status).toBe("running");
  expect(reset.checkpoint).toBe(0);
  expect(reset.events.some((event) => event.includes("reset"))).toBe(true);
});

async function racingState(page: import("@playwright/test").Page): Promise<{
  readonly status: string;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly speed: number;
  readonly progress: number;
  readonly heading: number;
  readonly events: readonly string[];
  readonly lapProof: {
    readonly status: string;
    readonly events: readonly string[];
    readonly checkpointCount: number;
    readonly lapsToWin: number;
    readonly minLapSeconds: number;
    readonly routeAlignedToVisibleTrack: boolean;
  };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __AURA3D_RACING_STARTER__?: {
        readonly status: string;
        readonly checkpoint: number;
        readonly checkpointCount: number;
        readonly speed: number;
        readonly progress: number;
        readonly heading: number;
        readonly events: readonly string[];
        readonly lapProof: {
          readonly status: string;
          readonly events: readonly string[];
          readonly checkpointCount: number;
          readonly lapsToWin: number;
          readonly minLapSeconds: number;
          readonly routeAlignedToVisibleTrack: boolean;
        };
      };
    }).__AURA3D_RACING_STARTER__;
    if (!state) throw new Error("Missing __AURA3D_RACING_STARTER__ state.");
    return state;
  });
}

async function tapKey(page: import("@playwright/test").Page, key: string, holdMs = 90): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}
