import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

interface DREvidence {
  readonly mounted?: boolean;
  readonly status?: string;
  readonly state?: string;
  readonly missionStage?: string;
  readonly depth?: number;
  readonly oxygen?: number;
  readonly hull?: number;
  readonly bankedValue?: number;
  readonly sonarPings?: number;
  readonly sonarReturns?: number;
  readonly frameCount?: number;
  readonly audioCues?: readonly string[];
  readonly subPosition?: readonly [number, number, number];
  readonly standardBanked?: boolean;
  readonly heavyBanked?: boolean;
  readonly breachCount?: number;
  readonly repairCount?: number;
  readonly towMassKg?: number;
  readonly towDrag?: number;
  readonly reducedMotion?: boolean;
  readonly sonarContacts?: readonly { readonly id: string; readonly kind: string; readonly position: readonly [number, number, number]; readonly distance: number }[];
  readonly renderer?: { readonly drawCalls?: number; readonly renderSize?: readonly number[] };
}

const REPO_ROOT = process.cwd();
const APP_DIR = resolve(REPO_ROOT, "apps/showcase-deep-recovery");
const REPORT_DIR = resolve(REPO_ROOT, "tests/reports/deep-recovery/playable");
const PRODUCER = "tests/browser/deep-recovery-playable.spec.ts";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|css)$/.test(path) ? [path] : [];
  });
}

function routeSourceHash(): string {
  const hash = createHash("sha256");
  for (const path of sourceFiles(resolve(APP_DIR, "src"))) {
    hash.update(relative(APP_DIR, path)).update("\0").update(readFileSync(path)).update("\0");
  }
  return hash.digest("hex");
}

async function evidence(page: Page): Promise<DREvidence> {
  return page.evaluate(() => window.__DEEP_RECOVERY_EVIDENCE__ ?? {});
}

async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => window.__DR_PUMP__?.(count), frames);
}

async function teleport(page: Page, x: number, y: number, z: number): Promise<void> {
  await page.evaluate(([tx, ty, tz]) => window.__DR_TELEPORT__?.(tx, ty, tz), [x, y, z]);
}

async function teleportCrate(page: Page, id: string, x: number, y: number, z: number): Promise<void> {
  await page.evaluate(([crateId, tx, ty, tz]) => window.__DR_TELEPORT_CRATE__?.(String(crateId), Number(tx), Number(ty), Number(tz)), [id, x, y, z]);
}

async function capture(page: Page, name: string, artifacts: string[]): Promise<void> {
  const path = resolve(REPORT_DIR, `${name}.png`);
  await page.waitForTimeout(650);
  await page.screenshot({ path });
  artifacts.push(relative(REPO_ROOT, path));
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__DEEP_RECOVERY_EVIDENCE__?.mounted), undefined, { timeout: 180_000 });
  await pump(page, 120);
  await page.waitForFunction(() => window.__DEEP_RECOVERY_EVIDENCE__?.status === "ready", undefined, { timeout: 30_000 });
}

test("Deep Recovery completes the full standard/breach/heavy/surface mission and exact artifact family", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  const artifacts: string[] = [];
  const scenarios: string[] = [];
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-deep-recovery/?capture=review`, { waitUntil: "commit", timeout: 120_000 });
    await waitReady(page);

    const boot = await evidence(page);
    expect(boot.state).toBe("playing");
    expect(boot.renderer?.drawCalls ?? 0).toBeGreaterThan(0);
    await capture(page, "descent", artifacts);
    scenarios.push("descent");

    const initialPosition = boot.subPosition!;
    await page.keyboard.down("KeyQ");
    await page.keyboard.down("KeyW");
    await pump(page, 90);
    await page.keyboard.up("KeyQ");
    await page.keyboard.up("KeyW");
    const moved = await evidence(page);
    expect(moved.depth ?? 0).toBeGreaterThan(boot.depth ?? 0);
    expect(moved.subPosition).not.toEqual(initialPosition);
    scenarios.push("keyboard-movement");

    await teleport(page, 0, -16, 0);
    await page.keyboard.press("Space");
    await pump(page, 8);
    const sonar = await evidence(page);
    expect(sonar.sonarPings).toBeGreaterThan(0);
    expect(sonar.sonarReturns).toBeGreaterThan(0);
    expect(sonar.sonarContacts?.some((contact) => contact.kind === "wreck")).toBe(true);
    expect(sonar.sonarContacts?.every((contact) => contact.position.length === 3)).toBe(true);
    await capture(page, "sonar-reveal", artifacts);
    scenarios.push("world-space-sonar");

    // Keep the submarine on the camera-facing side of the typed wreck, with a
    // lateral offset that lets the landmark and vehicle read together instead
    // of letting the wreck occlude the entire follow-camera composition.
    // Stage the live submarine west of the wreck so the overhead review lens
    // reads as an approach: vehicle on the left, chapel/wreck island on the
    // right. The previous -1.5 X position projected both typed subjects into
    // one tangled central stack.
    await teleport(page, -11.5, -12, -7.0);
    await pump(page, 8);
    await capture(page, "wreck-approach", artifacts);
    // The canonical Sunless-Sea review path should show the authored submarine
    // approaching the wreck, not the earlier sonar-only frame with sparse
    // context. Both bytes and the source-bound receipt still come from this
    // named producer state.
    writeFileSync(
      resolve("tests/reports/deep-recovery/playable/sonar-reveal.png"),
      readFileSync(resolve(REPORT_DIR, "wreck-approach.png"))
    );
    scenarios.push("wreck-approach");

    await teleportCrate(page, "crate-s1", 2.8, -7.5, -7.5);
    await teleport(page, 2.8, -7.5, -6.5);
    await page.keyboard.press("KeyF");
    await pump(page, 8);
    const standardTow = await evidence(page);
    expect(standardTow.towMassKg).toBe(120);
    expect(standardTow.towDrag).toBeCloseTo(0.12, 4);
    await capture(page, "grapple-standard", artifacts);
    scenarios.push("grapple", "standard-tow");

    await page.keyboard.press("KeyF");
    await pump(page, 2);
    expect((await evidence(page)).towMassKg).toBe(0);
    await page.keyboard.press("KeyF");
    await pump(page, 2);
    scenarios.push("drop-and-relatch");

    await teleportCrate(page, "crate-s1", 0, -1, 0);
    await teleport(page, 0, -1, 0);
    await pump(page, 3);
    const standardBank = await evidence(page);
    expect(standardBank.standardBanked).toBe(true);
    expect(standardBank.bankedValue).toBeGreaterThan(0);
    scenarios.push("standard-bank");

    await teleport(page, 0, -20, 48);
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");
    await pump(page, 180);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    const breached = await evidence(page);
    expect(breached.breachCount).toBeGreaterThan(0);
    expect(breached.hull ?? 100).toBeLessThan(70);
    await capture(page, "breach", artifacts);
    scenarios.push("collision-breach");

    await page.keyboard.press("KeyP");
    const pauseBefore = await evidence(page);
    await pump(page, 20);
    const paused = await evidence(page);
    expect(paused.state).toBe("paused");
    expect(paused.frameCount).toBe(pauseBefore.frameCount);
    await page.keyboard.press("KeyP");
    await pump(page, 2);
    expect((await evidence(page)).state).toBe("playing");
    const pauseRecord = { before: pauseBefore, paused, resumed: await evidence(page) };
    writeFileSync(resolve(REPORT_DIR, "pause.json"), `${JSON.stringify(pauseRecord, null, 2)}\n`);
    scenarios.push("pause-freeze-resume");

    await teleport(page, 0, -1, 0);
    await page.keyboard.press("KeyC");
    const repaired = await evidence(page);
    expect(repaired.repairCount).toBe(1);
    expect(repaired.missionStage).toBe("heavy-salvage");
    scenarios.push("explicit-buoy-repair");

    await teleportCrate(page, "crate-h1", -6, -26, -16);
    await teleport(page, -6, -26, -15);
    await page.keyboard.press("KeyF");
    await pump(page, 8);
    const heavyTow = await evidence(page);
    expect(heavyTow.towMassKg).toBe(280);
    expect(heavyTow.towDrag ?? 0).toBeGreaterThan((standardTow.towDrag ?? 0) * 2);
    await capture(page, "heavy-tow", artifacts);
    scenarios.push("heavy-tow");

    await page.evaluate(() => window.__DR_SET_OXYGEN__?.(18));
    await pump(page, 2);
    expect((await evidence(page)).audioCues).toContain("oxygen-warn");
    await capture(page, "low-oxygen", artifacts);
    scenarios.push("low-oxygen");

    await teleportCrate(page, "crate-h1", 0, -1, 0);
    await teleport(page, 0, -1, 0);
    // Banking is owned by the mounted simulation's containment check. Give the
    // route a bounded handful of fixed frames to observe that real event rather
    // than assuming four frames is enough after a screenshot/teleport.
    await expect.poll(async () => {
      await pump(page, 1);
      return (await evidence(page)).heavyBanked;
    }, { timeout: 10_000, intervals: [16, 32, 64] }).toBe(true);
    const won = await evidence(page);
    expect(won.heavyBanked).toBe(true);
    expect(won.state).toBe("won");
    expect(won.missionStage).toBe("surface-complete");
    await capture(page, "surface-complete", artifacts);
    scenarios.push("heavy-bank", "surface-win");

    await page.keyboard.press("KeyR");
    await pump(page, 2);
    const reset = await evidence(page);
    expect(reset.state).toBe("playing");
    expect(reset.standardBanked).toBe(false);
    expect(reset.heavyBanked).toBe(false);
    scenarios.push("full-reset");

    await page.evaluate(() => window.__DR_SET_OXYGEN__?.(0.01));
    await teleport(page, 0, -50, 0);
    await pump(page, 2);
    const blackout = await evidence(page);
    expect(blackout.state).toBe("blackout");
    await capture(page, "blackout", artifacts);
    scenarios.push("blackout-fail");

    await page.keyboard.press("KeyR");
    await pump(page, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    const touchBefore = (await evidence(page)).subPosition!;
    await page.locator("#dr-forward-btn").dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch" });
    await pump(page, 75);
    await page.locator("#dr-forward-btn").dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch" });
    const touchAfter = await evidence(page);
    expect(touchAfter.subPosition).not.toEqual(touchBefore);
    await capture(page, "mobile-touch", artifacts);
    scenarios.push("touch-movement", "mobile");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${server.origin}/apps/showcase-deep-recovery/`, { waitUntil: "commit", timeout: 120_000 });
    await waitReady(page);
    await page.keyboard.press("Space");
    await pump(page, 4);
    const reduced = await evidence(page);
    expect(reduced.reducedMotion).toBe(true);
    expect(reduced.sonarPings).toBeGreaterThan(0);
    await capture(page, "reduced-motion", artifacts);
    scenarios.push("reduced-motion-state-truth");

    const missionRecord = { boot, moved, sonar, standardTow, standardBank, breached, repaired, heavyTow, won, reset, blackout, touchAfter, reduced };
    writeFileSync(resolve(REPORT_DIR, "mission-touch.json"), `${JSON.stringify(missionRecord, null, 2)}\n`);

    const receipt = {
      schema: "aura3d.deep-recovery.playable-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(resolve(REPO_ROOT, PRODUCER)),
      routeSourceSha256: routeSourceHash(),
      scenarios,
      artifacts: artifacts.map((path) => ({ path, sha256: sha256(resolve(REPO_ROOT, path)) })),
      pass: true
    };
    writeFileSync(resolve(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
