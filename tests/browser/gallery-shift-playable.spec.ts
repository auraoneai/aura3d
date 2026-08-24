import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Gallery Shift playable evidence (PRD GS-14): WASD movement -> vision-cone
 * intercept raises detection -> occlusion breaks it and the meter drains ->
 * caught fail restarts via R -> scripted lift-all + exit clears floor 1 onto
 * floor 2 (cameras + lasers) -> pause freezes the frame loop.
 *
 * Long waits run through the route's __GS_PUMP__ determinstic stepper
 * (headless rAF throttling makes passive waits useless). Deterministic
 * interception uses the README-documented ?debug=1 test-only teleport.
 */

interface GSEvidence {
  readonly mounted?: boolean;
  readonly floor?: number;
  readonly state?: string;
  readonly exhibitsLifted?: number;
  readonly exhibitsTotal?: number;
  readonly totalExhibitsLifted?: number;
  readonly floorExhibitsTotal?: number;
  readonly alarmActive?: boolean;
  readonly status?: string;
  readonly detection?: number;
  readonly ghostRun?: boolean;
  readonly guardStates?: readonly { id: string; state: string; x: number; z: number; yaw: number }[];
  readonly cameraStates?: readonly { id: string; yaw: number; seesThief: boolean; occluded: boolean }[];
  readonly losRayCount?: number;
  readonly occlusionCount?: number;
  readonly thiefPos?: { x: number; z: number };
  readonly thiefGait?: string;
  readonly backend?: string;
  readonly frameCount?: number;
  readonly sensorEventCount?: number;
  readonly footstepEvents?: number;
  readonly liftProgress?: number;
  readonly audioCues?: readonly string[];
  readonly guardRouteLengths?: readonly number[];
}

const REPORT_DIR = "tests/reports/gallery-shift/playable";
const PRODUCER = "tests/browser/gallery-shift-playable.spec.ts";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|css)$/.test(path) ? [path] : [];
  });
}

function routeSourceBinding(): { readonly files: readonly string[]; readonly sha256: string } {
  const appDir = resolve("apps/showcase-gallery-shift");
  const files = sourceFiles(join(appDir, "src"));
  const hash = createHash("sha256");
  for (const path of files) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return { files: files.map((path) => relative(resolve(), path)), sha256: hash.digest("hex") };
}

async function readEvidence(page: Page): Promise<GSEvidence> {
  return page.evaluate(() => (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: GSEvidence }).__GALLERY_SHIFT_EVIDENCE__ ?? {});
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { status?: string } }).__GALLERY_SHIFT_EVIDENCE__?.status === "ready",
    undefined,
    { timeout: 180_000 }
  );
}

async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __GS_PUMP__?: (frames: number) => number }).__GS_PUMP__?.(count);
  }, frames);
}

async function teleport(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(([tx, tz]) => {
    (window as unknown as { __GS_TELEPORT__?: (x: number, z: number) => unknown }).__GS_TELEPORT__?.(tx, tz);
  }, [x, z]);
}

/**
 * Teleport next to a pedestal and hold E until the route's real lift
 * interaction completes. Teleport clears stale perception accumulation but
 * never awards an exhibit; normal frame updates still own completion.
 */
async function liftAt(page: Page, pedestal: { x: number; z: number }, id: string): Promise<void> {
  const standX = pedestal.x;
  const standZ = pedestal.z + (pedestal.z >= 0 ? -1.2 : 1.2);
  await teleport(page, standX, standZ);
  const baseline = ((await readEvidence(page)).exhibitsLifted ?? 0);
  await page.keyboard.down("KeyE");
  let lifted = false;
  for (let batch = 0; batch < 12 && !lifted; batch += 1) {
    await pump(page, 30);
    const evidence = await readEvidence(page);
    lifted = (evidence.exhibitsLifted ?? 0) > baseline && (evidence.liftProgress ?? 0) === 0;
  }
  await page.keyboard.up("KeyE");
  expect(lifted, `exhibit ${id} must complete its hold-to-lift`).toBe(true);
}

test("gallery shift moves, sees, occludes, catches, restarts, lifts, and exits", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const logDir = testInfo.outputPath("run");
  mkdirSync(logDir, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-gallery-shift/?debug=1", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    const boot = await readEvidence(page);
    expect(boot.backend, "route must run on the rapier backend").toBe("rapier");
    expect(boot.mounted).toBe(true);
    expect(boot.floor).toBe(1);
    expect(boot.exhibitsTotal).toBe(3);
    expect(boot.floorExhibitsTotal).toBe(2);
    expect(boot.state).toBe("playing");

    // --- WASD movement changes position evidence -----------------------------
    const start = await readEvidence(page);
    await pump(page, 30); // settle one deterministic half-second
    await page.keyboard.down("KeyW");
    await pump(page, 60);
    await page.keyboard.up("KeyW");
    const moved = await readEvidence(page);
    expect(moved.thiefPos!.z, "W must move the thief up the hall (-Z)").toBeLessThan(start.thiefPos!.z - 0.5);

    // --- deterministic vision-cone intercept raises detection ----------------
    await pump(page, 30);
    const settled = await readEvidence(page);
    // Guard-1 patrols the west loop: stand 3 m ahead of its facing.
    const intercept = await page.evaluate((fallback) => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: GSEvidence }).__GALLERY_SHIFT_EVIDENCE__;
      const guard = ev?.guardStates?.[0];
      if (!guard) return fallback;
      return { x: guard.x + Math.sin(guard.yaw) * 3, z: guard.z + Math.cos(guard.yaw) * 3 };
    }, { x: -8.5, z: 1.5 });
    await teleport(page, intercept.x, intercept.z);
    let detection = 0;
    for (let batch = 0; batch < 20 && detection < 0.45; batch += 1) {
      await pump(page, 30);
      detection = (await readEvidence(page)).detection ?? 0;
    }
    const seen = await readEvidence(page);
    expect(seen.detection, "standing in a guard cone must fill the meter").toBeGreaterThan(0.4);
    expect(seen.losRayCount, "cone intercepts must spend LOS raycasts").toBeGreaterThan(0);

    // --- occlusion breaks it: behind the wing wall the meter drains ----------
    await teleport(page, -6.5, 0);
    let drained = 1;
    let occluded = 0;
    for (let batch = 0; batch < 40; batch += 1) {
      await pump(page, 40);
      const ev = await readEvidence(page);
      drained = ev.detection ?? 1;
      occluded = ev.occlusionCount ?? 0;
      if (drained < 0.05 && occluded > 0) break;
    }
    const hidden = await readEvidence(page);
    expect(hidden.detection, "a walled-off thief must drain to zero").toBeLessThan(0.05);
    expect(hidden.occlusionCount, "walls must occlude at least one LOS ray").toBeGreaterThan(0);
    expect(hidden.ghostRun, "being seen past suspicious blows the ghost run").toBe(false);

    // --- caught fail -> floor restart via R ----------------------------------
    await pump(page, 30);
    const reintercept = await page.evaluate((fallback) => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: GSEvidence }).__GALLERY_SHIFT_EVIDENCE__;
      const guard = ev?.guardStates?.[0];
      if (!guard) return fallback;
      return { x: guard.x + Math.sin(guard.yaw) * 2.2, z: guard.z + Math.cos(guard.yaw) * 2.2 };
    }, { x: -8.5, z: 1.5 });
    await teleport(page, reintercept.x, reintercept.z);
    let caught = false;
    for (let batch = 0; batch < 40 && !caught; batch += 1) {
      await pump(page, 30);
      caught = (await readEvidence(page)).state === "caught";
    }
    expect(caught, "a held sighting must fill the meter and catch the thief").toBe(true);
    const caughtEvidence = await readEvidence(page);
    expect((caughtEvidence.audioCues ?? []).join(",")).toContain("caught-sting");

    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { state?: string; detection?: number; exhibitsLifted?: number; floor?: number } }).__GALLERY_SHIFT_EVIDENCE__;
      return ev?.state === "playing" && (ev.detection ?? 1) === 0 && (ev.exhibitsLifted ?? -1) === 0 && ev?.floor === 1;
    }, undefined, { timeout: 30_000 });
    const restarted = await readEvidence(page);
    writeFileSync(join(logDir, "after-caught-restart.json"), JSON.stringify(restarted, null, 2));
    writeFileSync(join(REPORT_DIR, "playable.json"), JSON.stringify(restarted, null, 2));

    // --- scripted lift-all + exit win on floor 1 ------------------------------
    const floor1Pedestals = [
      { id: "p1", x: -6.5, z: -4.2 },
      { id: "p2", x: 6.5, z: -4.2 }
    ];
    const routeBefore = (await readEvidence(page)).guardRouteLengths ?? [];
    for (const pedestal of floor1Pedestals) {
      await liftAt(page, pedestal, pedestal.id);
    }
    let allLifted = false;
    for (let batch = 0; batch < 10 && !allLifted; batch += 1) {
      const evidence = await readEvidence(page);
      allLifted = (evidence.exhibitsLifted ?? 0) === 2;
    }
    expect(allLifted, "both floor-1 exhibits must be lifted").toBe(true);
    const liftedEvidence = await readEvidence(page);
    expect((liftedEvidence.audioCues ?? []).join(",")).toContain("exhibit-lift");
    const routeAfter = liftedEvidence.guardRouteLengths ?? [];
    for (const [index, length] of routeAfter.entries()) {
      expect(length, "guard patrol routes must grow after the lifts").toBeGreaterThan(routeBefore[index] ?? 0);
    }

    // Exit sensor only completes the floor with every exhibit lifted.
    await teleport(page, 0, -6.3);
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { floor?: number; exhibitsLifted?: number; state?: string } }).__GALLERY_SHIFT_EVIDENCE__;
      return ev?.floor === 2 && (ev?.exhibitsLifted ?? -1) === 0 && ev?.state === "playing";
    }, undefined, { timeout: 30_000 });
    const floor2 = await readEvidence(page);
    expect(floor2.floor).toBe(2);
    expect(floor2.totalExhibitsLifted).toBe(2);
    expect((floor2.cameraStates ?? []).length, "floor 2 must have two sweeping cameras").toBe(2);
    expect(floor2.sensorEventCount ?? 0, "exit and sensor events must flow through engine sensors").toBeGreaterThan(0);
    expect(floor2.footstepEvents ?? 0, "guards must produce authored-gait footsteps").toBeGreaterThan(0);
    await liftAt(page, { x: -7, z: 4.8 }, "p3");
    const alarm = await readEvidence(page);
    expect(alarm.totalExhibitsLifted).toBe(3);
    expect(alarm.alarmActive, "the third exhibit must activate the alarm return run").toBe(true);
    expect((alarm.audioCues ?? []).join(",")).toContain("guard-alert");
    await teleport(page, 0, -6.3);
    await pump(page, 10);
    const won = await readEvidence(page);
    expect(won.state).toBe("won");

    // Touch parity: full reset, sneak toggle, movement hold, and lift hold.
    await page.locator("#gs-restart-button").click();
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { floor?: number; totalExhibitsLifted?: number; state?: string } }).__GALLERY_SHIFT_EVIDENCE__;
      return ev?.floor === 1 && ev.totalExhibitsLifted === 0 && ev.state === "playing";
    });
    await page.locator("#gs-sneak-button").click();
    const touchStart = await readEvidence(page);
    await page.locator("#gs-up-button").dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 9, isPrimary: true, buttons: 1 });
    await pump(page, 45);
    await page.locator("#gs-up-button").dispatchEvent("pointerup", { pointerType: "touch", pointerId: 9, isPrimary: true });
    const touchMoved = await readEvidence(page);
    expect(touchMoved.thiefPos!.z).toBeLessThan(touchStart.thiefPos!.z - 0.3);
    expect(touchMoved.thiefGait).toBe("sneak");
    await teleport(page, -6.5, -3.0);
    await page.locator("#gs-lift-button").dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 10, isPrimary: true, buttons: 1 });
    await pump(page, 90);
    await page.locator("#gs-lift-button").dispatchEvent("pointerup", { pointerType: "touch", pointerId: 10, isPrimary: true });
    const touchLift = await readEvidence(page);
    expect(touchLift.exhibitsLifted).toBe(1);
    writeFileSync(join(REPORT_DIR, "mission-touch.json"), `${JSON.stringify({ alarm, won, touchMoved, touchLift }, null, 2)}\n`);
    writeFileSync(join(logDir, "floor-2.json"), JSON.stringify(floor2, null, 2));
  } finally {
    await server.close();
  }
});

test("gallery shift pause freezes the frame loop deterministically", async ({ page }) => {
  test.setTimeout(240_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-gallery-shift/?debug=1", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    await pump(page, 60);
    await page.keyboard.press("KeyP");
    const pausedFrame = await readEvidence(page);
    await page.waitForTimeout(600);
    const stillPaused = await readEvidence(page);
    expect(pausedFrame.state).toBe("paused");
    expect(stillPaused.frameCount, "frame counter must freeze while paused").toBe(pausedFrame.frameCount);
    expect(stillPaused.detection ?? 0).toBe(pausedFrame.detection ?? 0);
    await page.keyboard.press("KeyP");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { state?: string } }).__GALLERY_SHIFT_EVIDENCE__;
      return ev?.state === "playing";
    }, undefined, { timeout: 20_000 });
    const resumed = await readEvidence(page);
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(join(REPORT_DIR, "pause.json"), `${JSON.stringify({ pausedFrame, stillPaused, resumed }, null, 2)}\n`);
    const binding = routeSourceBinding();
    const files = ["playable.json", "mission-touch.json", "pause.json"];
    const artifacts = files.map((file) => ({ path: `${REPORT_DIR}/${file}`, sha256: sha256(`${REPORT_DIR}/${file}`) }));
    writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
      schema: "aura3d.gallery-shift.playable-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(PRODUCER),
      routeSourceFiles: binding.files,
      routeSourceSha256: binding.sha256,
      scenarios: ["walk", "sneak", "LOS-detection", "real-occluder", "caught", "floor-reset", "three-exhibit-mission", "floor-transition", "camera-and-laser", "alarm-return", "win", "touch-move", "touch-lift", "pause-freeze-resume"],
      artifacts,
      pass: true
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
