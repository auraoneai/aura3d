import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

interface PWEvidence {
  readonly mounted?: boolean; readonly state?: string; readonly evidenceScenario?: string; readonly hull?: number;
  readonly ringIndex?: number; readonly ringsPassed?: number; readonly dronesDown?: number; readonly shotsFired?: number;
  readonly combatEvents?: number; readonly sensorEventCount?: number; readonly flightMode?: string; readonly audioCues?: readonly string[];
  readonly backend?: string; readonly frameCount?: number; readonly position?: readonly [number, number, number]; readonly heading?: number;
  readonly airspeed?: number; readonly altitude?: number; readonly throttle?: number; readonly grounded?: string; readonly liveDrones?: number;
  readonly cameraMode?: string; readonly reducedMotion?: boolean; readonly renderer?: { readonly drawCalls?: number; readonly renderSize?: readonly number[] };
  readonly primaryAssets?: readonly string[]; readonly claimBoundary?: string;
}

const REPO_ROOT = process.cwd();
const APP_DIR = resolve(REPO_ROOT, "apps/showcase-patrol-wing");
const REPORT_DIR = resolve(REPO_ROOT, "tests/reports/patrol-wing/playable");
const PRODUCER = "tests/browser/patrol-wing-playable.spec.ts";

function sha256(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|css)$/.test(path) ? [path] : [];
  });
}
function routeSourceHash(): string {
  const hash = createHash("sha256");
  for (const path of sourceFiles(resolve(APP_DIR, "src"))) hash.update(relative(APP_DIR, path)).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
}
async function evidence(page: Page): Promise<PWEvidence> {
  return page.evaluate(() => (window as unknown as { __PATROL_WING_EVIDENCE__?: PWEvidence }).__PATROL_WING_EVIDENCE__ ?? {});
}
async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => (window as unknown as { __PW_PUMP__?: (frames: number) => number }).__PW_PUMP__?.(count), frames);
}
async function scenario(page: Page, name: string): Promise<void> {
  await page.evaluate((value) => (window as unknown as { __PW_SCENARIO__?: (scenario: string) => string }).__PW_SCENARIO__?.(value), name);
  await page.waitForTimeout(500);
}
async function capture(page: Page, name: string, artifacts: string[]): Promise<void> {
  const path = resolve(REPORT_DIR, `${name}.png`);
  await page.waitForTimeout(650); await page.screenshot({ path }); artifacts.push(relative(REPO_ROOT, path));
}
async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __PATROL_WING_EVIDENCE__?: PWEvidence }).__PATROL_WING_EVIDENCE__?.mounted), undefined, { timeout: 180_000 });
  await page.waitForTimeout(500);
}

test("Patrol Wing proves flight, patrol, combat, failure, landing, touch, pause, and exact artifacts", async ({ page }) => {
  test.setTimeout(300_000); mkdirSync(REPORT_DIR, { recursive: true });
  const artifacts: string[] = []; const scenarios: string[] = []; const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-patrol-wing/`, { waitUntil: "commit", timeout: 120_000 }); await waitReady(page);
    const boot = await evidence(page);
    expect(boot.state).toBe("preflight"); expect(boot.flightMode).toBe("authored-arcade"); expect(boot.backend).toBe("rapier");
    expect(boot.primaryAssets).toEqual(["assets.patrolWingPlane", "assets.patrolWingDroneA", "assets.patrolWingDroneB", "assets.patrolWingPadBeacon"]);
    expect(boot.claimBoundary).toContain("no aerodynamic");
    await capture(page, "takeoff", artifacts); scenarios.push("takeoff", "bounded-arcade-claim");

    await page.keyboard.down("ShiftLeft"); await pump(page, 150); await page.keyboard.up("ShiftLeft"); await page.waitForTimeout(500);
    const airborne = await evidence(page);
    expect(airborne.airspeed ?? 0).toBeGreaterThan(8); expect(airborne.grounded).toBe("airborne"); expect(airborne.state).toBe("patrol");
    const axesBefore = airborne.position!;
    await page.keyboard.down("KeyS"); await page.keyboard.down("KeyD"); await page.keyboard.down("KeyE"); await pump(page, 150);
    await page.keyboard.up("KeyS"); await page.keyboard.up("KeyD"); await page.keyboard.up("KeyE");
    const axesAfter = await evidence(page);
    expect(axesAfter.position).not.toEqual(axesBefore); expect(Math.abs((axesAfter.heading ?? 0) - (airborne.heading ?? 0))).toBeGreaterThan(0.05);
    scenarios.push("keyboard-flight-axes");

    await scenario(page, "ring-run"); const ring = await evidence(page); expect(ring.ringsPassed).toBe(1);
    await capture(page, "ring-run", artifacts); scenarios.push("ordered-ring-entry", "stable-horizon-chase");
    await scenario(page, "drone-pass"); const dronePass = await evidence(page); expect(dronePass.liveDrones ?? 0).toBeGreaterThan(0);
    await capture(page, "drone-pass", artifacts); scenarios.push("seeded-drone-wave");

    const shotsBefore = dronePass.shotsFired ?? 0;
    await page.keyboard.down("Space"); await pump(page, 90); await page.keyboard.up("Space");
    const firing = await evidence(page); expect(firing.shotsFired ?? 0).toBeGreaterThan(shotsBefore); expect(firing.audioCues).toContain("cannon-fire");
    expect(firing.combatEvents ?? 0).toBeGreaterThan(0); expect(firing.dronesDown ?? 0).toBeGreaterThan(0); expect(firing.liveDrones).toBe(0);
    await scenario(page, "drone-hit"); await capture(page, "drone-hit", artifacts); scenarios.push("cannon-fire", "combat-hit-feedback", "drone-down");

    await scenario(page, "canyon"); expect((await evidence(page)).ringsPassed).toBe(3);
    await capture(page, "canyon", artifacts); scenarios.push("canyon-route-discipline");
    await scenario(page, "low-hull"); const lowHull = await evidence(page);
    expect(lowHull.hull).toBe(18); expect(lowHull.audioCues).toContain("hull-alarm");
    await capture(page, "low-hull", artifacts); scenarios.push("low-hull-warning");

    await page.evaluate(() => (window as unknown as { __PW_DAMAGE__?: (amount: number) => number }).__PW_DAMAGE__?.(30));
    const failed = await evidence(page); expect(failed.state).toBe("shot-down"); expect(failed.hull).toBe(0); scenarios.push("damage-fail");
    await page.keyboard.press("KeyR"); expect((await evidence(page)).state).toBe("preflight"); scenarios.push("full-reset");

    await scenario(page, "approach"); await capture(page, "final-approach", artifacts); scenarios.push("visible-landing-approach");
    await scenario(page, "touchdown"); const touchdown = await evidence(page);
    expect(touchdown.state).toBe("graded"); expect(touchdown.audioCues).toEqual(expect.arrayContaining(["touchdown", "patrol-clear"]));
    await capture(page, "touchdown", artifacts); scenarios.push("touchdown-classification", "patrol-clear");

    await page.keyboard.press("KeyP"); const paused = await evidence(page); expect(paused.state).toBe("paused"); const pausedFrame = paused.frameCount;
    await page.waitForTimeout(150); expect((await evidence(page)).frameCount).toBe(pausedFrame);
    await page.keyboard.press("KeyP"); const resumed = await evidence(page); expect(resumed.state).not.toBe("paused");
    writeFileSync(resolve(REPORT_DIR, "pause.json"), `${JSON.stringify({ paused, resumed }, null, 2)}\n`); scenarios.push("pause-freeze-resume");

    await page.setViewportSize({ width: 390, height: 844 }); await scenario(page, "takeoff"); const touchBefore = await evidence(page);
    for (const id of ["#pw-throttle-button", "#pw-pitch-up-button", "#pw-roll-right-button", "#pw-yaw-right-button"]) await page.locator(id).dispatchEvent("pointerdown", { pointerType: "touch" });
    await pump(page, 170);
    for (const id of ["#pw-throttle-button", "#pw-pitch-up-button", "#pw-roll-right-button", "#pw-yaw-right-button"]) await page.locator(id).dispatchEvent("pointerup", { pointerType: "touch" });
    const touchAfter = await evidence(page); expect(touchAfter.position).not.toEqual(touchBefore.position); expect(touchAfter.heading).not.toBe(touchBefore.heading);
    await scenario(page, "ring-run");
    await capture(page, "mobile-touch", artifacts); scenarios.push("touch-flight-axes", "mobile");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${server.origin}/apps/showcase-patrol-wing/`, { waitUntil: "commit", timeout: 120_000 }); await waitReady(page); await scenario(page, "ring-run");
    const reduced = await evidence(page); expect(reduced.reducedMotion).toBe(true); expect(reduced.ringsPassed).toBe(1);
    await capture(page, "reduced-motion", artifacts); scenarios.push("reduced-motion-state-truth");

    const mission = { boot, airborne, axesAfter, ring, dronePass, firing, lowHull, failed, touchdown, paused, resumed, touchAfter, reduced };
    writeFileSync(resolve(REPORT_DIR, "mission-touch.json"), `${JSON.stringify(mission, null, 2)}\n`);
    const receipt = { schema: "aura3d.patrol-wing.playable-evidence/1.0", generatedAt: new Date().toISOString(), producer: PRODUCER,
      producerSourceSha256: sha256(resolve(REPO_ROOT, PRODUCER)), routeSourceSha256: routeSourceHash(), scenarios,
      artifacts: artifacts.map((path) => ({ path, sha256: sha256(resolve(REPO_ROOT, path)) })), pass: true };
    writeFileSync(resolve(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  } finally { await server.close(); }
});
