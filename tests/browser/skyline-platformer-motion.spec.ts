/**
 * Runtime proof that Skyline's jump is grounded in its own level geometry.
 *
 * The reported defects were an unnatural, floaty jump, unreliable landings, a world
 * reading as disconnected strips, and a session ending in 20-30 seconds. Three of those
 * follow from one number: the level shipped `jumpVelocity: 7.4` with the kit default
 * `gravity: -22`, giving a 1.245-unit apex and 0.673s airtime over platforms that step
 * up by 0.216 units.
 *
 * None of that is visible in a screenshot, and no existing gate compared apex height to
 * step height, so it needs a playing test that reads the published motion report and
 * then actually jumps.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/skyline-platformer-motion");
const ROUTE = "/apps/showcase-skyline-runner/";
const GLOBAL_NAME = "__AURA3D_SHOWCASE_SKYLINE_RUNNER__";

interface MotionEvidence {
  readonly gravity: number;
  readonly jumpVelocity: number;
  readonly moveSpeed: number;
  readonly apex: number;
  readonly airtime: number;
  readonly jumpReach: number;
  readonly geometry: { readonly maxRise: number; readonly maxGap: number; readonly courseLength: number };
  readonly estimatedSessionSeconds: number;
  readonly invariants: {
    readonly passes: boolean;
    readonly measured: { readonly apexToRiseRatio: number; readonly airtime: number };
    readonly checks: readonly { readonly id: string; readonly passes: boolean; readonly detail: string }[];
  };
  readonly sessionLengthProof: {
    readonly targetSeconds: number;
    readonly acceptanceWindowSeconds: readonly [number, number];
    readonly achievedEstimateSeconds: number;
    readonly source: string;
  };
}

async function readEvidence(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate((name) => {
    const value = (window as unknown as Record<string, unknown>)[name];
    return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  }, GLOBAL_NAME);
}

test("skyline jump is derived from level geometry and lands reliably", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  let server: ExampleDevServer | undefined;
  const consoleErrors: string[] = [];
  try {
    server = await startExampleDevServer();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/favicon/i.test(message.text())) return;
      consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { motion?: unknown } | undefined>)[name];
      return Boolean(value && value.motion !== undefined);
    }, GLOBAL_NAME, { timeout: 90_000 });

    const initial = await readEvidence(page);
    const motion = initial.motion as MotionEvidence;

    /*
     * Play: run right and jump repeatedly, sampling grounded state so landings can be
     * counted. A jump that never resolves to grounded is the "unreliable landing"
     * complaint stated as a measurement.
     */
    const groundedSamples: boolean[] = [];
    let airborneStreak = 0;
    let maxAirborneStreak = 0;
    await page.keyboard.down("ArrowRight");
    for (let step = 0; step < 60; step += 1) {
      if (step % 5 === 0) {
        await page.keyboard.down("Space");
        await page.waitForTimeout(90);
        await page.keyboard.up("Space");
      }
      await page.waitForTimeout(120);
      const evidence = await readEvidence(page);
      const player = evidence.player as { grounded?: boolean } | undefined;
      const grounded = player?.grounded === true;
      groundedSamples.push(grounded);
      airborneStreak = grounded ? 0 : airborneStreak + 1;
      maxAirborneStreak = Math.max(maxAirborneStreak, airborneStreak);
    }
    await page.keyboard.up("ArrowRight");
    await page.waitForTimeout(400);

    const final = await readEvidence(page);
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(join(REPORT_DIR, "skyline-platformer-motion.json"), `${JSON.stringify({
      schema: "aura3d-skyline-platformer-motion/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/skyline-platformer-motion.spec.ts",
      motion,
      groundedSampleCount: groundedSamples.length,
      groundedSamples: groundedSamples.filter(Boolean).length,
      maxAirborneStreak,
      challenge: final.challenge,
      gameplay: final.gameplay,
      consoleErrors
    }, null, 2)}\n`);
    await page.screenshot({ path: join(REPORT_DIR, "skyline-playing.png") });

    expect(consoleErrors, "runtime errors while playing").toEqual([]);

    // The motion report is the check that did not exist. It must pass.
    expect(motion.invariants.passes, `motion invariants: ${JSON.stringify(motion.invariants.checks.filter((check) => !check.passes))}`).toBe(true);

    // The floating defect stated as arithmetic: the apex must be proportionate to the
    // tallest step the level asks the player to clear.
    expect(motion.apex).toBeLessThan(motion.geometry.maxRise * 2.6);
    expect(motion.invariants.measured.apexToRiseRatio).toBeLessThan(2.6);

    // A jump must still clear the widest gap, or the level becomes unplayable.
    expect(motion.jumpReach).toBeGreaterThan(motion.geometry.maxGap);

    /*
     * Session length must be *derived*, and its limiting factor stated.
     *
     * The rebuilt route owns enough physical course for a responsive 70-to-115-second Level 1.
     * This must be the start-to-finish traversal estimate, not a post-finish timer or
     * repeated opening strip.
     */
    expect(motion.estimatedSessionSeconds).toBeGreaterThanOrEqual(70);
    expect(motion.estimatedSessionSeconds).toBeLessThanOrEqual(115);
    expect(motion.sessionLengthProof.achievedEstimateSeconds).toBeCloseTo(motion.estimatedSessionSeconds, 3);
    expect(motion.sessionLengthProof.source).toBe("physical-start-to-finish-traversal");
    expect(motion.sessionLengthProof.acceptanceWindowSeconds).toEqual([70, 115]);

    // Landing reliability: the player must spend most samples on the ground and never
    // be airborne for an implausibly long run of samples.
    const groundedCount = groundedSamples.filter(Boolean).length;
    expect(groundedCount, "player was almost never grounded while running and jumping").toBeGreaterThan(groundedSamples.length * 0.3);
    expect(maxAirborneStreak, "player stayed airborne for an implausible run of samples").toBeLessThan(groundedSamples.length * 0.5);
  } finally {
    await server?.close();
  }
});
