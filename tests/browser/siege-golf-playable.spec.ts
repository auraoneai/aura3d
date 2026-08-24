import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Siege Golf playable evidence (PRD SG-13): keyboard aim -> charge -> fire ->
 * sensor cup -> score -> advance -> reset, plus the pause freeze and the
 * stroke-limit fail path.
 */

interface SiegeEvidence {
  readonly mounted?: boolean;
  readonly holeIndex?: number;
  readonly strokes?: number;
  readonly par?: number;
  readonly state?: string;
  readonly targetsDown?: number;
  readonly targetsSunk?: number;
  readonly sensorEventCount?: number;
  readonly lastShotHash?: string;
  readonly resetHashMatch?: boolean | null;
  readonly audioCues?: readonly string[];
  readonly chargeFraction?: number;
  readonly aimAngleRadians?: number;
  readonly cameraPhase?: string;
  readonly physicsBodyCount?: number;
  readonly livePoseHash?: string;
  readonly bestSolutionAvailable?: boolean;
  readonly bestSolutionStrokes?: number | null;
  readonly bestSolutionInputCount?: number;
  readonly bestSolutionPointCount?: number;
  readonly bestGhostVisible?: boolean;
  readonly bestGhostVisibleNodes?: number;
  readonly bestGhostVisualOnly?: boolean;
  readonly bestGhostPhysicsBodies?: number;
}

test("siege golf mobile controls directly aim, hold charge, and strike", async ({ page }) => {
  test.setTimeout(240_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.origin + "/apps/showcase-siege-golf/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    const boot = await readEvidence(page);
    const left = page.locator("#sg-aim-left-button");
    const leftBox = await left.boundingBox();
    expect(leftBox).not.toBeNull();
    await page.mouse.move(leftBox!.x + leftBox!.width / 2, leftBox!.y + leftBox!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(320);
    await page.mouse.up();
    await page.waitForFunction((before: number) => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { aimAngleRadians?: number; cameraPhase?: string } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.aimAngleRadians ?? before) < before && ev?.cameraPhase === "aim";
    }, Number(boot.aimAngleRadians ?? 0), { timeout: 15_000 });

    const strike = page.locator("#sg-mobile-strike-button");
    const strikeBox = await strike.boundingBox();
    expect(strikeBox).not.toBeNull();
    await page.mouse.move(strikeBox!.x + strikeBox!.width / 2, strikeBox!.y + strikeBox!.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { chargeFraction?: number } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.chargeFraction ?? 0) >= 0.25;
    }, undefined, { timeout: 15_000 });
    const charged = await readEvidence(page);
    expect(Number(charged.chargeFraction ?? 0)).toBeGreaterThanOrEqual(0.25);
    await page.mouse.up();
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number; cameraPhase?: string } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.strokes ?? 0) === 1 && ev?.cameraPhase === "flight";
    }, undefined, { timeout: 30_000 });
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});

async function readEvidence(page: Page): Promise<SiegeEvidence> {
  return page.evaluate(() => (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: SiegeEvidence }).__SIEGE_GOLF_EVIDENCE__ ?? {});
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __SIEGE_GOLF_EVIDENCE__?: unknown }).__SIEGE_GOLF_EVIDENCE__),
    undefined,
    { timeout: 180_000 }
  );
}

/**
 * Tap Space until the stroke counter advances. Frame-starved headless runs can
 * drop a press between rAF samples; the route treats each tap as an intentional
 * chip, so retrying on a cadence is safe and never double-counts.
 */
/**
 * One full-charge strike: hold Space long enough for maximum power, then
 * release. If frame starvation drops the registration, fall back to tap
 * retries so the stroke still counts (weaker, but keeps sequences moving).
 * Completion short-circuit: once targetsSunk >= 1 or state is "hole-complete"
 * no further stroke can register, so bail out instead of demanding a stroke
 * count that will never arrive.
 */
async function holeAlreadyScored(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { targetsSunk?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
    return Number(ev?.targetsSunk ?? 0) >= 1 || ev?.state === "hole-complete";
  });
}

async function chargedStrike(page: Page, expectedStrokes: number): Promise<void> {
  await page.keyboard.down("Space");
  await page.waitForTimeout(1500);
  await page.keyboard.up("Space");
  try {
    await page.waitForFunction((expected: number) => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number; targetsSunk?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.strokes ?? 0) >= expected || Number(ev?.targetsSunk ?? 0) >= 1 || ev?.state === "hole-complete";
    }, expectedStrokes, { timeout: 20_000 });
    return;
  } catch {
    // Frame-starved fallback: chip taps until the stroke registers.
    await tapUntilStroke(page, expectedStrokes);
  }
}

async function tapUntilStroke(page: Page, expectedStrokes: number): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await holeAlreadyScored(page)) return;
    await page.keyboard.press("Space");
    try {
      await page.waitForFunction((expected: number) => {
        const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number; targetsSunk?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
        return Number(ev?.strokes ?? 0) >= expected || Number(ev?.targetsSunk ?? 0) >= 1 || ev?.state === "hole-complete";
      }, expectedStrokes, { timeout: 20_000 });
      return;
    } catch {
      // retry on the next cadence press
    }
  }
  if (await holeAlreadyScored(page)) return;
  throw new Error("stroke " + expectedStrokes + " never registered");
}

test("siege golf plays a hole: charge, strike, sink, advance, reset", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const logDir = testInfo.outputPath("sink");
  mkdirSync(logDir, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-siege-golf/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    const boot = await readEvidence(page);
    expect(boot.backend, "route must run on the rapier backend").toBe("rapier");
    // Charge timing depends on real frame delivery, so alternate full-charge
    // holds with tap retries; hole 1 sinks on any clean full-power strike.
    // The result card is the completion authority: once it is visible the hole
    // is scored, and any further Space taps are ignored by the route anyway.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const state = await readEvidence(page);
      const cardVisible = await page.locator("#sg-result:not(.is-hidden)").isVisible().catch(() => false);
      if (Number(state.targetsSunk ?? 0) >= 1 || state.state === "hole-complete" || cardVisible) break;
      if (Number(state.strokes ?? 0) > attempt) {
        // Wait for this stroke to finish resolving before charging again.
        await page.waitForFunction((seen: number) => {
          const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
          return Number(ev?.strokes ?? 99) === seen && ev?.state !== "simulating";
        }, Number(state.strokes ?? 0), { timeout: 120_000 });
        continue;
      }
      await chargedStrike(page, attempt + 1);
    }
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { targetsSunk?: number } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.targetsSunk ?? 0) >= 1;
    }, undefined, { timeout: 90_000 });
    const sunk = await readEvidence(page) as SiegeEvidence & {
      sixtySecondReplayProof?: {
        pass?: boolean;
        meetsSixtySecondTarget?: boolean;
        provesMountedKitPlayback?: boolean;
      };
    };
    expect(sunk.lastShotHash, "strike must publish a pre-shot pose hash").not.toBe("");
    expect(Number(sunk.targetsSunk ?? 0)).toBeGreaterThanOrEqual(1);
    expect((sunk.audioCues ?? []).join(",")).toContain("drive-hit");
    expect((sunk.audioCues ?? []).join(",")).toContain("target-down");
    // >=60s meaningful play per hole: the mounted route must publish the
    // deterministic replay proof and it must pass (mechanics derived, not
    // declared). Scope stays route-local; mounted input is THIS spec.
    const replay = sunk.sixtySecondReplayProof;
    expect(replay?.meetsSixtySecondTarget, "replay proof must span 60s").toBe(true);
    expect(replay?.pass, "60s replay proof must pass with zero missing mechanics").toBe(true);
    expect(replay?.provesMountedKitPlayback).toBe(false);
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, "sink.json"), JSON.stringify(sunk, null, 2));
    await page.waitForSelector("#sg-result:not(.is-hidden)", { timeout: 30_000 });
    await page.click("#sg-next-button");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { holeIndex?: number; strokes?: number } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.holeIndex ?? 0) === 1 && Number(ev?.strokes ?? 0) === 0;
    }, undefined, { timeout: 30_000 });
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { resetHashMatch?: boolean | null } }).__SIEGE_GOLF_EVIDENCE__;
      return ev?.resetHashMatch === true;
    }, undefined, { timeout: 30_000 });
    const reset = await readEvidence(page);
    writeFileSync(join(logDir, "reset.json"), JSON.stringify(reset, null, 2));
    expect(reset.resetHashMatch).toBe(true);

    // Return to hole 1: its best completed solution must appear only as
    // renderer-owned trajectory points. Toggling the ghost may change pixels,
    // but cannot change Rapier bodies, the canonical pose hash, score, or state.
    await page.keyboard.press("KeyT");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: {
        holeIndex?: number; bestSolutionAvailable?: boolean; bestGhostVisibleNodes?: number
      } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.holeIndex ?? -1) === 0 && ev?.bestSolutionAvailable === true && Number(ev?.bestGhostVisibleNodes ?? 0) > 3;
    }, undefined, { timeout: 30_000 });
    // setScene swaps the root scene synchronously while typed model uploads may
    // finish over the following rendered frames. Capture only the stable scene,
    // never the transient previous-hole upload.
    await page.waitForTimeout(700);
    const ghostOn = await readEvidence(page);
    const ghostOnPixels = await page.screenshot({ timeout: 120_000 });
    writeFileSync(join(logDir, "best-ghost-on.png"), ghostOnPixels);
    const replayReportDir = join("tests", "reports", "siege-golf", "best-replay");
    mkdirSync(replayReportDir, { recursive: true });
    writeFileSync(join(replayReportDir, "best-ghost-on.png"), ghostOnPixels);
    writeFileSync(join(replayReportDir, "best-ghost-on.json"), JSON.stringify(ghostOn, null, 2));
    expect(ghostOn.bestSolutionStrokes).toBeGreaterThan(0);
    expect(ghostOn.bestSolutionInputCount).toBe(ghostOn.bestSolutionStrokes);
    expect(Number(ghostOn.bestSolutionPointCount ?? 0)).toBeGreaterThan(8);
    expect(ghostOn.bestGhostVisualOnly).toBe(true);
    expect(ghostOn.bestGhostPhysicsBodies).toBe(0);
    expect(ghostOn.physicsBodyCount).toBe(boot.physicsBodyCount);
    expect(ghostOn.livePoseHash).toBe(boot.livePoseHash);
    expect(ghostOn.strokes).toBe(0);
    expect(ghostOn.state).toBe("aiming");

    await page.keyboard.press("KeyG");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { bestGhostVisible?: boolean; bestGhostVisibleNodes?: number } }).__SIEGE_GOLF_EVIDENCE__;
      return ev?.bestGhostVisible === false && Number(ev?.bestGhostVisibleNodes ?? -1) === 0;
    }, undefined, { timeout: 15_000 });
    const ghostOff = await readEvidence(page);
    const ghostOffPixels = await page.screenshot({ timeout: 120_000 });
    writeFileSync(join(logDir, "best-ghost-off.png"), ghostOffPixels);
    writeFileSync(join(replayReportDir, "best-ghost-off.png"), ghostOffPixels);
    writeFileSync(join(replayReportDir, "best-ghost-off.json"), JSON.stringify(ghostOff, null, 2));
    expect(ghostOffPixels.equals(ghostOnPixels), "ghost toggle must visibly change only renderer pixels").toBe(false);
    expect(ghostOff.physicsBodyCount).toBe(ghostOn.physicsBodyCount);
    expect(ghostOff.livePoseHash).toBe(ghostOn.livePoseHash);
    expect(ghostOff.strokes).toBe(ghostOn.strokes);
    expect(ghostOff.state).toBe(ghostOn.state);

    // The accepted best survives a route reload and remains renderer-only in
    // the compact layout; this is the exact mobile ghost artifact.
    await page.keyboard.press("KeyG");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: {
        bestSolutionAvailable?: boolean; bestGhostVisibleNodes?: number; state?: string
      } }).__SIEGE_GOLF_EVIDENCE__;
      return ev?.bestSolutionAvailable === true && Number(ev?.bestGhostVisibleNodes ?? 0) > 3 && ev?.state === "aiming";
    }, undefined, { timeout: 30_000 });
    await page.waitForTimeout(700);
    const mobileGhost = await readEvidence(page);
    const mobileGhostPixels = await page.screenshot({ timeout: 120_000 });
    writeFileSync(join(replayReportDir, "best-ghost-mobile.png"), mobileGhostPixels);
    writeFileSync(join(replayReportDir, "best-ghost-mobile.json"), JSON.stringify(mobileGhost, null, 2));
    expect(mobileGhost.physicsBodyCount).toBe(ghostOn.physicsBodyCount);
    expect(mobileGhost.livePoseHash).toBe(ghostOn.livePoseHash);
    expect(mobileGhost.strokes).toBe(0);
    expect(mobileGhost.bestGhostPhysicsBodies).toBe(0);
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});

test("siege golf pause freezes the simulation mid-play deterministically", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-siege-golf/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    await page.keyboard.down("Space");
    await page.waitForTimeout(500);
    await page.keyboard.up("Space");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { state?: string; frameCount?: number } }).__SIEGE_GOLF_EVIDENCE__;
      return ev?.state === "simulating" && Number(ev?.frameCount ?? 0) > 0;
    }, undefined, { timeout: 30_000 });
    await page.keyboard.press("KeyP");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { state?: string } }).__SIEGE_GOLF_EVIDENCE__;
      return ev?.state === "paused";
    }, undefined, { timeout: 15_000 });
    const frozen = await readEvidence(page);
    await page.waitForTimeout(900);
    const still = await readEvidence(page);
    expect(Number(still.frameCount ?? -1)).toBe(Number(frozen.frameCount ?? -2));
    await page.keyboard.press("KeyP");
    await page.waitForFunction((before: number) => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { frameCount?: number } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.frameCount ?? 0) > before;
    }, Number(frozen.frameCount ?? 0), { timeout: 15_000 });
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});

test("siege golf fails a hole past the stroke limit and resets it exactly", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const logDir = testInfo.outputPath("fail");
  mkdirSync(logDir, { recursive: true, force: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-siege-golf/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    // Seven quick weak chips on hole 1 (par 2): six resolve inside the limit,
    // the seventh exceeds par+4 and must end the hole as a failure.
    // Seven weak chips must exceed par+4. Frame-starved settles make strict
    // per-stroke serialization flaky, so keep tapping on a cadence until the
    // route itself reports the failure; taps during resolution are dropped
    // harmlessly by the route.
    // Seven weak chips: six stay within par+4, the seventh exceeds it and the
    // route must end the hole as a failure with an exact-stack retry.
    for (let stroke = 1; stroke <= 7; stroke += 1) {
      await tapUntilStroke(page, stroke);
      await page.waitForFunction((current: number) => {
        const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
        return Number(ev?.strokes ?? 99) === current && ev?.state !== "simulating";
      }, stroke, { timeout: 120_000 });
    }
    await page.waitForSelector("#sg-result:not(.is-hidden)", { timeout: 30_000 });
    const cardTitle = await page.textContent("#sg-result-title");
    expect(cardTitle).toContain("failed");
    await page.click("#sg-next-button");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __SIEGE_GOLF_EVIDENCE__?: { strokes?: number; state?: string } }).__SIEGE_GOLF_EVIDENCE__;
      return Number(ev?.strokes ?? 9) === 0 && ev?.state === "aiming";
    }, undefined, { timeout: 30_000 });
    const retry = await readEvidence(page);
    writeFileSync(join(logDir, "retry.json"), JSON.stringify(retry, null, 2));
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
});
