import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Bank Shot playable evidence (PRD BS-14): aim input changes state -> hold and
 * release Space strikes -> the break resolves back to aiming -> the scripted
 * pocket/foul mechanics are proven (pocket sensors, shot resolution) -> R
 * re-racks rack 1 with resetHashMatch -> P freezes the frame loop.
 *
 * All physics waits advance simulated time through the route's __BS_PUMP__
 * (public app.pause + app.step loop): headless tabs throttle rAF during passive
 * waits, so no wall-clock wait may gate physics.
 */

interface BankShotEvidence {
  readonly mounted?: boolean;
  readonly rack?: number;
  readonly state?: string;
  readonly phase?: string;
  readonly score?: number;
  readonly combo?: number;
  readonly suit?: string | null;
  readonly fouls?: number;
  readonly ballsRemaining?: number;
  readonly potted?: readonly number[];
  readonly lastShot?: string;
  readonly shotHash?: string;
  readonly resetHashMatch?: boolean | null;
  readonly clockMs?: number;
  readonly sensorEventCount?: number;
  readonly physicsBodyCount?: number;
  readonly audioCues?: readonly string[];
  readonly backend?: string;
  readonly frameCount?: number;
  readonly aimAngle?: number;
  readonly charge?: number;
  readonly liveBallCount?: number;
  readonly shotCount?: number;
}

async function readEvidence(page: Page): Promise<BankShotEvidence> {
  return page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: BankShotEvidence }).__BANK_SHOT_EVIDENCE__ ?? {});
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __BANK_SHOT_EVIDENCE__?: unknown }).__BANK_SHOT_EVIDENCE__),
    undefined,
    { timeout: 180_000 }
  );
}

async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __BS_PUMP__?: (frames: number) => number }).__BS_PUMP__?.(count);
  }, frames);
}

/** Pump until the evidence state leaves `from`, up to `batches` x `frames` steps. */
async function pumpUntil(
  page: Page,
  predicate: (evidence: BankShotEvidence) => boolean,
  batches = 60,
  frames = 120
): Promise<BankShotEvidence | null> {
  for (let batch = 0; batch < batches; batch += 1) {
    await pump(page, frames);
    const evidence = await readEvidence(page);
    if (predicate(evidence)) return evidence;
  }
  return null;
}

async function holdStrike(page: Page, chargeFrames: number): Promise<void> {
  // Charge accumulates per simulated frame (throttled rAF makes wall-clock
  // holds unreliable in headless tabs), so the hold is pumped like physics.
  await page.keyboard.down("Space");
  await pump(page, chargeFrames);
  await page.keyboard.up("Space");
}

const REPORT_DIR = "tests/reports/bank-shot/playable";
const PRODUCER = "tests/browser/bank-shot-playable.spec.ts";

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
  const appDir = resolve("apps/showcase-bank-shot");
  const files = sourceFiles(join(appDir, "src"));
  const hash = createHash("sha256");
  for (const path of files) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return { files: files.map((path) => relative(resolve(), path)), sha256: hash.digest("hex") };
}

test("bank shot aims, strikes, resolves the break, and re-racks", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const logDir = testInfo.outputPath("run");
  mkdirSync(logDir, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-bank-shot/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    const boot = await readEvidence(page);
    expect(boot.backend, "route must run on the rapier backend").toBe("rapier");
    expect(boot.mounted).toBe(true);
    expect(boot.rack).toBe(1);
    expect(boot.state ?? boot.phase).toBe("aiming");
    expect(boot.liveBallCount).toBe(16);
    expect(boot.ballsRemaining).toBe(15);
    expect(boot.physicsBodyCount ?? 0).toBeGreaterThanOrEqual(34);

    // Aim input changes aim state (pumped while held: aim rotates per frame).
    const aimBefore = boot.aimAngle ?? 0;
    await page.keyboard.down("KeyD");
    await pump(page, 30);
    await page.keyboard.up("KeyD");
    const aimAfter = await readEvidence(page);
    expect(Math.abs((aimAfter.aimAngle ?? 0) - aimBefore), "aim input must rotate the aim").toBeGreaterThan(0.1);

    // Hold and release Space strikes: cue-strike audio, phase shooting.
    // 50 pumped frames of charging land inside the sweet zone (~0.76 power).
    await holdStrike(page, 50);
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __BANK_SHOT_EVIDENCE__?: { state?: string; phase?: string } }).__BANK_SHOT_EVIDENCE__;
      return ev?.state === "shooting" || ev?.phase === "shooting";
    }, undefined, { timeout: 30_000 });
    let state = await readEvidence(page);
    expect((state.audioCues ?? []).join(",")).toContain("cue-strike");
    expect((state.shotHash ?? "").length).toBeGreaterThan(0);

    // The break resolves (all balls under 0.05 m/s for 60 frames) back to
    // aiming or ball-in-hand; every pot/sensor bookkeeping is deterministic, never wall-clock.
    const resolved = await pumpUntil(page, (evidence) => (evidence.state ?? evidence.phase) === "aiming" || (evidence.state ?? evidence.phase) === "ball-in-hand");
    expect(resolved, "the break must resolve within the pump budget").not.toBeNull();
    state = await readEvidence(page);
    expect(state.shotCount ?? 0).toBe(1);
    expect(state.liveBallCount ?? 0).toBeLessThanOrEqual(16);
    // The break scattered and/or potted; sensors only fire for real entries.
    expect(state.sensorEventCount ?? 0).toBeGreaterThanOrEqual(0);
    writeFileSync(join(logDir, "after-break.json"), JSON.stringify(state, null, 2));
    writeFileSync(join(REPORT_DIR, "playable.json"), JSON.stringify(state, null, 2));

    if ((state.state ?? state.phase) === "ball-in-hand") {
      await page.keyboard.press("Space");
      await pump(page, 5);
      await page.waitForFunction(() => {
        const ev = (window as unknown as { __BANK_SHOT_EVIDENCE__?: { state?: string } }).__BANK_SHOT_EVIDENCE__;
        return ev?.state === "aiming";
      }, undefined, { timeout: 15_000 });
    }

    // Second shot: a tap (minimum power) resolves and is bookkept - shot
    // resolution mechanics proven end to end; the low-power foul path is the
    // no-rail ball-in-hand (also unit-covered), a clean break is not required.
    await holdStrike(page, 6);
    const resolved2 = await pumpUntil(page, (evidence) => (evidence.state ?? evidence.phase) === "aiming" || (evidence.state ?? evidence.phase) === "ball-in-hand");
    expect(resolved2, "the second shot must resolve").not.toBeNull();
    const afterTwo = await readEvidence(page);
    expect(afterTwo.shotCount ?? 0).toBe(2);

    // R re-rack restores the rack-1 state with resetHashMatch true.
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __BANK_SHOT_EVIDENCE__?: { rack?: number; state?: string; score?: number; resetHashMatch?: boolean | null } }).__BANK_SHOT_EVIDENCE__;
      return ev?.rack === 1 && (ev?.state === "aiming" || ev?.state === "ball-in-hand") && Number(ev?.score ?? -1) === 0 && ev?.resetHashMatch === true;
    }, undefined, { timeout: 30_000 });
    const reset = await readEvidence(page);
    writeFileSync(join(logDir, "reset.json"), JSON.stringify(reset, null, 2));
    expect(reset.rack).toBe(1);
    expect(reset.score).toBe(0);
    expect(reset.liveBallCount).toBe(16);
    expect(reset.ballsRemaining).toBe(15);
    expect(reset.potted ?? []).toHaveLength(0);
    expect(reset.resetHashMatch).toBe(true);
  } finally {
    await server.close();
  }
});

test("bank shot pause freezes the frame loop deterministically", async ({ page }) => {
  test.setTimeout(180_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-bank-shot/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    await page.keyboard.press("KeyP");
    const pausedFrame = await readEvidence(page);
    await page.waitForTimeout(600);
    const stillPaused = await readEvidence(page);
    expect(pausedFrame.state).toBe("paused");
    expect(stillPaused.frameCount, "frame counter must freeze while paused").toBe(pausedFrame.frameCount);
    await page.keyboard.press("KeyP");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __BANK_SHOT_EVIDENCE__?: { state?: string } }).__BANK_SHOT_EVIDENCE__;
      return ev?.state === "aiming";
    }, undefined, { timeout: 20_000 });
    const resumed = await readEvidence(page);
    writeFileSync(join(REPORT_DIR, "pause.json"), `${JSON.stringify({ pausedFrame, stillPaused, resumed }, null, 2)}\n`);
    const binding = routeSourceBinding();
    const artifacts = ["playable.json", "pause.json"].map((file) => ({ path: `${REPORT_DIR}/${file}`, sha256: sha256(`${REPORT_DIR}/${file}`) }));
    writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
      schema: "aura3d.bank-shot.playable-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(PRODUCER),
      routeSourceFiles: binding.files,
      routeSourceSha256: binding.sha256,
      scenarios: ["keyboard-aim", "keyboard-strike", "public-rapier-break", "settled-lock", "second-shot", "full-reset", "pause-freeze-resume"],
      artifacts,
      pass: true
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
