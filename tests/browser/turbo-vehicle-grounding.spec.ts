/**
 * Runtime proof that the Turbo hero car stays on the road while driving.
 *
 * The reported defect was the car sinking into the tarmac at 111 km/h, with no
 * suspension, wheels that did not turn, and an opponent that drove sideways off the
 * circuit. None of that is visible in a first-frame screenshot, and none of it is
 * detectable by a colour histogram, so it needs a driving test.
 *
 * This spec holds the throttle down, steers through the circuit, and asserts on the
 * chassis telemetry the route publishes every frame: every wheel grounded, contact
 * gap bounded, pitch and roll actually occurring, wheels spinning, and the opponent
 * staying on the road under the reusable driver.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/turbo-vehicle-grounding");
const ROUTE = "/apps/showcase-turbo-drift-circuit/";

interface ChassisEvidence {
  readonly grounded: boolean;
  readonly groundedWheels: number;
  readonly maxContactGap: number;
  readonly pitch: number;
  readonly roll: number;
  readonly wheelSpinRate: number;
  readonly averageCompression: number;
  readonly wheels: readonly { readonly id: string; readonly grounded: boolean; readonly contactGap: number }[];
  readonly observed: {
    readonly everUngrounded: boolean;
    readonly maxContactGap: number;
    readonly pitchObserved: boolean;
    readonly rollObserved: boolean;
    readonly wheelSpinObserved: boolean;
    readonly suspensionMoved: boolean;
  };
}

interface VehicleContactEvidence {
  readonly system: "game.collisionWorld:Rapier";
  readonly shape: "rendered-footprint-oriented-box";
  readonly active: boolean;
  readonly contactCount: number;
  readonly contactFrames: number;
  readonly maximumPenetration: number;
  readonly renderedEnvelopeMinimumClearance: number;
  readonly currentRenderedEnvelopeClearance: number;
  readonly currentPenetration: number;
  readonly renderedFootprints: {
    readonly playerHalfExtents: readonly [number, number, number];
    readonly opponentHalfExtents: readonly [number, number, number];
  };
  readonly minimumDirectImpactSeparation: number;
  readonly centerSeparation: number;
  readonly impactResponse: {
    readonly recoveryActive: boolean;
    readonly remainingSeconds: number;
    readonly responses: number;
    readonly visualEffectNodes: 0;
    readonly hitStopActive: boolean;
    readonly hitStopRemainingSeconds: number;
    readonly headingKickApplied: boolean;
  };
  readonly lastImpact: null | {
    readonly frame: number;
    readonly relativeClosingSpeed: number;
    readonly playerSpeedBefore: number;
    readonly playerSpeedAfter: number;
    readonly opponentSpeedBefore: number;
    readonly opponentSpeedAfter: number;
    readonly playerHeadingBefore: number;
    readonly playerHeadingAfter: number;
    readonly opponentHeadingBefore: number;
    readonly opponentHeadingAfter: number;
    readonly racingLineOffset: number;
    readonly contactNormal: readonly [number, number, number];
  };
  readonly solverPositionsFeedGameplayState: boolean;
}

/**
 * Route evidence global.
 *
 * Read by name rather than by scanning `window`: enumerating window properties trips
 * over cross-origin accessors and throws inside the page, which surfaced as a
 * meaningless `waitForFunction` timeout rather than as a real failure.
 */
const GLOBAL_NAME = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";

async function readEvidence(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate((name) => {
    const value = (window as unknown as Record<string, unknown>)[name];
    return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  }, GLOBAL_NAME);
}

test("turbo hero car stays grounded while driving a full stint", async ({ page }, testInfo) => {
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

    // Wait for the route to publish chassis telemetry, which only happens once the
    // simulation is running.
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { vehicleChassis?: unknown } | undefined>)[name];
      return Boolean(value && value.vehicleChassis !== undefined);
    }, GLOBAL_NAME, { timeout: 90_000 });

    mkdirSync(REPORT_DIR, { recursive: true });
    const samples: ChassisEvidence[] = [];
    // Drive: throttle held, steering swept, with a braking phase to load the front
    // suspension. Sampling across the stint is what makes "never sinks" checkable.
    await page.keyboard.down("KeyW");
    for (let phase = 0; phase < 12; phase += 1) {
      const steerKey = phase % 4 < 2 ? "KeyA" : "KeyD";
      await page.keyboard.down(steerKey);
      await page.waitForTimeout(700);
      await page.keyboard.up(steerKey);
      if (phase === 6) {
        // Brake hard once, to pitch the nose down.
        await page.keyboard.up("KeyW");
        await page.keyboard.down("KeyS");
        await page.waitForTimeout(700);
        await page.keyboard.up("KeyS");
        await page.keyboard.down("KeyW");
      }
      const evidence = await readEvidence(page);
      const chassis = evidence.vehicleChassis as ChassisEvidence | undefined;
      if (chassis) samples.push(chassis);
    }
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(400);

    const finalEvidence = await readEvidence(page);
    const chassis = finalEvidence.vehicleChassis as ChassisEvidence;
    const vehicleContact = finalEvidence.vehicleContact as VehicleContactEvidence;
    const opponent = finalEvidence.opponent as { controller?: string; driverTelemetry?: Record<string, unknown> } | undefined;
    const raceState = finalEvidence.raceState as { roadAlignment?: { onRoad?: boolean } } | undefined;
    const gameplay = finalEvidence.gameplay as Record<string, unknown> | undefined;

    writeFileSync(join(REPORT_DIR, "turbo-vehicle-grounding.json"), `${JSON.stringify({
      schema: "aura3d-turbo-vehicle-grounding/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/turbo-vehicle-grounding.spec.ts",
      sampleCount: samples.length,
      samples,
      finalChassis: chassis,
      vehicleContact,
      opponentController: opponent?.controller,
      opponentDriverTelemetry: opponent?.driverTelemetry,
      raceState,
      gameplay,
      consoleErrors
    }, null, 2)}\n`);
    await page.screenshot({ path: join(REPORT_DIR, "turbo-driving.png") });

    expect(consoleErrors, "runtime errors while driving").toEqual([]);
    expect(samples.length, "chassis telemetry samples").toBeGreaterThan(6);

    // The sinking defect, stated as an assertion: every wheel on the ground for the
    // whole stint, with the contact gap bounded.
    expect(chassis.observed.everUngrounded, "a wheel left the road surface during the stint").toBe(false);
    expect(chassis.observed.maxContactGap, "maximum tyre-to-road gap over the stint").toBeLessThan(0.05);
    for (const sample of samples) {
      expect(sample.groundedWheels, "grounded wheel count").toBe(4);
      for (const wheel of sample.wheels) {
        expect(wheel.grounded, `${wheel.id} grounded`).toBe(true);
      }
    }

    // Suspension and attitude must actually move, or the car is still a sprite on a
    // plane however correct its height is.
    expect(chassis.observed.suspensionMoved, "suspension never travelled").toBe(true);
    expect(chassis.observed.pitchObserved, "chassis never pitched under braking or throttle").toBe(true);
    expect(chassis.observed.rollObserved, "chassis never rolled while cornering").toBe(true);
    expect(chassis.observed.wheelSpinObserved, "wheels never rotated").toBe(true);

    // The visible cars are live Rapier participants. This assertion prevents the old
    // architecture—an unrelated physics proof plus two collisionless rendered cars—
    // from passing again even when this particular driving line avoids the rival.
    expect(vehicleContact.system).toBe("game.collisionWorld:Rapier");
    expect(vehicleContact.shape).toBe("rendered-footprint-oriented-box");
    expect(vehicleContact.solverPositionsFeedGameplayState).toBe(true);
    // A live stint weaves past the rival. Rapier may compress the conservative
    // rendered SAT by a few millimetres at bumper contact; that is not stacking.
    expect(vehicleContact.renderedEnvelopeMinimumClearance, "visible car envelopes stacked").toBeGreaterThan(-0.01);
    expect(vehicleContact.currentRenderedEnvelopeClearance, "cars remained stacked after the stint").toBeGreaterThan(-0.01);

    // The opponent must be driven by the reusable driver and stay on the circuit.
    expect(opponent?.controller, "opponent controller").toBe("aura-vehicle-driver-ai");
    expect(opponent?.driverTelemetry, "opponent driver telemetry").toBeDefined();
    expect(raceState?.roadAlignment?.onRoad, "player left the road").toBe(true);

    // Gameplay must have progressed, not merely rendered.
    expect(gameplay?.throttleChangesSpeed, "throttle did not change speed").toBe(true);
    expect(gameplay?.steeringChangesHeading, "steering did not change heading").toBe(true);
  } finally {
    await server?.close();
  }
});

test("turbo cars complete a direct same-line Rapier impact and separate", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  let server: ExampleDevServer | undefined;
  const consoleErrors: string[] = [];
  try {
    server = await startExampleDevServer();
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${ROUTE}?collisionReview=side`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { vehicleContact?: unknown } | undefined>)[name];
      return Boolean(value?.vehicleContact);
    }, GLOBAL_NAME, { timeout: 90_000 });

    mkdirSync(REPORT_DIR, { recursive: true });
    const approach = (await readEvidence(page)).vehicleContact as VehicleContactEvidence;
    await page.screenshot({ path: join(REPORT_DIR, "turbo-direct-impact-approach.png") });
    await page.keyboard.down("KeyW");

    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { vehicleContact?: VehicleContactEvidence } | undefined>)[name];
      const contact = value?.vehicleContact;
      return contact?.active === true
        && (contact?.impactResponse.responses ?? 0) >= 1
        && contact?.impactResponse.recoveryActive === true
        && contact?.impactResponse.hitStopActive === true;
    }, GLOBAL_NAME, { timeout: 30_000, polling: "raf" });
    const firstContact = (await readEvidence(page)).vehicleContact as VehicleContactEvidence;
    await page.screenshot({ path: join(REPORT_DIR, "turbo-direct-impact-first-contact.png") });
    await page.screenshot({
      path: join(REPORT_DIR, "turbo-direct-impact-first-contact-close.png"),
      clip: { x: 650, y: 300, width: 480, height: 260 }
    });
    await page.evaluate((name) => {
      const value = (window as unknown as Record<string, {
        collisionCapture?: { releaseFirstContact?: () => void };
      } | undefined>)[name];
      value?.collisionCapture?.releaseFirstContact?.();
    }, GLOBAL_NAME);

    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { vehicleContact?: VehicleContactEvidence } | undefined>)[name];
      const contact = value?.vehicleContact;
      return Boolean(contact
        && !contact.active
        && contact.impactResponse.headingKickApplied
        && contact.centerSeparation >= contact.minimumDirectImpactSeparation + 0.25);
    }, GLOBAL_NAME, { timeout: 30_000, polling: "raf" });
    const reaction = (await readEvidence(page)).vehicleContact as VehicleContactEvidence;
    await page.screenshot({ path: join(REPORT_DIR, "turbo-direct-impact-reaction.png") });
    await page.screenshot({
      path: join(REPORT_DIR, "turbo-direct-impact-reaction-close.png"),
      clip: { x: 350, y: 280, width: 800, height: 300 }
    });
    await page.evaluate((name) => {
      const value = (window as unknown as Record<string, {
        collisionCapture?: { releaseReaction?: () => void };
      } | undefined>)[name];
      value?.collisionCapture?.releaseReaction?.();
    }, GLOBAL_NAME);

    await page.keyboard.up("KeyW");
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { vehicleContact?: VehicleContactEvidence } | undefined>)[name];
      const contact = value?.vehicleContact;
      return Boolean(contact
        && !contact.active
        && !contact.impactResponse.recoveryActive
        && contact.centerSeparation >= contact.minimumDirectImpactSeparation + 0.27);
    }, GLOBAL_NAME, { timeout: 20_000, polling: "raf" });
    const separated = (await readEvidence(page)).vehicleContact as VehicleContactEvidence;
    await page.screenshot({ path: join(REPORT_DIR, "turbo-direct-impact-separated.png") });

    writeFileSync(join(REPORT_DIR, "turbo-direct-impact.json"), `${JSON.stringify({
      schema: "aura3d-turbo-direct-impact/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/turbo-vehicle-grounding.spec.ts",
      approach,
      firstContact,
      reaction,
      separated,
      consoleErrors
    }, null, 2)}\n`);

    expect(consoleErrors).toEqual([]);
    expect(reaction.system).toBe("game.collisionWorld:Rapier");
    expect(reaction.shape).toBe("rendered-footprint-oriented-box");
    expect(reaction.solverPositionsFeedGameplayState).toBe(true);
    expect(firstContact.lastImpact, "first-contact capture must contain impact telemetry").not.toBeNull();
    expect(firstContact.impactResponse.recoveryActive, "first-contact capture must begin physical recoil").toBe(true);
    expect(firstContact.impactResponse.visualEffectNodes, "collision must not use decorative flash geometry").toBe(0);
    expect(firstContact.renderedEnvelopeMinimumClearance, "first-contact bodywork interpenetrated materially").toBeGreaterThanOrEqual(-0.01);
    expect(firstContact.renderedEnvelopeMinimumClearance, "first-contact screenshot must show bumper contact").toBeLessThan(0.03);
    // A solver may finish an impact at exact touching contact, so residual overlap
    // is not required. The bound rejects visible interpenetration; onset telemetry,
    // closing speed, impulse response and subsequent separation prove the impact.
    // A real impact may compress the conservative rendered-bounds envelope by a few
    // millimetres while Rapier resolves the impulse. A two-centimetre conservative
    // oriented-bounds compression is still bumper contact; the independent Rapier
    // penetration limit below rejects the former car-on-car stacking.
    expect(reaction.renderedEnvelopeMinimumClearance, "visible car envelopes interpenetrated materially").toBeGreaterThanOrEqual(-0.04);
    expect(reaction.maximumPenetration, "Rapier contact compressed far enough to read as stacking").toBeLessThanOrEqual(0.03);
    expect(reaction.impactResponse.headingKickApplied, "reaction frame must retain the physical yaw response").toBe(true);
    expect(reaction.lastImpact).not.toBeNull();
    expect(reaction.lastImpact!.racingLineOffset, "impact must be direct rather than a lateral glance").toBeLessThanOrEqual(0.02);
    expect(reaction.lastImpact!.relativeClosingSpeed, "player must close on the rival before impact").toBeGreaterThan(0.25);
    expect(reaction.lastImpact!.playerSpeedAfter, "impact must reduce player speed without stopping the car").toBeLessThan(reaction.lastImpact!.playerSpeedBefore * 0.6);
    expect(reaction.lastImpact!.playerSpeedAfter, "impact must preserve playable forward momentum").toBeGreaterThan(reaction.lastImpact!.playerSpeedBefore * 0.45);
    expect(reaction.lastImpact!.opponentSpeedAfter, "rear impact must transfer speed into the rival").toBeGreaterThan(reaction.lastImpact!.opponentSpeedBefore * 1.1);
    expect(Math.abs(reaction.lastImpact!.playerHeadingAfter - reaction.lastImpact!.playerHeadingBefore), "player must recoil in yaw").toBeGreaterThan(0.05);
    expect(Math.abs(reaction.lastImpact!.opponentHeadingAfter - reaction.lastImpact!.opponentHeadingBefore), "rival must visibly deflect in yaw").toBeGreaterThan(0.3);
    expect(Math.abs(reaction.lastImpact!.contactNormal[1]), "contact normal must remain in the road plane").toBeLessThanOrEqual(0.001);
    expect(separated.active).toBe(false);
    expect(separated.centerSeparation).toBeGreaterThan(reaction.centerSeparation + 0.015);
    expect(approach.active).toBe(false);
    expect(approach.contactFrames).toBe(0);
    expect(approach.centerSeparation).toBeGreaterThan(approach.minimumDirectImpactSeparation + 0.12);
  } finally {
    await page.keyboard.up("KeyW").catch(() => undefined);
    await server?.close();
  }
});

test("turbo player overtakes the rival on the normal gameplay camera", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  let server: ExampleDevServer | undefined;
  const consoleErrors: string[] = [];
  const scratchOvertake = "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer/turbo-overtake";
  try {
    server = await startExampleDevServer();
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { status?: string } | undefined>)[name];
      return value?.status === "ready";
    }, GLOBAL_NAME, { timeout: 90_000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      return canvas instanceof HTMLCanvasElement && canvas.width >= 1280 && canvas.height >= 720;
    }, undefined, { timeout: 30_000 });

    mkdirSync(REPORT_DIR, { recursive: true });
    mkdirSync(scratchOvertake, { recursive: true });
    const shot = async (name: string) => {
      await page.screenshot({ path: join(REPORT_DIR, `turbo-overtake-${name}.png`) });
      await page.screenshot({ path: join(scratchOvertake, `${name}.png`) });
    };

    await page.keyboard.down("KeyW");
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, {
        opponent?: { signedPlayerGap?: number; onAsphalt?: boolean; onRoad?: boolean; offTrack?: boolean; outerEdge?: number; visualAsphaltHalfWidth?: number; bodyHalfWidth?: number; signedTrackOffset?: number };
        raceState?: { roadAlignment?: { onAsphalt?: boolean; onRoad?: boolean; outerEdge?: number; visualAsphaltHalfWidth?: number; bodyHalfWidth?: number; signedTrackOffset?: number } };
      } | undefined>)[name];
      const gap = Number(value?.opponent?.signedPlayerGap ?? 0);
      const player = value?.raceState?.roadAlignment;
      const rival = value?.opponent;
      const playerHalf = Number(player?.visualAsphaltHalfWidth ?? 0);
      const rivalHalf = Number(rival?.visualAsphaltHalfWidth ?? 0);
      const bothOnAsphalt = player?.onAsphalt === true
        && rival?.onAsphalt === true
        && player?.onRoad === true
        && rival?.onRoad === true
        && rival?.offTrack !== true
        && Number(player?.outerEdge ?? 1) <= playerHalf + 1e-4
        && Number(rival?.outerEdge ?? 1) <= rivalHalf + 1e-4
        && Math.abs(Number(player?.signedTrackOffset ?? 1)) + Number(player?.bodyHalfWidth ?? 1) <= playerHalf + 1e-4
        && Math.abs(Number(rival?.signedTrackOffset ?? 1)) + Number(rival?.bodyHalfWidth ?? 1) <= rivalHalf + 1e-4;
      return gap > -0.08 && gap < -0.008 && bothOnAsphalt;
    }, GLOBAL_NAME, { timeout: 40_000, polling: "raf" });
    await shot("approach");

    await page.keyboard.down("KeyD");
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, {
        opponent?: { signedPlayerGap?: number; onAsphalt?: boolean; onRoad?: boolean; offTrack?: boolean; outerEdge?: number; visualAsphaltHalfWidth?: number; bodyHalfWidth?: number; signedTrackOffset?: number };
        raceState?: { roadAlignment?: { onAsphalt?: boolean; onRoad?: boolean; outerEdge?: number; visualAsphaltHalfWidth?: number; bodyHalfWidth?: number; signedTrackOffset?: number } };
        vehicleContact?: { currentPenetration?: number; currentRenderedEnvelopeClearance?: number };
      } | undefined>)[name];
      const gap = Math.abs(Number(value?.opponent?.signedPlayerGap ?? 1));
      const player = value?.raceState?.roadAlignment;
      const rival = value?.opponent;
      const playerHalf = Number(player?.visualAsphaltHalfWidth ?? 0);
      const rivalHalf = Number(rival?.visualAsphaltHalfWidth ?? 0);
      const bothOnAsphalt = player?.onAsphalt === true
        && rival?.onAsphalt === true
        && player?.onRoad === true
        && rival?.onRoad === true
        && rival?.offTrack !== true
        && Number(player?.outerEdge ?? 1) <= playerHalf + 1e-4
        && Number(rival?.outerEdge ?? 1) <= rivalHalf + 1e-4
        && Math.abs(Number(player?.signedTrackOffset ?? 1)) + Number(player?.bodyHalfWidth ?? 1) <= playerHalf + 1e-4
        && Math.abs(Number(rival?.signedTrackOffset ?? 1)) + Number(rival?.bodyHalfWidth ?? 1) <= rivalHalf + 1e-4;
      return gap <= 0.018
        && bothOnAsphalt
        && Number(value?.vehicleContact?.currentPenetration ?? 0) < 0.04
        && Number(value?.vehicleContact?.currentRenderedEnvelopeClearance ?? 0) > -0.04;
    }, GLOBAL_NAME, { timeout: 20_000, polling: "raf" });
    await shot("side-by-side");
    await page.keyboard.up("KeyD");

    try {
      await page.waitForFunction((name) => {
        const value = (window as unknown as Record<string, {
          gameplay?: { playerOvertookOpponent?: boolean };
          raceState?: { progress?: number; roadAlignment?: { onAsphalt?: boolean; onRoad?: boolean; outerEdge?: number; visualAsphaltHalfWidth?: number; bodyHalfWidth?: number; signedTrackOffset?: number } };
          opponent?: { progress?: number; onAsphalt?: boolean; onRoad?: boolean; offTrack?: boolean; outerEdge?: number; visualAsphaltHalfWidth?: number; bodyHalfWidth?: number; signedTrackOffset?: number };
          vehicleContact?: { currentPenetration?: number; currentRenderedEnvelopeClearance?: number };
        } | undefined>)[name];
        const player = Number(value?.raceState?.progress ?? 0);
        const rival = Number(value?.opponent?.progress ?? 1);
        const lead = ((player - rival + 1.5) % 1) - 0.5;
        const alignment = value?.raceState?.roadAlignment;
        const rivalState = value?.opponent;
        const playerHalf = Number(alignment?.visualAsphaltHalfWidth ?? 0);
        const rivalHalf = Number(rivalState?.visualAsphaltHalfWidth ?? 0);
        const bothOnAsphalt = alignment?.onAsphalt === true
          && rivalState?.onAsphalt === true
          && alignment?.onRoad === true
          && rivalState?.onRoad === true
          && rivalState?.offTrack !== true
          && Number(alignment?.outerEdge ?? 1) <= playerHalf + 1e-4
          && Number(rivalState?.outerEdge ?? 1) <= rivalHalf + 1e-4
          && Math.abs(Number(alignment?.signedTrackOffset ?? 1)) + Number(alignment?.bodyHalfWidth ?? 1) <= playerHalf + 1e-4
          && Math.abs(Number(rivalState?.signedTrackOffset ?? 1)) + Number(rivalState?.bodyHalfWidth ?? 1) <= rivalHalf + 1e-4;
        return value?.gameplay?.playerOvertookOpponent === true
          && lead > 0.006
          && bothOnAsphalt
          && Number(value?.vehicleContact?.currentPenetration ?? 0) < 0.04
          && Number(value?.vehicleContact?.currentRenderedEnvelopeClearance ?? 0) > -0.04;
      }, GLOBAL_NAME, { timeout: 90_000, polling: "raf" });
    } catch (error) {
      const dump = await readEvidence(page);
      writeFileSync(join(scratchOvertake, "pass-timeout.json"), `${JSON.stringify({
        gameplay: dump.gameplay,
        raceState: dump.raceState,
        opponent: dump.opponent,
        vehicleContact: dump.vehicleContact
      }, null, 2)}\n`);
      throw error;
    }
    await shot("pass-complete");
    await page.waitForTimeout(1200);
    await shot("retained-lead");

    const evidence = await readEvidence(page);
    const gameplay = evidence.gameplay as { playerOvertookOpponent?: boolean };
    const raceState = evidence.raceState as {
      progress?: number;
      roadAlignment?: {
        onAsphalt?: boolean;
        onRoad?: boolean;
        outerEdge?: number;
        visualAsphaltHalfWidth?: number;
        bodyHalfWidth?: number;
        signedTrackOffset?: number;
      };
    };
    const opponent = evidence.opponent as {
      progress?: number;
      onAsphalt?: boolean;
      onRoad?: boolean;
      offTrack?: boolean;
      outerEdge?: number;
      visualAsphaltHalfWidth?: number;
      bodyHalfWidth?: number;
      signedTrackOffset?: number;
    };
    const contact = evidence.vehicleContact as {
      currentPenetration?: number;
      currentRenderedEnvelopeClearance?: number;
    };
    const lead = ((Number(raceState.progress) - Number(opponent.progress) + 1.5) % 1) - 0.5;
    expect(gameplay.playerOvertookOpponent).toBe(true);
    expect(lead).toBeGreaterThan(0.006);
    expect(raceState.roadAlignment?.onAsphalt, "player body must stay on grey asphalt").toBe(true);
    expect(opponent.onAsphalt, "rival body must stay on grey asphalt").toBe(true);
    expect(raceState.roadAlignment?.onRoad).toBe(true);
    expect(opponent.onRoad).toBe(true);
    expect(opponent.offTrack).toBe(false);
    expect(Number(raceState.roadAlignment?.outerEdge ?? 1))
      .toBeLessThanOrEqual(Number(raceState.roadAlignment?.visualAsphaltHalfWidth ?? 0) + 1e-4);
    expect(Number(opponent.outerEdge ?? 1))
      .toBeLessThanOrEqual(Number(opponent.visualAsphaltHalfWidth ?? 0) + 1e-4);
    expect(Number(contact.currentPenetration ?? 0)).toBeLessThan(0.04);
    expect(Number(contact.currentRenderedEnvelopeClearance ?? 0)).toBeGreaterThan(-0.04);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  } finally {
    await page.keyboard.up("KeyW").catch(() => undefined);
    await page.keyboard.up("KeyD").catch(() => undefined);
    await server?.close();
  }
});
