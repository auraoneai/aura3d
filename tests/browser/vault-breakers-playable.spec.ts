import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Vault Breakers playable evidence (PRD VB-14): plunger serve -> live ball ->
 * flipper input changes state -> tilt lock -> ball drains without flipper help
 * -> next ball / game over -> full reset restores a fresh machine.
 */

interface VaultEvidence {
  readonly mounted?: boolean;
  readonly ball?: number;
  readonly ballsRemaining?: number;
  readonly score?: number;
  readonly multiplier?: number;
  readonly banksDown?: number;
  readonly state?: string;
  readonly phase?: string;
  readonly flipperMode?: string;
  readonly flipperEvents?: number;
  readonly flipperLeftRaised?: boolean;
  readonly flipperRightRaised?: boolean;
  readonly tiltStrikes?: number;
  readonly tiltLocked?: boolean;
  readonly sensorEventCount?: number;
  readonly activeBalls?: number;
  readonly vaultOpen?: boolean;
  readonly multiball?: boolean;
  readonly missionLine?: string;
  readonly text3DScoreboards?: number;
  readonly resetHashMatch?: boolean | null;
  readonly audioCues?: readonly string[];
  readonly backend?: string;
  readonly frameCount?: number;
  readonly plunger?: { readonly phase?: string; readonly charge?: number };
  readonly touchControlEvents?: readonly string[];
}

async function readEvidence(page: Page): Promise<VaultEvidence> {
  return page.evaluate(() => (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: VaultEvidence }).__VAULT_BREAKERS_EVIDENCE__ ?? {});
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: unknown }).__VAULT_BREAKERS_EVIDENCE__),
    undefined,
    { timeout: 180_000 }
  );
}

async function serve(page: Page, holdMs = 900): Promise<void> {
  await page.keyboard.down("Space");
  await page.waitForTimeout(holdMs);
  await page.keyboard.up("Space");
  await page.waitForFunction(() => {
    const ev = (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { phase?: string; state?: string } }).__VAULT_BREAKERS_EVIDENCE__;
    return ev?.phase === "play" || ev?.state === "play";
  }, undefined, { timeout: 30_000 });
}

const REPORT_DIR = "tests/reports/vault-breakers/playable";
const PRODUCER = "tests/browser/vault-breakers-playable.spec.ts";

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
  const appDir = resolve("apps/showcase-vault-breakers");
  const files = sourceFiles(join(appDir, "src"));
  const hash = createHash("sha256");
  for (const path of files) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return { files: files.map((path) => relative(resolve(), path)), sha256: hash.digest("hex") };
}

test("vault breakers serves, flips, tilts, drains, and resets", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const logDir = testInfo.outputPath("run");
  mkdirSync(logDir, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-vault-breakers/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    const boot = await readEvidence(page);
    expect(boot.backend, "route must run on the rapier backend").toBe("rapier");
    expect(boot.flipperMode, "flipper mode must be joint (VB-01 spike verdict)").toBe("joint");
    expect(boot.text3DScoreboards ?? 0, "in-world text3D scoreboard nodes must exist").toBeGreaterThan(60);
    expect(boot.phase ?? boot.state).toBe("attract");

    // Serve ball 1.
    await serve(page);
    let state = await readEvidence(page);
    expect(state.phase ?? state.state).toBe("play");
    expect(state.ball).toBe(1);
    expect(state.activeBalls ?? 0).toBeGreaterThanOrEqual(1);
    expect((state.audioCues ?? []).join(",")).toContain("plunger-release");

    // Flipper input visibly changes state: hold both, bats report raised.
    await page.keyboard.down("KeyA");
    await page.keyboard.down("KeyD");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { flipperLeftRaised?: boolean; flipperRightRaised?: boolean } }).__VAULT_BREAKERS_EVIDENCE__;
      return ev?.flipperLeftRaised === true && ev?.flipperRightRaised === true;
    }, undefined, { timeout: 20_000 });
    state = await readEvidence(page);
    expect(state.flipperEvents ?? 0).toBeGreaterThanOrEqual(2);
    expect((state.audioCues ?? []).join(",")).toContain("flipper-snap");
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyD");

    // Tilt: three nudges lock the flippers.
    for (let nudge = 0; nudge < 3; nudge += 1) {
      await page.keyboard.press("KeyS");
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { tiltLocked?: boolean } }).__VAULT_BREAKERS_EVIDENCE__;
      return ev?.tiltLocked === true;
    }, undefined, { timeout: 10_000 });
    state = await readEvidence(page);
    expect(state.tiltStrikes).toBe(3);
    expect((state.audioCues ?? []).join(",")).toContain("tilt-warn");

    // Tilt-locked ball drains without flipper help -> next ball or game over.
    // Headless tabs throttle rAF during passive waits, so simulated time is
    // advanced deterministically through the route's public app.step() pump
    // (up to 300 sim-seconds) instead of wall-clock waiting.
    let drained = false;
    for (let batch = 0; batch < 150 && !drained; batch += 1) {
      await page.evaluate(() => {
        (window as unknown as { __VB_PUMP__?: (frames: number) => number }).__VB_PUMP__?.(120);
      });
      drained = await page.evaluate(() => {
        const ev = (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { phase?: string; state?: string } }).__VAULT_BREAKERS_EVIDENCE__;
        return ev?.phase === "await-serve" || ev?.state === "await-serve" || ev?.phase === "game-over" || ev?.state === "game-over";
      });
    }
    expect(drained, "tilt-locked ball must drain within 300 simulated seconds").toBe(true);
    const afterDrain = await readEvidence(page);
    expect((afterDrain.phase ?? afterDrain.state) === "await-serve" || (afterDrain.phase ?? afterDrain.state) === "game-over").toBe(true);
    expect(afterDrain.tiltLocked, "tilt lock must clear at ball end").toBe(false);
    writeFileSync(join(logDir, "after-drain.json"), JSON.stringify(afterDrain, null, 2));
    writeFileSync(join(REPORT_DIR, "playable.json"), JSON.stringify(afterDrain, null, 2));

    // Full reset restores a fresh machine.
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { phase?: string; state?: string; score?: number; resetHashMatch?: boolean | null } }).__VAULT_BREAKERS_EVIDENCE__;
      return (ev?.phase === "attract" || ev?.state === "attract") && Number(ev?.score ?? -1) === 0 && ev?.resetHashMatch === true;
    }, undefined, { timeout: 30_000 });
    const reset = await readEvidence(page);
    writeFileSync(join(logDir, "reset.json"), JSON.stringify(reset, null, 2));
    expect(reset.phase ?? reset.state).toBe("attract");
    expect(reset.banksDown).toBe(0);
    expect(reset.ballsRemaining).toBe(3);
    writeFileSync(join(REPORT_DIR, "reset.json"), `${JSON.stringify(reset, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

test("vault breakers proves bank mission, vault opening, multiball, outcomes, and touch controls", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-vault-breakers/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);

    const scenario = async (name: string): Promise<VaultEvidence> => {
      await page.evaluate((scenarioName) => {
        (window as unknown as { __VB_SCENARIO__?: (scenario: string) => string }).__VB_SCENARIO__?.(scenarioName);
      }, name);
      await page.waitForTimeout(150);
      return readEvidence(page);
    };

    const nearComplete = await scenario("bank-near-complete");
    expect(nearComplete.banksDown).toBe(4);
    expect(nearComplete.vaultOpen).toBe(false);
    expect(nearComplete.missionLine).toContain("1 TO GO");

    const vault = await scenario("vault-opening");
    expect(vault.banksDown).toBe(5);
    expect(vault.vaultOpen).toBe(true);
    expect(vault.missionLine).toBe("VAULT IS OPEN");
    expect(vault.audioCues).toContain("vault-open");

    const multiball = await scenario("multiball");
    expect(multiball.multiball).toBe(true);
    expect(multiball.activeBalls ?? 0).toBeGreaterThanOrEqual(2);
    expect(multiball.audioCues).toContain("multiball");

    const tilted = await scenario("tilt");
    expect(tilted.tiltLocked).toBe(true);
    expect(tilted.tiltStrikes).toBe(3);

    const gameOver = await scenario("game-over");
    expect(gameOver.phase).toBe("game-over");
    expect(gameOver.ballsRemaining).toBe(0);

    await scenario("attract");
    await page.locator("#vb-plunge-button").evaluate((button) => button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1, isPrimary: true, buttons: 1 })));
    await page.evaluate(() => (window as unknown as { __VB_PUMP__?: (frames: number) => number }).__VB_PUMP__?.(1));
    expect((await readEvidence(page)).plunger?.phase).toBe("charging");
    await page.evaluate(() => (window as unknown as { __VB_PUMP__?: (frames: number) => number }).__VB_PUMP__?.(30));
    await page.locator("#vb-plunge-button").evaluate((button) => button.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true })));
    await page.evaluate(() => (window as unknown as { __VB_PUMP__?: (frames: number) => number }).__VB_PUMP__?.(3));
    const touchServe = await readEvidence(page);
    expect(touchServe.phase, JSON.stringify({ plunger: touchServe.plunger, touchControlEvents: touchServe.touchControlEvents })).toBe("play");
    await page.locator("#vb-left-button").evaluate((button) => button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 2, isPrimary: true, buttons: 1 })));
    await page.evaluate(() => (window as unknown as { __VB_PUMP__?: (frames: number) => number }).__VB_PUMP__?.(30));
    expect((await readEvidence(page)).flipperLeftRaised).toBe(true);
    await page.locator("#vb-left-button").evaluate((button) => button.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true })));
    const touched = await readEvidence(page);
    expect(touched.activeBalls ?? 0).toBeGreaterThan(0);
    expect(touched.audioCues).toContain("plunger-release");
    writeFileSync(join(REPORT_DIR, "mission-touch.json"), `${JSON.stringify({ nearComplete, vault, multiball, tilted, gameOver, touchServe, touched }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

test("vault breakers pause freezes the frame loop deterministically", async ({ page }) => {
  test.setTimeout(180_000);
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-vault-breakers/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    await serve(page);
    await page.keyboard.press("KeyP");
    const pausedFrame = await readEvidence(page);
    await page.waitForTimeout(600);
    const stillPaused = await readEvidence(page);
    expect(pausedFrame.state).toBe("paused");
    expect(stillPaused.frameCount, "frame counter must freeze while paused").toBe(pausedFrame.frameCount);
    await page.keyboard.press("KeyP");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { state?: string } }).__VAULT_BREAKERS_EVIDENCE__;
      return ev?.state === "play";
    }, undefined, { timeout: 20_000 });
    const resumed = await readEvidence(page);
    writeFileSync(join(REPORT_DIR, "pause.json"), `${JSON.stringify({ pausedFrame, stillPaused, resumed }, null, 2)}\n`);
    const binding = routeSourceBinding();
    const files = ["playable.json", "reset.json", "mission-touch.json", "pause.json"];
    writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
      schema: "aura3d.vault-breakers.playable-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(PRODUCER),
      routeSourceFiles: binding.files,
      routeSourceSha256: binding.sha256,
      scenarios: ["keyboard-serve", "joint-flippers", "tilt-lock", "natural-drain", "full-reset", "bank-near-complete", "vault-opening", "multiball", "game-over", "touch-charge-release", "touch-flipper", "pause-freeze-resume"],
      artifacts: files.map((file) => ({ path: `${REPORT_DIR}/${file}`, sha256: sha256(`${REPORT_DIR}/${file}`) })),
      pass: true
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
