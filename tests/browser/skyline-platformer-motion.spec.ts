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

interface PhysicalCharacterEvidence {
  readonly classification: string;
  readonly transformAuthority: string;
  readonly handIntegratedPlayerTransform: boolean;
  readonly expectedApexGameUnits: number;
  readonly owns: readonly string[];
  readonly authoredByRoute: readonly string[];
  readonly solver: {
    readonly backend: string;
    readonly colliderCount: number;
    readonly platformColliderCount: number;
    readonly liftColliderCount: number;
    readonly fixedStepSeconds: number;
    readonly maxCatchUpSteps: number;
    readonly steps: number;
    readonly droppedSteps: number;
    readonly sceneUnitsPerGameUnit: number;
    readonly capsuleRadiusScene: number;
    readonly capsuleHalfHeightScene: number;
    readonly characterMassKg: number;
    readonly surfaceFriction: number;
    readonly characterFriction: number;
    readonly restitution: number;
    readonly gravity: readonly number[];
  };
  readonly observed: {
    readonly maxAuthorityDriftGameUnits: number;
    readonly lastAuthorityDriftGameUnits: number;
    readonly solverSteps: number;
    readonly solverGroundedFrames: number;
    readonly solverAirborneFrames: number;
    readonly solverCollisionFrames: number;
    readonly respawnTeleportsApplied: number;
    readonly desyncRecoveries: number;
    readonly liftCarriedSteps: number;
    readonly airborneTransitions: number;
    readonly solverLandings: number;
    readonly lastJumpApexGameUnits: number;
    readonly maxJumpApexGameUnits: number;
    readonly maxDescentSpeedGameUnitsPerSecond: number;
  };
}

interface SolverDiagnostics {
  readonly backend: string;
  readonly solverScenePosition: readonly number[];
  readonly renderedScenePosition: readonly number[];
  readonly feetToCapsuleCentreScene: number;
  readonly solverToRenderedSceneDistance: number;
  readonly grounded: boolean;
  readonly solverSteps: number;
  readonly lastAuthorityDriftGameUnits: number;
  readonly finite: boolean;
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
    const physical = final.physicalCharacter as PhysicalCharacterEvidence;
    const solverDiagnostics = (final.diagnostics as { physicalCharacter?: SolverDiagnostics })
      ?.physicalCharacter as SolverDiagnostics;
    const finalPlayer = final.player as { x: number; y: number; grounded: boolean };
    const stepsBeforeReset = physical.observed.solverSteps;

    /*
     * Reset with a real key press. A solver-owned character cannot be restarted by moving
     * its mesh: the capsule, its queued kinematic step, the scripted lift clock and the
     * measured velocity all have to come back, or the runner is dragged toward wherever the
     * pre-reset movement was headed.
     */
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(2600);
    const afterReset = await readEvidence(page);
    const resetPhysical = afterReset.physicalCharacter as PhysicalCharacterEvidence;
    const resetPlayer = afterReset.player as { x: number; y: number; grounded: boolean };
    const resetDiagnostics = (afterReset.diagnostics as { physicalCharacter?: SolverDiagnostics })
      ?.physicalCharacter as SolverDiagnostics;
    await page.screenshot({ path: join(REPORT_DIR, "skyline-after-reset.png") });

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
      physics: final.physics,
      physicalCharacter: physical,
      solverDiagnostics,
      resetProof: {
        stepsBeforeReset,
        stepsAfterReset: resetPhysical.observed.solverSteps,
        playerBeforeReset: finalPlayer,
        playerAfterReset: resetPlayer,
        driftAfterResetGameUnits: resetPhysical.observed.lastAuthorityDriftGameUnits,
        solverToRenderedSceneDistanceAfterReset: resetDiagnostics?.solverToRenderedSceneDistance,
        finiteAfterReset: resetDiagnostics?.finite
      },
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

    /*
     * ---------------------------------------------------------------------------
     * The same defects, now attributed to the solver that owns the character.
     *
     * Everything above can be satisfied by a route that hand-integrates a position and
     * guesses at grounding. These checks are about *who* answered: the numbers below only
     * exist if Rapier resolved the capsule against the certified colliders, and the
     * rendered pose only matches the solver pose if nobody wrote a second transform.
     */

    // The machine-readable physics identity siblings publish.
    expect(String(final.physics)).toMatch(/^physics\.world:Rapier\(/);
    expect(physical.classification).toBe("hybrid authored gameplay + Rapier collision");
    expect(physical.transformAuthority).toBe("rapier");
    expect(physical.handIntegratedPlayerTransform).toBe(false);
    expect(physical.owns).toEqual(expect.arrayContaining([
      expect.stringMatching(/position/i),
      expect.stringMatching(/ground/i),
      expect.stringMatching(/landing|snap/i)
    ]));
    expect(physical.authoredByRoute).toEqual(expect.arrayContaining([
      expect.stringMatching(/intent/i),
      expect.stringMatching(/coyote|buffer/i)
    ]));

    // A real collider world, built from the level's own certified surfaces plus the
    // scripted lifts and the capsule itself.
    expect(physical.solver.backend).toBe("rapier");
    expect(physical.solver.colliderCount)
      .toBe(physical.solver.platformColliderCount + physical.solver.liftColliderCount + 1);
    expect(physical.solver.platformColliderCount).toBeGreaterThan(40);
    expect(physical.solver.liftColliderCount).toBeGreaterThanOrEqual(2);
    // Deliberate contact properties, not defaults nobody thought about.
    expect(physical.solver.surfaceFriction).toBeGreaterThan(0.5);
    expect(physical.solver.characterFriction).toBeGreaterThan(0);
    expect(physical.solver.restitution).toBe(0);
    expect(physical.solver.characterMassKg).toBeGreaterThan(1);
    expect(physical.solver.capsuleRadiusScene).toBeGreaterThan(0);
    expect(physical.solver.capsuleHalfHeightScene).toBeGreaterThan(0);

    // Fixed 1/60 timestep, and a bounded catch-up so a suspended tab cannot buy a teleport.
    expect(physical.solver.fixedStepSeconds).toBeCloseTo(1 / 60, 10);
    expect(physical.solver.maxCatchUpSteps).toBeGreaterThanOrEqual(1);
    expect(physical.solver.maxCatchUpSteps).toBeLessThanOrEqual(8);

    // The solver ran while the player drove the character with real keys.
    expect(physical.observed.solverSteps, "the solver never advanced during real key input").toBeGreaterThan(30);
    expect(physical.solver.steps).toBe(physical.observed.solverSteps);
    expect(physical.observed.solverGroundedFrames)
      .toBeGreaterThan(physical.observed.solverAirborneFrames * 0.5);

    // Grounding is reported by the solver, and it agrees with the samples taken from keys.
    expect(solverDiagnostics.backend).toBe("rapier");
    expect(solverDiagnostics.finite, "non-finite solver or rendered transform").toBe(true);
    expect(solverDiagnostics.solverSteps).toBe(physical.observed.solverSteps);
    // One transform authority: the drawn feet and the solver's capsule feet are the same
    // point, so the residual is the feet-to-centre offset and nothing else.
    expect(solverDiagnostics.solverToRenderedSceneDistance).toBeLessThan(0.005);

    /*
     * The jump arc and the landing were resolved by contacts, not by a hand-written y.
     *
     * A jump that never becomes airborne, or an airborne phase that never becomes
     * supported again, is the "unreliable landing" complaint in solver terms.
     */
    expect(physical.observed.airborneTransitions, "no jump ever left the solver's ground").toBeGreaterThan(0);
    expect(physical.observed.solverLandings, "the solver never put the runner back on a surface").toBeGreaterThan(0);
    expect(physical.observed.maxJumpApexGameUnits, "the resolved jump had no height").toBeGreaterThan(0.05);
    // The arc stays proportionate to the level's own tallest step, exactly as the motion
    // report requires of the authored tuning.
    expect(physical.observed.maxJumpApexGameUnits)
      .toBeLessThan(motion.geometry.maxRise * 2.6 + physical.solver.capsuleHalfHeightScene);
    expect(physical.observed.maxDescentSpeedGameUnitsPerSecond).toBeGreaterThan(0);
    expect(Number.isFinite(physical.observed.maxDescentSpeedGameUnitsPerSecond)).toBe(true);

    // The authored analytic answer and the solver's answer stay neighbours. A drift of a
    // whole body would mean the visible level and the collision world disagree.
    expect(physical.observed.maxAuthorityDriftGameUnits).toBeLessThan(0.25);
    expect(physical.observed.desyncRecoveries, "the solver had to be re-anchored mid-run").toBe(0);

    // Reset restored the full physical state, not just the drawn mesh.
    expect(resetPhysical.observed.solverSteps, "the solver stopped after reset").toBeGreaterThan(stepsBeforeReset);
    const startPlayer = initial.player as { x: number; y: number };
    expect(Math.abs(resetPlayer.x - startPlayer.x), "reset did not return the runner to the authored start")
      .toBeLessThan(0.2);
    expect(Math.abs(resetPlayer.y - startPlayer.y)).toBeLessThan(0.2);
    expect(resetPhysical.observed.lastAuthorityDriftGameUnits).toBeLessThan(0.25);
    expect(resetDiagnostics.finite).toBe(true);
    expect(resetDiagnostics.solverToRenderedSceneDistance).toBeLessThan(0.005);
    expect(resetPlayer.grounded, "the reset character is not standing on its spawn surface").toBe(true);
  } finally {
    await server?.close();
  }
});
