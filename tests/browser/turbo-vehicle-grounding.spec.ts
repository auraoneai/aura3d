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
  readonly active: boolean;
  readonly contactCount: number;
  readonly contactFrames: number;
  readonly maximumPenetration: number;
  readonly currentPenetration: number;
  readonly minimumCenterSeparation: number;
  readonly centerSeparation: number;
  readonly lastImpact: null | {
    readonly frame: number;
    readonly relativeClosingSpeed: number;
    readonly playerSpeedBefore: number;
    readonly playerSpeedAfter: number;
    readonly opponentSpeedBefore: number;
    readonly opponentSpeedAfter: number;
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
    expect(vehicleContact.solverPositionsFeedGameplayState).toBe(true);
    expect(vehicleContact.centerSeparation).toBeGreaterThanOrEqual(vehicleContact.minimumCenterSeparation - 0.01);
    expect(vehicleContact.maximumPenetration).toBeLessThan(0.04);

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
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
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
      return (value?.vehicleContact?.contactFrames ?? 0) >= 8 && value?.vehicleContact?.active === true;
    }, GLOBAL_NAME, { timeout: 30_000, polling: "raf" });
    const impact = (await readEvidence(page)).vehicleContact as VehicleContactEvidence;
    await page.screenshot({ path: join(REPORT_DIR, "turbo-direct-impact-contact.png") });

    await page.keyboard.up("KeyW");
    await page.waitForFunction((name) => {
      const value = (window as unknown as Record<string, { vehicleContact?: VehicleContactEvidence } | undefined>)[name];
      const contact = value?.vehicleContact;
      return Boolean(contact && !contact.active && contact.centerSeparation >= contact.minimumCenterSeparation + 0.12);
    }, GLOBAL_NAME, { timeout: 20_000, polling: "raf" });
    const separated = (await readEvidence(page)).vehicleContact as VehicleContactEvidence;
    await page.screenshot({ path: join(REPORT_DIR, "turbo-direct-impact-separated.png") });

    writeFileSync(join(REPORT_DIR, "turbo-direct-impact.json"), `${JSON.stringify({
      schema: "aura3d-turbo-direct-impact/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/turbo-vehicle-grounding.spec.ts",
      approach,
      impact,
      separated,
      consoleErrors
    }, null, 2)}\n`);

    expect(consoleErrors).toEqual([]);
    expect(impact.system).toBe("game.collisionWorld:Rapier");
    expect(impact.solverPositionsFeedGameplayState).toBe(true);
    expect(impact.active).toBe(true);
    expect(impact.contactFrames).toBeGreaterThanOrEqual(8);
    // A solver may finish an impact at exact touching contact, so residual overlap
    // is not required. The bound rejects visible interpenetration; onset telemetry,
    // closing speed, impulse response and subsequent separation prove the impact.
    expect(impact.maximumPenetration).toBeLessThan(0.04);
    expect(impact.centerSeparation).toBeGreaterThanOrEqual(impact.minimumCenterSeparation - 0.01);
    expect(impact.lastImpact).not.toBeNull();
    expect(impact.lastImpact!.racingLineOffset, "impact must be direct rather than a lateral glance").toBeLessThanOrEqual(0.02);
    expect(impact.lastImpact!.relativeClosingSpeed, "player must close on the rival before impact").toBeGreaterThan(0.25);
    expect(impact.lastImpact!.playerSpeedAfter, "impact must reduce player speed").toBeLessThan(impact.lastImpact!.playerSpeedBefore);
    expect(Math.abs(impact.lastImpact!.contactNormal[1]), "contact normal must remain in the road plane").toBeLessThanOrEqual(0.001);
    expect(separated.active).toBe(false);
    expect(separated.centerSeparation).toBeGreaterThan(impact.centerSeparation + 0.1);
    expect(approach.active).toBe(false);
    expect(approach.contactFrames).toBe(0);
    expect(approach.centerSeparation).toBeGreaterThan(approach.minimumCenterSeparation + 0.12);
  } finally {
    await page.keyboard.up("KeyW").catch(() => undefined);
    await server?.close();
  }
});
