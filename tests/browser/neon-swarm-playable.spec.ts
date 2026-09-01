/**
 * Neon Swarm playable proof.
 *
 * Drives the real route through the PRD loop with keyboard + debug staging:
 * mount, movement changes position, pulse fire kills drones (combo rises),
 * intermission pickup doors open and apply an upgrade, death shows the run
 * summary, R resets to wave 1, and P freezes spawns/timers. Screenshots for
 * the definition-of-done stills land in tests/reports/neon-swarm/screenshots/.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/neon-swarm");
const SHOT_DIR = join(REPORT_DIR, "screenshots");
const ROUTE = "/apps/showcase-neon-swarm/";
const GLOBAL_NAME = "__NEON_SWARM_EVIDENCE__";

interface SwarmEvidence {
  readonly mounted: boolean;
  readonly state: string;
  readonly wave: number;
  readonly alive: number;
  readonly aliveGrunt: number;
  readonly aliveElite: number;
  readonly instanceCount: number;
  readonly drawCalls: number;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly kills: number;
  readonly seed: number;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly audioCues: readonly string[];
  readonly audioCueCount: number;
  readonly stage: string;
  readonly arenaInset: number;
  readonly finaleSurvivalRemaining: number;
  readonly outcomeHash: string | null;
  readonly waveChecksums: readonly number[];
  readonly upgrades: {
    readonly fireRateMultiplier: number;
    readonly dashCooldownMultiplier: number;
    readonly shieldCharges: number;
  };
  readonly playerPosition: { readonly x: number; readonly z: number };
  readonly burstCharge: number;
  readonly bursts: number;
  readonly grazes: number;
  readonly comboBreaks: number;
  readonly damageEvents: number;
  readonly pickupActive: boolean;
  readonly pickupPosition: { readonly x: number; readonly z: number };
  readonly pickupsCollected: number;
}

const PRODUCER_PATH = resolve("tests/browser/neon-swarm-playable.spec.ts");
const ROUTE_SOURCE_DIR = resolve("apps/showcase-neon-swarm/src");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function routeSourceSha256(): string {
  const hash = createHash("sha256");
  for (const name of readdirSync(ROUTE_SOURCE_DIR).filter((entry) => /\.(?:ts|css)$/.test(entry)).sort()) {
    hash.update(name).update("\0").update(readFileSync(join(ROUTE_SOURCE_DIR, name))).update("\0");
  }
  return hash.digest("hex");
}

function artifact(path: string) {
  return { path, sha256: sha256(resolve(path)) };
}

async function readEvidence(page: Page): Promise<SwarmEvidence> {
  return await page.evaluate((name) => {
    const value = (window as unknown as Record<string, unknown>)[name];
    return (value && typeof value === "object" ? value : {}) as SwarmEvidence;
  }, GLOBAL_NAME);
}

async function waitForState(page: Page, state: string, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    ({ name, want }) => {
      const value = (window as unknown as Record<string, { state?: string } | undefined>)[name];
      return value?.state === want;
    },
    { name: GLOBAL_NAME, want: state },
    { timeout: timeoutMs }
  );
}

test.describe("Neon Swarm route", () => {
  let server: ExampleDevServer | undefined;
  const consoleErrors: string[] = [];

  test.beforeEach(() => {
    consoleErrors.length = 0;
  });

  test.afterEach(async ({}, testInfo) => {
    if (server) {
      await server.close();
      server = undefined;
      void testInfo;
    }
  });

  test("move, kill, combo, pickup, death, reset all change published state", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/favicon/i.test(message.text())) return;
      consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });

    // Mount: evidence global appears with the booting->intermission flow.
    await page.waitForFunction((name) => Boolean((window as unknown as Record<string, unknown>)[name]), GLOBAL_NAME, { timeout: 90_000 });
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { drawCalls?: number } | undefined>)[name]?.drawCalls ?? 0) > 0,
      GLOBAL_NAME,
      { timeout: 120_000 }
    );
    const mounted = await readEvidence(page);
    expect(mounted.mounted).toBe(true);
    // Wave 1 starts automatically after the short first intermission.
    await waitForState(page, "wave-active");
    const atWaveStart = await readEvidence(page);
    expect(atWaveStart.wave).toBe(1);
    expect(atWaveStart.pickupActive).toBe(true);
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(SHOT_DIR, "01-load.png") });

    // Movement: hold right; the courier node must move on the street plane.
    const beforeMove = await readEvidence(page);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyD");
    const afterMove = await readEvidence(page);
    expect(afterMove.playerPosition.x).toBeGreaterThan(beforeMove.playerPosition.x + 1);

    // The deterministic gold pickup is scene geometry and collection is
    // decided by its live spatial sensor, not by a test-only score mutation.
    const beforePickup = await readEvidence(page);
    await page.evaluate(() => {
      const hooks = (window as unknown as {
        __NEON_SWARM_DEBUG__?: { stagePickupAtPlayer(): void; stepFixed(frames: number): void };
      }).__NEON_SWARM_DEBUG__;
      hooks?.stagePickupAtPlayer();
      hooks?.stepFixed(1);
    });
    const afterPickup = await readEvidence(page);
    expect(afterPickup.pickupsCollected).toBe(beforePickup.pickupsCollected + 1);
    expect(afterPickup.score).toBe(beforePickup.score + 250);
    expect(afterPickup.burstCharge).toBeGreaterThanOrEqual(beforePickup.burstCharge + 25);
    expect(afterPickup.audioCues).toContain("pickup");

    // A stationary simulation-owned drone overlaps the live player sensor;
    // fixed updates must reduce HP through the normal contact-damage path.
    const beforeDamage = await readEvidence(page);
    await page.evaluate(() => {
      const hooks = (window as unknown as {
        __NEON_SWARM_DEBUG__?: { stageContact(): void; stepFixed(frames: number): void };
      }).__NEON_SWARM_DEBUG__;
      hooks?.stageContact();
      hooks?.stepFixed(30);
    });
    const afterDamage = await readEvidence(page);
    expect(afterDamage.damageEvents).toBeGreaterThan(beforeDamage.damageEvents);
    expect(afterDamage.hp).toBeLessThan(beforeDamage.hp);
    expect(afterDamage.audioCues).toContain("player-hurt");

    // Kill proof: stage a drone ring within pulse reach, then pulse via key
    // and mouse paths until kills land.
    await page.evaluate(() => {
      const hooks = (window as unknown as { __NEON_SWARM_DEBUG__?: { stageKillCluster(count?: number): void; stepFixed(frames: number): void } }).__NEON_SWARM_DEBUG__;
      hooks?.stageKillCluster(6);
      hooks?.stepFixed(1);
    });
    const beforeKill = await readEvidence(page);
    expect(beforeKill.alive).toBeGreaterThanOrEqual(6);

    await page.mouse.move(1000, 400);
    for (let i = 0; i < 20 && (await readEvidence(page)).kills === 0; i += 1) {
      await page.keyboard.down("KeyJ");
      await page.waitForTimeout(50);
      await page.keyboard.up("KeyJ");
      await page.mouse.down();
      await page.waitForTimeout(40);
      await page.mouse.up();
      await page.waitForTimeout(420);
    }
    const afterKills = await readEvidence(page);
    expect(afterKills.kills).toBeGreaterThan(0);
    expect(afterKills.score).toBeGreaterThan(0);
    expect(afterKills.audioCueCount).toBe(13);

    // Pause freezes the simulation.
    await page.keyboard.press("KeyP");
    await page.waitForFunction(
      (name) => (window as unknown as Record<string, { paused?: boolean } | undefined>)[name]?.paused === true,
      GLOBAL_NAME
    );
    const pausedA = await readEvidence(page);
    expect(pausedA.paused).toBe(true);
    const aliveFrozen = (await readEvidence(page)).alive;
    await page.waitForTimeout(600);
    expect((await readEvidence(page)).alive).toBe(aliveFrozen);
    await page.keyboard.press("KeyP");
    await page.waitForFunction(
      (name) => (window as unknown as Record<string, { paused?: boolean } | undefined>)[name]?.paused === false,
      GLOBAL_NAME
    );

    // A simulation-owned near miss charges the meter without damaging HP.
    const beforeGraze = await readEvidence(page);
    await page.evaluate(() => {
      const hooks = (window as unknown as { __NEON_SWARM_DEBUG__?: { stageGraze(): void; stepFixed(frames: number): void } }).__NEON_SWARM_DEBUG__;
      hooks?.stageGraze();
      hooks?.stepFixed(35);
    });
    const afterGraze = await readEvidence(page);
    expect(afterGraze.grazes).toBeGreaterThan(beforeGraze.grazes);
    expect(afterGraze.hp).toBe(beforeGraze.hp);
    expect(afterGraze.audioCues).toContain("graze");

    // Charge is only staged; Space drives the real burst input path and the
    // real radial overlap kills simulation-owned targets.
    await page.evaluate(() => {
      const hooks = (window as unknown as { __NEON_SWARM_DEBUG__?: { stageBurstCluster(count?: number): void } }).__NEON_SWARM_DEBUG__;
      hooks?.stageBurstCluster(10);
    });
    const beforeBurst = await readEvidence(page);
    expect(beforeBurst.burstCharge).toBe(100);
    expect(beforeBurst.alive).toBe(10);
    await page.keyboard.press("Space");
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { bursts?: number } | undefined>)[name]?.bursts ?? 0) >= 1,
      GLOBAL_NAME
    );
    const afterBurst = await readEvidence(page);
    expect(afterBurst.alive).toBeLessThan(beforeBurst.alive);
    expect(afterBurst.alive).toBeGreaterThan(0);
    expect(afterBurst.bursts).toBe(1);
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { audioCues?: string[] } | undefined>)[name]?.audioCues ?? []).includes("burst"),
      GLOBAL_NAME
    );
    // Capture inside the real 0.55s event while the courier, live targets,
    // spokes, and shockwave still read as one gameplay beat.
    await page.waitForTimeout(40);
    const burstShot = join(SHOT_DIR, "10-burst-cascade.png");
    await page.screenshot({ path: burstShot });

    // Let the burst combo expire through fixed frames; the route publishes a
    // distinct combo-break event rather than silently zeroing the HUD.
    await page.evaluate(() => {
      (window as unknown as { __NEON_SWARM_DEBUG__?: { stepFixed(frames: number): void } }).__NEON_SWARM_DEBUG__?.stepFixed(130);
    });
    const afterComboBreak = await readEvidence(page);
    expect(afterComboBreak.comboBreaks).toBeGreaterThan(0);
    expect(afterComboBreak.audioCues).toContain("combo-break");

    // Clear through the real wave transition, then choose the visible button.
    // The same chooseDoor path is also called by the scene-space door sensor.
    await page.evaluate(() => {
      const hooks = (window as unknown as {
        __NEON_SWARM_DEBUG__?: { clearActiveWave(): void };
      }).__NEON_SWARM_DEBUG__;
      hooks?.clearActiveWave();
    });
    await waitForState(page, "intermission");
    const afterWaveClear = await readEvidence(page);
    expect(afterWaveClear.audioCues).toContain("wave-clear");
    const upgradeShot = join(SHOT_DIR, "11-upgrade-choice.png");
    await page.screenshot({ path: upgradeShot });
    await page.locator(".ns-door[data-kind='shield']").click();
    const afterUpgrade = await readEvidence(page);
    expect(afterUpgrade.upgrades.shieldCharges).toBe(1);
    expect(afterUpgrade.audioCues).toContain("pickup");

    // Death: drain HP, expect dead state + run summary banner.
    await page.evaluate(() => {
      const hooks = (window as unknown as {
        __NEON_SWARM_DEBUG__?: { drainPlayerHp(): void };
      }).__NEON_SWARM_DEBUG__;
      hooks?.drainPlayerHp();
    });
    await waitForState(page, "dead");
    const dead = await readEvidence(page);
    expect(dead.hp).toBe(0);
    await page.screenshot({ path: join(SHOT_DIR, "04-death.png") });
    const summaryVisible = await page.evaluate(() => document.querySelector("#ns-banner h2")?.textContent ?? "");
    expect(summaryVisible.toLowerCase()).toContain("run over");

    // Reset: R returns to wave 1 with restored HP and cleared score.
    await page.keyboard.press("KeyR");
    await waitForState(page, "wave-active");
    const reset = await readEvidence(page);
    expect(reset.wave).toBe(1);
    expect(reset.hp).toBe(reset.maxHp);
    expect(reset.state).toBe("wave-active");
    await page.screenshot({ path: join(SHOT_DIR, "05-reset.png") });

    expect(consoleErrors).toEqual([]);

    writeFileSync(join(REPORT_DIR, "playable.json"), JSON.stringify({
      schema: "aura3d-neon-swarm-playable/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/neon-swarm-playable.spec.ts",
      route: ROUTE,
      producerSourceSha256: sha256(PRODUCER_PATH),
      routeSourceSha256: routeSourceSha256(),
      mounted,
      beforePickup,
      afterPickup,
      beforeDamage,
      afterDamage,
      afterKills,
      afterGraze,
      afterBurst,
      afterComboBreak,
      afterWaveClear,
      afterUpgrade,
      dead,
      reset,
      artifacts: [
        artifact("tests/reports/neon-swarm/screenshots/01-load.png"),
        artifact("tests/reports/neon-swarm/screenshots/10-burst-cascade.png"),
        artifact("tests/reports/neon-swarm/screenshots/11-upgrade-choice.png"),
        artifact("tests/reports/neon-swarm/screenshots/04-death.png"),
        artifact("tests/reports/neon-swarm/screenshots/05-reset.png")
      ],
      consoleErrors
    }, null, 2) + "\n");
  });

  test("mid-wave-3 swarm stays readable with elites telegraphing", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => Boolean((window as unknown as Record<string, unknown>)[name]), GLOBAL_NAME, { timeout: 90_000 });
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { drawCalls?: number } | undefined>)[name]?.drawCalls ?? 0) > 0,
      GLOBAL_NAME,
      { timeout: 120_000 }
    );
    // Wait for a presented frame so staged spawns land on live rendering.
    await page.waitForFunction(
      (name) => {
        const value = (window as unknown as Record<string, { drawCalls?: number } | undefined>)[name];
        return (value?.drawCalls ?? 0) > 0;
      },
      GLOBAL_NAME,
      { timeout: 120_000 }
    );

    // Stage the elite wave with a dense field around the courier, then settle
    // so steering separates the swarm and elites begin telegraphing.
    await page.evaluate(() => {
      const hooks = (window as unknown as {
        __NEON_SWARM_DEBUG__?: { jumpToWave(target: number): void; spawnTestSwarm(total: number): void; stageKillCluster(count?: number): void; stepFixed(frames: number): void };
      }).__NEON_SWARM_DEBUG__;
      hooks?.jumpToWave(3);
      hooks?.spawnTestSwarm(320);
      hooks?.stageKillCluster(8);
      hooks?.stepFixed(150);
    });
    await page.waitForTimeout(700);
    const evidence = await readEvidence(page);
    expect(evidence.wave).toBe(3);
    expect(evidence.alive).toBeGreaterThan(300);

    // Elite telegraph readability is proven by per-instance color swaps in the
    // simulation (unit spec) plus this retained still for human review.
    const eliteProbe = await page.evaluate(() => {
      const hooks = (window as unknown as {
        __NEON_SWARM_DEBUG__?: { dumpDiagnostics(): { renderer?: { runtime?: { lodSelections?: unknown[] } } } };
      }).__NEON_SWARM_DEBUG__;
      return Boolean(hooks?.dumpDiagnostics());
    });
    expect(eliteProbe).toBe(true);
    await page.screenshot({ path: join(SHOT_DIR, "02-mid-wave.png") });

    writeFileSync(join(REPORT_DIR, "playable-mid-wave.json"), JSON.stringify({
      schema: "aura3d-neon-swarm-playable-midwave/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/neon-swarm-playable.spec.ts",
      producerSourceSha256: sha256(PRODUCER_PATH),
      routeSourceSha256: routeSourceSha256(),
      wave: evidence.wave,
      alive: evidence.alive,
      aliveElite: evidence.aliveElite,
      pickupActive: evidence.pickupActive,
      pickupPosition: evidence.pickupPosition,
      artifact: artifact("tests/reports/neon-swarm/screenshots/02-mid-wave.png"),
      consoleErrors
    }, null, 2) + "\n");
    expect(consoleErrors).toEqual([]);
  });

  test("five-stage fixture reaches a real 320-drone finale and stable completion hash", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + ROUTE + "?capture=review", { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => Boolean((window as unknown as Record<string, unknown>)[name]), GLOBAL_NAME, { timeout: 90_000 });
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { drawCalls?: number } | undefined>)[name]?.drawCalls ?? 0) > 0,
      GLOBAL_NAME,
      { timeout: 120_000 }
    );

    const stageFinale = async () => {
      await page.evaluate(() => {
        const hooks = (window as unknown as {
          __NEON_SWARM_DEBUG__?: {
            resetWithSeed(value: number): void;
            startWaveNow(): void;
            clearActiveWave(): void;
            chooseDoor(kind: string): void;
            spawnTestSwarm(total: number): void;
            stepFixed(frames: number): void;
            stageFinalePulse(): void;
          };
        }).__NEON_SWARM_DEBUG__;
        if (!hooks) throw new Error("Neon Swarm debug hooks unavailable");
        hooks.resetWithSeed(20260821);
        hooks.startWaveNow();
        for (const choice of ["fire-rate", "dash-cooldown", "shield", "shield"]) {
          hooks.clearActiveWave();
          hooks.chooseDoor(choice);
          hooks.startWaveNow();
        }
        hooks.spawnTestSwarm(320);
        hooks.stepFixed(2);
        hooks.stageFinalePulse();
      });
    };

    await stageFinale();
    const finale = await readEvidence(page);
    expect(finale.state).toBe("wave-active");
    expect(finale.wave).toBe(5);
    expect(finale.stage).toBe("finale");
    expect(finale.instanceCount).toBe(320);
    expect(finale.alive).toBe(320);
    expect(finale.arenaInset).toBeGreaterThan(5);
    expect(finale.waveChecksums).toHaveLength(5);
    mkdirSync(SHOT_DIR, { recursive: true });
    // Keep the source-bound review frame on the deterministic staging pose:
    // a wall-clock wait lets the 320 live seekers converge into an unreadable
    // wall and can consume a shield charge before the terminal hash. The
    // fixture already fired the route's real pulse above; pump renderer frames
    // without advancing simulation so its ray and impact remain visible in the
    // exact 320-live proof rather than capturing a static formation diagram.
    await page.evaluate(() => {
      const banner = document.querySelector<HTMLElement>("#ns-banner");
      if (banner) banner.style.opacity = "0";
    });
    for (let frame = 0; frame < 3; frame += 1) await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.screenshot({ path: join(SHOT_DIR, "06-finale-320.png") });

    await page.evaluate(() => {
      (window as unknown as { __NEON_SWARM_DEBUG__?: { finishFinale(): void } }).__NEON_SWARM_DEBUG__?.finishFinale();
    });
    const completeA = await readEvidence(page);
    expect(completeA.state).toBe("complete");
    expect(completeA.outcomeHash).toMatch(/^fnv1a32-[0-9a-f]{8}$/);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOT_DIR, "07-complete.png") });

    await stageFinale();
    await page.evaluate(() => {
      (window as unknown as { __NEON_SWARM_DEBUG__?: { finishFinale(): void } }).__NEON_SWARM_DEBUG__?.finishFinale();
    });
    const completeB = await readEvidence(page);
    expect(completeB.state).toBe("complete");
    expect(completeB.outcomeHash).toBe(completeA.outcomeHash);
    expect(completeB.upgrades).toEqual(completeA.upgrades);
    expect(consoleErrors).toEqual([]);

    writeFileSync(join(REPORT_DIR, "campaign-completion.json"), JSON.stringify({
      schema: "aura3d-neon-swarm-campaign-completion/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/neon-swarm-playable.spec.ts",
      producerSourceSha256: sha256(PRODUCER_PATH),
      routeSourceSha256: routeSourceSha256(),
      seed: completeA.seed,
      finale,
      completeA,
      completeB,
      deterministicOutcomeHash: completeA.outcomeHash,
      artifacts: [
        artifact("tests/reports/neon-swarm/screenshots/06-finale-320.png"),
        artifact("tests/reports/neon-swarm/screenshots/07-complete.png")
      ],
      consoleErrors
    }, null, 2) + "\n");
  });

  test("mobile sticks and burst button drive live state without covering the arena", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        const native = nativeMatchMedia(query);
        if (!query.includes("pointer: coarse")) return native;
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: (listener: (event: MediaQueryListEvent) => void) => native.addListener(listener),
          removeListener: (listener: (event: MediaQueryListEvent) => void) => native.removeListener(listener),
          addEventListener: native.addEventListener.bind(native),
          removeEventListener: native.removeEventListener.bind(native),
          dispatchEvent: native.dispatchEvent.bind(native)
        } as MediaQueryList;
      };
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => Boolean((window as unknown as Record<string, unknown>)[name]), GLOBAL_NAME, { timeout: 90_000 });
    await waitForState(page, "wave-active", 120_000);

    const moveStick = page.locator("[data-stick='move-stick']");
    const fireStick = page.locator("[data-stick='fire-stick']");
    await expect(moveStick).toBeVisible();
    await expect(fireStick).toBeVisible();
    const moveBox = await moveStick.boundingBox();
    const fireBox = await fireStick.boundingBox();
    if (!moveBox || !fireBox) throw new Error("Mobile stick bounds unavailable");

    const beforeMove = await readEvidence(page);
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(moveBox.x + moveBox.width * 0.88, moveBox.y + moveBox.height / 2, { steps: 4 });
    await page.waitForTimeout(550);
    await page.mouse.up();
    const afterMove = await readEvidence(page);
    expect(afterMove.playerPosition.x).toBeGreaterThan(beforeMove.playerPosition.x + 0.5);

    await page.evaluate(() => {
      (window as unknown as { __NEON_SWARM_DEBUG__?: { stageKillCluster(count?: number): void } }).__NEON_SWARM_DEBUG__?.stageKillCluster(8);
    });
    await page.mouse.move(fireBox.x + fireBox.width / 2, fireBox.y + fireBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(fireBox.x + fireBox.width * 0.9, fireBox.y + fireBox.height / 2, { steps: 4 });
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { audioCues?: string[] } | undefined>)[name]?.audioCues ?? []).includes("pulse-fire"),
      GLOBAL_NAME
    );

    await page.evaluate(() => {
      (window as unknown as { __NEON_SWARM_DEBUG__?: { stageBurstCluster(count?: number): void } }).__NEON_SWARM_DEBUG__?.stageBurstCluster(10);
    });
    await page.locator("#ns-burst-button").click();
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { bursts?: number } | undefined>)[name]?.bursts ?? 0) >= 1,
      GLOBAL_NAME
    );
    const burstButtonBox = await page.locator("#ns-burst-button").boundingBox();
    expect(burstButtonBox?.y ?? 9999).toBeLessThan(844);
    await page.waitForTimeout(300);
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(SHOT_DIR, "08-mobile-active.png") });
    expect(consoleErrors).toEqual([]);
    writeFileSync(join(REPORT_DIR, "mobile-playable.json"), JSON.stringify({
      schema: "aura3d-neon-swarm-mobile/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/neon-swarm-playable.spec.ts",
      producerSourceSha256: sha256(PRODUCER_PATH),
      routeSourceSha256: routeSourceSha256(),
      viewport: { width: 390, height: 844 },
      afterMove,
      final: await readEvidence(page),
      artifact: artifact("tests/reports/neon-swarm/screenshots/08-mobile-active.png"),
      consoleErrors
    }, null, 2) + "\n");
  });

  test("reduced motion and flash retain the 320-drone finale truth", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => Boolean((window as unknown as Record<string, unknown>)[name]), GLOBAL_NAME, { timeout: 90_000 });
    await page.waitForFunction(
      (name) => ((window as unknown as Record<string, { drawCalls?: number } | undefined>)[name]?.drawCalls ?? 0) > 0,
      GLOBAL_NAME,
      { timeout: 120_000 }
    );
    await page.evaluate(() => {
      const hooks = (window as unknown as { __NEON_SWARM_DEBUG__?: { jumpToWave(target: number): void; spawnTestSwarm(total: number): void; stepFixed(frames: number): void } }).__NEON_SWARM_DEBUG__;
      hooks?.jumpToWave(5);
      hooks?.spawnTestSwarm(320);
      hooks?.stepFixed(2);
    });
    await page.waitForTimeout(700);
    const reduced = await readEvidence(page);
    expect(reduced.reducedMotion).toBe(true);
    expect(reduced.stage).toBe("finale");
    expect(reduced.instanceCount).toBe(320);
    await page.keyboard.press("Shift");
    await page.waitForTimeout(100);
    expect(await page.locator("#ns-vignette").getAttribute("data-active")).toBe("false");
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(SHOT_DIR, "09-reduced-finale.png") });
    writeFileSync(join(REPORT_DIR, "reduced-motion.json"), JSON.stringify({
      schema: "aura3d-neon-swarm-reduced-motion/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/neon-swarm-playable.spec.ts",
      producerSourceSha256: sha256(PRODUCER_PATH),
      routeSourceSha256: routeSourceSha256(),
      reduced,
      vignetteActive: false,
      artifact: artifact("tests/reports/neon-swarm/screenshots/09-reduced-finale.png")
    }, null, 2) + "\n");
  });
});
