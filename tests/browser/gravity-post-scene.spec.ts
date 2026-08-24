/**
 * Gravity Post scene proof — the prediction line is real scene geometry whose
 * pixels change with the aim drag, dock captures fire through physics
 * onTriggerEnter, and body/station labels render in the world-label layer.
 *
 * Gestures are dispatched through the route's own pointer-event handlers so
 * pixel evidence cannot be starved by CDP input scheduling under software GL;
 * the identical handler path is driven by real mouse input in
 * gravity-post-playable.spec.ts.
 */
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/gravity-post");
const ROUTE = "/apps/showcase-gravity-post/";
const GLOBAL_NAME = "__GRAVITY_POST_EVIDENCE__";

interface SceneEvidence {
  readonly mounted: boolean;
  /** True once the production WebGL renderer settled its mount; step() renders nothing before this. */
  readonly rendererMounted: boolean;
  readonly predictionSteps: number;
  readonly podState: string;
  readonly failedContracts: number;
  readonly flybyActive: boolean;
}

async function readEvidence(page: Page): Promise<SceneEvidence> {
  return await page.evaluate((name) => {
    const value = (window as unknown as Record<string, unknown>)[name];
    return (value && typeof value === "object" ? value : {}) as SceneEvidence;
  }, GLOBAL_NAME);
}

async function waitForEvidence(page: Page): Promise<void> {
  // Gate on rendererMounted, not just route mount: step() deliberately draws
  // nothing while the WebGL mount is in flight, so pixel captures taken earlier
  // are blank and byte-identical regardless of scene state.
  await page.waitForFunction(
    (name) => {
      const value = (window as unknown as Record<string, unknown>)[name];
      return Boolean(
        value &&
          typeof value === "object" &&
          (value as { mounted?: boolean }).mounted &&
          (value as { rendererMounted?: boolean }).rendererMounted
      );
    },
    GLOBAL_NAME,
    { timeout: 60_000 }
  );
}

/**
 * Atomic render + readback through the route's capture hook: the frame is
 * rendered and read inside one page task, so compositor timing can neither
 * clear the drawing buffer mid-read nor present a stale surface.
 */
async function captureCanvas(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const capture = (window as unknown as { __GRAVITY_POST_CAPTURE__?: () => string }).__GRAVITY_POST_CAPTURE__;
    if (!capture) throw new Error("__GRAVITY_POST_CAPTURE__ missing");
    return capture();
  });
}

/** Advance gameplay (no render cost) by game-time seconds via the sim hook. */
async function advance(page: Page, seconds: number): Promise<void> {
  await page.evaluate((total) => {
    const step = (window as unknown as { __GRAVITY_POST_SIM_STEP__?: (dt: number) => void }).__GRAVITY_POST_SIM_STEP__;
    if (!step) throw new Error("__GRAVITY_POST_SIM_STEP__ missing");
    const chunks = Math.ceil(total / 0.03);
    for (let index = 0; index < chunks; index += 1) step(total / chunks);
  }, seconds);
}

/** Render real frames through the full mounted pipeline (for pixel evidence). */
async function renderFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => {
    const step = (window as unknown as { __GRAVITY_POST_STEP__?: (dt: number) => void }).__GRAVITY_POST_STEP__;
    if (!step) throw new Error("__GRAVITY_POST_STEP__ missing");
    for (let index = 0; index < count; index += 1) step(1 / 30);
  }, frames);
}

/** Dispatch aim gestures through the canvas's own pointer handlers. */
async function aimGesture(
  page: Page,
  moves: readonly (readonly [number, number])[],
  release: boolean
): Promise<void> {
  await page.evaluate(({ moves: moveList, release: shouldRelease }) => {
    const canvas = document.querySelector("[data-testid='gravity-post-stage'] canvas");
    if (!canvas) throw new Error("canvas missing");
    const rect = canvas.getBoundingClientRect();
    const startX = rect.x + rect.width / 2;
    const startY = rect.y + rect.height / 2;
    const fire = (type: string, x: number, y: number): void => {
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 7 }));
    };
    fire("pointerdown", startX, startY);
    for (const [dx, dy] of moveList) fire("pointermove", startX + dx, startY + dy);
    if (shouldRelease) fire("pointerup", startX + moveList[moveList.length - 1]![0], startY + moveList[moveList.length - 1]![1]);
  }, { moves: moves.map(([dx, dy]) => [dx, dy]), release });
}

test("prediction line pixels follow the aim drag; labels and sensors are live", async ({ page }, testInfo) => {
  testInfo.setTimeout(420_000);
  let server: ExampleDevServer | undefined;
  mkdirSync(REPORT_DIR, { recursive: true });
  try {
    server = await startExampleDevServer();
    await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
    await waitForEvidence(page);

    // Settle one rendered frame so the baseline capture has scene content.
    await renderFrames(page, 1);
    const idleShot = await captureCanvas(page);
    const idleEvidence = await readEvidence(page);
    expect(idleEvidence.predictionSteps).toBe(0);

    // Short pull: beads appear along the sampled trajectory.
    await aimGesture(page, [[-60, 48]], false);
    await renderFrames(page, 1);
    const shortAim = await readEvidence(page);
    expect(shortAim.predictionSteps).toBeGreaterThan(0);

    // Extend the same drag: trajectory bends further, pixels must move.
    await aimGesture(page, [[-60, 48], [-120, 96]], false);
    await renderFrames(page, 1);
    const longAim = await readEvidence(page);
    expect(longAim.predictionSteps).toBeGreaterThan(0);

    const longShot = await captureCanvas(page);

    // Back to the short pull: same aim state -> same line, different from long.
    await aimGesture(page, [[-60, 48]], false);
    await renderFrames(page, 1);
    const shortAgainShot = await captureCanvas(page);

    expect(idleShot === longShot).toBe(false);
    expect(shortAgainShot === longShot).toBe(false); // aim changed -> pixels changed

    writeFileSync(
      resolve(REPORT_DIR, "aim-prediction-line.png"),
      Buffer.from(longShot.replace(/^data:image\/png;base64,/, ""), "base64")
    );

    // Sub-threshold release: no launch, beads hide again.
    await aimGesture(page, [[-2, 0]], true);
    await advance(page, 0.3);
    await renderFrames(page, 1);
    const cancelled = await readEvidence(page);
    expect(cancelled.podState).toBe("ready");

    // World labels: six bodies plus six stations in the label layer.
    const labelCount = await page.evaluate(() => document.querySelectorAll(".aura-world-label").length);
    expect(labelCount).toBeGreaterThanOrEqual(12);

    // Sensor truth: a scripted contract-one delivery fires onTriggerEnter docks.
    // Robust vector from scripts/verify-contracts.ts: dir=(-0.051,-0.999) speed 1.29.
    const speed = 1.29;
    const power = Math.min(1, Math.max(0.05, (speed - 0.18) / (2.85 - 0.18)));
    const pixels = Math.round(power * 190);
    const dirX = -0.051;
    const dirZ = -0.999;
    await aimGesture(page, [[Math.round(dirX * pixels), Math.round(dirZ * pixels)]], true);
    await advance(page, 0.1);
    const flying = await readEvidence(page);
    expect(flying.podState).toBe("coasting");

    await page.keyboard.down("Space");
    let docked = false;
    let failed = false;
    for (let guard = 0; guard < 600 && !docked && !failed; guard += 1) {
      const current = await readEvidence(page);
      if (current.flybyActive) {
        await page.keyboard.up("Space");
        await page.keyboard.press("KeyX"); // skip the beat
        await page.waitForTimeout(60);
        await page.keyboard.down("Space");
        continue;
      }
      await advance(page, 1.2);
      const after = await readEvidence(page);
      if (after.podState === "docked") docked = true;
      if (after.failedContracts > 0) failed = true;
    }
    await page.keyboard.up("Space");
    expect(failed, "delivery flight should not fail").toBe(false);
    expect(docked).toBe(true);
  } finally {
    await server?.close();
  }
});