/**
 * BF-10 — Blockfall Reactor audio / FX / scoreboard browser coverage.
 *
 * Drives the mounted route with real input and asserts:
 *   1. audible cues fire for accepted inputs and the hum + stem loops unlock,
 *   2. a real line clear spawns scene shard bursts (and reduced motion suppresses
 *      them while still counting the suppression),
 *   3. the wall scoreboard publishes zero-padded digits that match live state and
 *      whose digit nodes are visible in the mounted scene graph,
 *   4. attract mode plays the expert fixture behind the title card and yields to
 *      the first player input,
 *   5. the instancing draw-call A/B telemetry lands with instanced < perCell.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const SCRATCH = join("tests", "reports", "blockfall-reactor-fx");

interface BlockfallEvidence {
  readonly status?: string;
  readonly frameCount?: number;
  readonly diagnostics?: { readonly drawCalls?: number; readonly backend?: string };
  readonly current?: {
    readonly score?: number;
    readonly lines?: number;
    readonly level?: number;
    readonly piecesPlaced?: number;
    readonly gameOver?: boolean;
  };
  readonly observedGameplayProof?: {
    readonly movement?: boolean;
    readonly rotation?: boolean;
    readonly hold?: boolean;
    readonly reset?: boolean;
  };
  readonly acceptance?: {
    readonly scenario?: string | null;
    readonly frozenForExactCapture?: boolean;
    readonly danger?: boolean;
    readonly snapshotChecksum?: string;
  };
  readonly renderedBeatProof?: {
    readonly activeBeats?: {
      readonly levelUp?: boolean;
      readonly gameOver?: boolean;
      readonly reset?: boolean;
      readonly lineClearBurst?: boolean;
    };
  };
  readonly audio?: {
    readonly sfxReady?: boolean;
    readonly unlocked?: boolean;
    readonly cueCount?: number;
    readonly gameplayCueCount?: number;
    readonly typedAssetCount?: number;
    readonly playedCueCount?: number;
    readonly suppressedCueCount?: number;
    readonly recentCues?: readonly string[];
    readonly cueCounts?: Record<string, number>;
    readonly audibleBuses?: readonly string[];
    readonly busVolumes?: Record<string, number>;
    readonly musicLevel?: number;
    readonly errors?: readonly string[];
  };
  readonly boardView?: {
    readonly renderMode?: string;
    readonly parity?: { readonly parityChecks?: number; readonly lastParityMatch?: boolean };
    readonly drawCallTelemetry?: {
      readonly measured?: boolean;
      readonly instanced?: number | null;
      readonly perCell?: number | null;
    };
  };
  readonly clearFx?: {
    readonly burstsSpawned?: number;
    readonly shardsLaunched?: number;
    readonly activeShards?: number;
    readonly lastBurstLines?: number;
    readonly biggestBurstLines?: number;
    readonly quadBurstSeen?: boolean;
    readonly reducedMotionSuppressionCount?: number;
  };
  readonly cameraFeel?: {
    readonly punchesFired?: number;
    readonly punchActive?: boolean;
    readonly levelUpPunchSeen?: boolean;
    readonly quadPunchSeen?: boolean;
    readonly reducedMotionSuppressionCount?: number;
  };
  readonly scoreboard?: {
    readonly scoreDigits?: string;
    readonly levelDigits?: string;
    readonly glyphCompliant?: boolean;
    readonly renderedScoreSlots?: readonly { readonly slot: number; readonly visibleDigit: number }[];
    readonly renderedLevelSlots?: readonly { readonly slot: number; readonly visibleDigit: number }[];
  };
  readonly attract?: {
    readonly active?: boolean;
    readonly framesReplayed?: number;
    readonly loopsCompleted?: number;
    readonly exitReason?: string | null;
    readonly pinnedFinalScore?: number;
    readonly pinnedScoreHash?: string;
    readonly events?: number;
  };
}

type AcceptanceScenario = "play" | "single-clear" | "quad" | "level-up" | "danger" | "game-over";

async function applyAcceptanceScenario(page: Page, scenario: AcceptanceScenario): Promise<{
  readonly scenario: string;
  readonly checksum: string;
  readonly summary: { readonly lines?: number; readonly level?: number; readonly gameOver?: boolean };
  readonly events: readonly { readonly type?: string; readonly lines?: number }[];
  readonly danger: boolean;
}> {
  const result = await page.evaluate((nextScenario) => {
    const probe = (window as unknown as {
      __AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__?: {
        apply(name: AcceptanceScenario): unknown;
      };
    }).__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__;
    if (!probe) throw new Error("Missing Blockfall acceptance probe.");
    return probe.apply(nextScenario);
  }, scenario);
  await page.waitForTimeout(180);
  return result as {
    readonly scenario: string;
    readonly checksum: string;
    readonly summary: { readonly lines?: number; readonly level?: number; readonly gameOver?: boolean };
    readonly events: readonly { readonly type?: string; readonly lines?: number }[];
    readonly danger: boolean;
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function readEvidence(page: Page): Promise<BlockfallEvidence> {
  return page.evaluate(() => {
    const source = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: BlockfallEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    return source ?? {};
  });
}

async function waitForRunningRoute(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const value = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: BlockfallEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    return Boolean(
      value?.current &&
      Number(value.frameCount) > 0 &&
      Number(value.diagnostics?.drawCalls) > 0
    );
  }, undefined, { timeout: 120_000 });
}

/**
 * Exiting attract queues a reset that lands on a later frame; at headless frame
 * rates that can take seconds. Wait until the mounted kit reports a genuinely
 * fresh game before capturing any baselines.
 */
async function waitForFreshGame(page: Page): Promise<void> {
  // The exiting keypress itself plays (Space hard-drops), so piecesPlaced may be
  // nonzero on a genuinely fresh board; board score/lines are what must reset.
  await page.waitForFunction(() => {
    const value = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: BlockfallEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    const current = value?.current;
    return Boolean(
      current &&
      current.score === 0 &&
      current.lines === 0 &&
      current.gameOver === false
    );
  }, undefined, { timeout: 90_000 });
  await page.waitForTimeout(250);
}

interface ServerHandle {
  readonly origin: string;
  close(): Promise<void>;
}

let server: ServerHandle | undefined;

async function sharedServer(): Promise<ServerHandle> {
  if (!server) server = (await startExampleDevServer()) as unknown as ServerHandle;
  return server;
}

test.describe.configure({ mode: "serial" });

test("blockfall audible cues fire on accepted inputs and unlock the loop buses", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  const origin = (await sharedServer()).origin;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  // The route starts in attract mode; any mapped key both exits attract and plays.
  await waitForRunningRoute(page);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await page.waitForTimeout(700);

  const audio = (await readEvidence(page)).audio ?? {};
  expect(audio.sfxReady).toBe(true);
  expect(audio.cueCount ?? 0).toBeGreaterThanOrEqual(13);
  expect(audio.gameplayCueCount).toBe(9);
  expect(audio.typedAssetCount ?? 0).toBeGreaterThanOrEqual(14);
  expect(audio.errors ?? []).toEqual([]);

  const counts = audio.cueCounts ?? {};
  expect(counts.move ?? 0).toBeGreaterThanOrEqual(2);
  expect(counts.rotate ?? 0).toBeGreaterThanOrEqual(1);
  const hardDrops = counts.hardDrop ?? (audio.recentCues ?? []).filter((cue) => cue === "hard-drop").length;
  expect(hardDrops).toBeGreaterThanOrEqual(1);
  for (const cue of ["move", "rotate", "hard-drop"]) {
    expect(audio.recentCues ?? []).toContain(cue);
  }
  // Every press is either played or honestly suppressed by context state.
  expect((audio.playedCueCount ?? 0) + (audio.suppressedCueCount ?? 0)).toBeGreaterThanOrEqual(6);
  // Loops unlocked on the gesture: hum plus base stem audible, later stems at zero gain.
  expect(audio.audibleBuses ?? []).toContain("sfx");
  expect(audio.audibleBuses ?? []).toContain("ambient");
  expect(audio.audibleBuses ?? []).toContain("music-stem-1");
  expect(audio.busVolumes?.["music-stem-4"]).toBe(0);

  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(join(SCRATCH, "audible-cues.json"), JSON.stringify(audio, null, 2));
});

test("blockfall line clear launches scaled shard bursts in the scene", async ({ page }, testInfo) => {
  testInfo.setTimeout(300_000);
  const origin = (await sharedServer()).origin;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  await waitForRunningRoute(page);
  // The route boots straight into a fresh playable game; no attract exit needed.
  await waitForFreshGame(page);

  const baseline = (await readEvidence(page)).current?.lines ?? 0;
  const spreadDrop = async (column: number): Promise<void> => {
    for (let step = 0; step < 5; step += 1) await page.keyboard.press("ArrowLeft");
    for (let step = 0; step < column; step += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await page.waitForTimeout(90);
  };

  let lines = baseline;
  for (let round = 0; round < 60 && lines <= baseline; round += 1) {
    const state = (await readEvidence(page)).current;
    if (state?.gameOver === true) {
      await page.keyboard.press("KeyR");
      await page.waitForTimeout(200);
    }
    await spreadDrop(round % 10);
    lines = (await readEvidence(page)).current?.lines ?? 0;
  }
  expect(lines, "mounted play must produce a real line clear").toBeGreaterThan(baseline);

  const fx = (await readEvidence(page)).clearFx ?? {};
  expect(fx.burstsSpawned ?? 0).toBeGreaterThanOrEqual(1);
  expect(fx.shardsLaunched ?? 0).toBeGreaterThanOrEqual(1);
  expect(fx.biggestBurstLines ?? 0).toBeGreaterThanOrEqual(1);
  // Full motion here, so nothing should have been suppressed.
  expect(fx.reducedMotionSuppressionCount ?? 0).toBe(0);
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(join(SCRATCH, "clear-fx.json"), JSON.stringify(fx, null, 2));

  // Named FX capture: the burst lifetime is ~0.55s; grab the frame immediately.
  const canvas = page.locator("#app canvas").first();
  await expect(canvas).toBeVisible();
  await page.screenshot({ path: join(SCRATCH, "line-clear-fx.png") });

  // Camera feel proof fields exist; full motion records punches without suppression.
  const cameraFeel = (await readEvidence(page)).cameraFeel ?? {};
  expect(cameraFeel.punchesFired).toBeGreaterThanOrEqual(0);
  expect(cameraFeel.reducedMotionSuppressionCount).toBe(0);
});

test("blockfall reduced motion suppresses bursts and camera punches entirely", async ({ page }, testInfo) => {
  testInfo.setTimeout(300_000);
  const origin = (await sharedServer()).origin;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  await waitForRunningRoute(page);
  await waitForFreshGame(page);

  const baseline = (await readEvidence(page)).current?.lines ?? 0;
  const spreadDrop = async (column: number): Promise<void> => {
    for (let step = 0; step < 5; step += 1) await page.keyboard.press("ArrowLeft");
    for (let step = 0; step < column; step += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await page.waitForTimeout(90);
  };
  let lines = baseline;
  for (let round = 0; round < 80 && lines <= baseline; round += 1) {
    const state = (await readEvidence(page)).current;
    if (state?.gameOver === true) {
      await page.keyboard.press("KeyR");
      await page.waitForTimeout(200);
    }
    await spreadDrop(round % 10);
    lines = (await readEvidence(page)).current?.lines ?? 0;
  }
  expect(lines).toBeGreaterThan(baseline);

  const fx = (await readEvidence(page)).clearFx ?? {};
  expect(fx.burstsSpawned ?? 0).toBe(0);
  expect(fx.shardsLaunched ?? 0).toBe(0);
  expect(fx.reducedMotionSuppressionCount ?? 0).toBeGreaterThanOrEqual(1);
  const cameraFeel = (await readEvidence(page)).cameraFeel ?? {};
  expect(cameraFeel.punchActive).toBe(false);
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(join(SCRATCH, "reduced-motion.json"), JSON.stringify({ fx, cameraFeel }, null, 2));
  await page.screenshot({ path: join(SCRATCH, "reduced-motion.png") });
});

test("blockfall exact acceptance states come from real public-kit transitions", async ({ page }, testInfo) => {
  testInfo.setTimeout(300_000);
  const origin = (await sharedServer()).origin;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  await waitForRunningRoute(page);
  mkdirSync(SCRATCH, { recursive: true });

  const receipts: Record<string, unknown> = {};
  for (const scenario of ["play", "single-clear", "quad", "level-up", "danger", "game-over"] as const) {
    const result = await applyAcceptanceScenario(page, scenario);
    const evidence = await readEvidence(page);
    expect(result.scenario).toBe(scenario);
    expect(result.checksum).toBeTruthy();
    expect(evidence.acceptance?.scenario).toBe(scenario);
    expect(evidence.acceptance?.frozenForExactCapture).toBe(true);
    expect(evidence.acceptance?.snapshotChecksum).toBe(result.checksum);

    if (scenario === "single-clear") {
      expect(result.summary.lines).toBe(1);
      expect(result.events.some((event) => event.type === "line-clear" && event.lines === 1)).toBe(true);
    }
    if (scenario === "quad") {
      expect(result.summary.lines).toBe(4);
      expect(result.events.some((event) => event.type === "line-clear" && event.lines === 4)).toBe(true);
      expect(evidence.clearFx?.quadBurstSeen).toBe(true);
      expect(evidence.cameraFeel?.quadPunchSeen).toBe(true);
    }
    if (scenario === "level-up") {
      expect(result.summary.lines).toBe(10);
      expect(result.summary.level).toBe(2);
      expect(evidence.renderedBeatProof?.activeBeats?.levelUp).toBe(true);
    }
    if (scenario === "danger") {
      expect(result.danger).toBe(true);
      expect(result.summary.gameOver).toBe(false);
      expect(evidence.acceptance?.danger).toBe(true);
    }
    if (scenario === "game-over") {
      expect(result.summary.gameOver).toBe(true);
      expect(result.events.some((event) => event.type === "game-over")).toBe(true);
      expect(evidence.renderedBeatProof?.activeBeats?.gameOver).toBe(true);
    }

    const screenshotPath = join(SCRATCH, `acceptance-${scenario}.png`);
    await page.screenshot({ path: screenshotPath });
    receipts[scenario] = {
      checksum: result.checksum,
      screenshot: screenshotPath,
      screenshotSha256: sha256(screenshotPath),
      summary: result.summary,
      events: result.events,
      danger: result.danger
    };
  }

  writeFileSync(join(SCRATCH, "acceptance-states.json"), JSON.stringify({
    kind: "blockfall-reactor-exact-acceptance-states",
    source: "mounted public game.fallingBlocks transitions",
    viewport: { width: 1280, height: 800 },
    receipts
  }, null, 2));
});

test("blockfall mobile play keeps the full canvas and all touch verbs operable", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  const origin = (await sharedServer()).origin;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  await waitForRunningRoute(page);
  const result = await applyAcceptanceScenario(page, "play");
  expect(result.summary.gameOver).toBe(false);

  const canvas = page.locator("#app canvas").first();
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.height ?? 0).toBeGreaterThanOrEqual(840);
  for (const action of ["left", "right", "soft", "rotate-left", "rotate-right", "hold", "drop"]) {
    const control = page.locator(`[data-touch-action="${action}"]`);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 999) + (box?.width ?? 999)).toBeLessThanOrEqual(390);
  }

  mkdirSync(SCRATCH, { recursive: true });
  const screenshotPath = join(SCRATCH, "acceptance-mobile-play.png");
  await page.screenshot({ path: screenshotPath });
  writeFileSync(join(SCRATCH, "acceptance-mobile-play.json"), JSON.stringify({
    viewport: { width: 390, height: 844 },
    screenshotSha256: sha256(screenshotPath),
    checksum: result.checksum,
    touchControls: 7,
    canvasBox
  }, null, 2));

  // Unfreeze the retained frame and operate the actual DOM touch controls.
  await page.evaluate(() => {
    (window as unknown as {
      __AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__?: { unfreeze(): void };
    }).__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__?.unfreeze();
  });
  for (const action of ["left", "rotate-right", "hold", "drop"]) {
    await page.locator(`[data-touch-action="${action}"]`).click();
    await page.waitForTimeout(120);
  }
  let evidence = await readEvidence(page);
  expect(evidence.observedGameplayProof?.movement).toBe(true);
  expect(evidence.observedGameplayProof?.rotation).toBe(true);
  expect(evidence.observedGameplayProof?.hold).toBe(true);

  await page.locator('[data-touch-action="pause"]').click();
  await page.waitForFunction(() => document.body.dataset.blockfallState === "paused");
  await page.locator('[data-touch-action="pause"]').click();
  await page.waitForFunction(() => document.body.dataset.blockfallState === "running");

  await applyAcceptanceScenario(page, "game-over");
  await page.evaluate(() => {
    (window as unknown as {
      __AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__?: { unfreeze(): void };
    }).__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__?.unfreeze();
  });
  await page.locator('[data-touch-action="reset"]').click();
  await page.waitForFunction(() => {
    const value = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: BlockfallEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    return value?.current?.gameOver === false && value.current.score === 0 && value.observedGameplayProof?.reset === true;
  });
  evidence = await readEvidence(page);
  expect(evidence.current?.gameOver).toBe(false);
  expect(evidence.observedGameplayProof?.reset).toBe(true);
});

test("blockfall wall scoreboard mirrors score/level with zero-padded digits", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  const origin = (await sharedServer()).origin;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  await waitForRunningRoute(page);
  await page.keyboard.press("Space"); // fresh game so score is known
  await waitForFreshGame(page);

  const evidence = await readEvidence(page);
  const score = evidence.current?.score ?? 0;
  const level = evidence.current?.level ?? 1;
  const scoreboard = evidence.scoreboard ?? {};
  expect(scoreboard.scoreDigits).toBe(String(score).padStart(6, "0"));
  expect(scoreboard.levelDigits).toBe(String(level).padStart(2, "0"));
  expect(scoreboard.glyphCompliant).toBe(true);
  // Scene-graph truth: exactly one digit node visible per slot, matching the strings.
  const scoreSlots = scoreboard.renderedScoreSlots ?? [];
  expect(scoreSlots).toHaveLength(6);
  scoreSlots.forEach((slot, index) => {
    expect(slot.visibleDigit).toBe(Number(scoreboard.scoreDigits?.[index]));
  });
  const levelSlots = scoreboard.renderedLevelSlots ?? [];
  expect(levelSlots).toHaveLength(2);
  levelSlots.forEach((slot, index) => {
    expect(slot.visibleDigit).toBe(Number(scoreboard.levelDigits?.[index]));
  });

  mkdirSync(SCRATCH, { recursive: true });
  await page.screenshot({ path: join(SCRATCH, "wall-scoreboard.png") });
});

test("blockfall attract plays the pinned expert run and yields to first input", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  const origin = (await sharedServer()).origin;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  await waitForRunningRoute(page);

  // The route boots playable; attract engages after an idle window (45s) or via
  // the deterministic probe, which drives the same enter path as the timer.
  const idleConfigured = await page.evaluate(() => {
    const source = (window as unknown as {
      __AURA3D_BLOCKFALL_ATTRACT_PROBE__?: { idleEntryAfterSeconds?: number };
    }).__AURA3D_BLOCKFALL_ATTRACT_PROBE__;
    return source?.idleEntryAfterSeconds ?? 0;
  });
  expect(idleConfigured).toBe(45);
  const bootActive = await readEvidence(page);
  expect(bootActive.attract?.active).toBe(false);

  await page.evaluate(() => {
    (window as unknown as {
      __AURA3D_BLOCKFALL_ATTRACT_PROBE__?: { enter(): void };
    }).__AURA3D_BLOCKFALL_ATTRACT_PROBE__?.enter();
  });
  await page.waitForTimeout(400);
  const during = await readEvidence(page);
  expect(during.attract?.active).toBe(true);
  expect(during.attract?.entryReason).toBe("probe");
  expect(during.attract?.events ?? 0).toBeGreaterThan(100);
  expect(during.attract?.framesReplayed ?? 0).toBeGreaterThan(0);
  const cardVisible = await page.evaluate(() =>
    Boolean(document.getElementById("blockfall-attract-card"))
  );
  expect(cardVisible).toBe(true);
  mkdirSync(SCRATCH, { recursive: true });
  await page.screenshot({ path: join(SCRATCH, "attract-title.png") });

  // First real input ends attract into a fresh game (triggering key swallowed).
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.body.dataset.blockfallAttract === "false", undefined, { timeout: 60_000 });
  await waitForFreshGame(page);
  const after = await readEvidence(page);
  expect(after.attract?.active).toBe(false);
  expect(after.attract?.exitReason).toBe("player-input");
  expect(await page.evaluate(() => document.body.dataset.blockfallAttract)).toBe("false");
  expect(await page.evaluate(() => document.getElementById("blockfall-attract-card"))).toBeNull();
  expect(after.current?.score).toBe(0);
  expect(after.current?.lines).toBe(0);
});

test("blockfall instancing telemetry lands with fewer draw calls than per-cell", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  const origin = (await sharedServer()).origin;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/apps/showcase-blockfall-reactor/", { waitUntil: "domcontentloaded" });
  await waitForRunningRoute(page);

  await page.waitForFunction(() => {
    const value = (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: BlockfallEvidence;
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    return value?.boardView?.drawCallTelemetry?.measured === true;
  }, undefined, { timeout: 180_000 });

  const view = (await readEvidence(page)).boardView ?? {};
  expect(view.renderMode).toBe("instanced");
  expect(view.parity?.parityChecks ?? 0).toBeGreaterThan(0);
  expect(view.parity?.lastParityMatch).toBe(true);
  const telemetry = view.drawCallTelemetry ?? {};
  expect(typeof telemetry.instanced).toBe("number");
  expect(typeof telemetry.perCell).toBe("number");
  expect(telemetry.instanced ?? 0).toBeGreaterThan(0);
  expect(telemetry.instanced ?? Number.MAX_SAFE_INTEGER).toBeLessThan(telemetry.perCell ?? 0);
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(join(SCRATCH, "draw-call-telemetry.json"), JSON.stringify({
    instanced: telemetry.instanced,
    perCell: telemetry.perCell,
    reduction: (telemetry.perCell ?? 0) - (telemetry.instanced ?? 0)
  }, null, 2));
});
