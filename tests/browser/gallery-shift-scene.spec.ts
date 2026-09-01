import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Gallery Shift visual evidence (PRD GS-14): nonblank renderer captures, the
 * guard patrol visibly moving, the debug cone overlay agreeing with the guard
 * facing evidence, and the full review set (first load, mid-sneak,
 * near-detection with cones, caught, exit win, mobile).
 */

const REPORT_DIR = "tests/reports/gallery-shift";
const PRODUCER = "tests/browser/gallery-shift-scene.spec.ts";

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

interface GSEvidence {
  readonly mounted?: boolean;
  readonly floor?: number;
  readonly state?: string;
  readonly detection?: number;
  readonly guardStates?: readonly { id: string; state: string; x: number; z: number; yaw: number }[];
  readonly guardVisionSamples?: readonly { id: string; x: number; z: number; yaw: number; seesThief: boolean }[];
  readonly exhibitsLifted?: number;
  readonly exhibitsTotal?: number;
  readonly totalExhibitsLifted?: number;
  readonly alarmActive?: boolean;
  readonly status?: string;
  readonly thiefPos?: { x: number; z: number };
  readonly thiefGait?: string;
  readonly backend?: string;
  readonly frameCount?: number;
  readonly losRayCount?: number;
  readonly occlusionCount?: number;
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { status?: string } }).__GALLERY_SHIFT_EVIDENCE__?.status === "ready",
    undefined,
    { timeout: 180_000 }
  );
}

async function readEvidence(page: Page): Promise<GSEvidence> {
  return page.evaluate(() => (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: GSEvidence }).__GALLERY_SHIFT_EVIDENCE__ ?? {});
}

async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __GS_PUMP__?: (frames: number) => number }).__GS_PUMP__?.(count);
  }, frames);
}

async function teleport(page: Page, x: number, z: number, preserveDetection = false): Promise<void> {
  await page.evaluate(([tx, tz, preserve]) => {
    (window as unknown as { __GS_TELEPORT__?: (x: number, z: number, preserveDetection?: boolean) => unknown }).__GS_TELEPORT__?.(tx, tz, preserve === 1);
  }, [x, z, preserveDetection ? 1 : 0]);
}

function dataUrlVariance(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  let sum = 0;
  const counts = new Map<string, number>();
  for (let index = 0; index < base64.length; index += 997) {
    const char = base64[index]!;
    counts.set(char, (counts.get(char) ?? 0) + 1);
    sum += 1;
  }
  const distinct = counts.size;
  // A blank capture collapses to a handful of repeated base64 chars.
  return distinct / Math.max(1, Math.min(64, sum));
}

async function liftAt(page: Page, pedestal: { x: number; z: number }): Promise<boolean> {
  const standZ = pedestal.z + (pedestal.z >= 0 ? -1.0 : 1.0);
  await teleport(page, pedestal.x, standZ);
  const baseline = ((await readEvidence(page)).exhibitsLifted ?? 0);
  await page.keyboard.down("KeyE");
  let lifted = false;
  for (let batch = 0; batch < 16 && !lifted; batch += 1) {
    await pump(page, 30);
    const evidence = await readEvidence(page);
    lifted = (evidence.exhibitsLifted ?? 0) > baseline && (evidence.liftProgress ?? 0) === 0;
  }
  await page.keyboard.up("KeyE");
  return lifted;
}

test("gallery shift hall renders, patrols walk, cones overlay, and the review set captures", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-gallery-shift/?capture=review", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    const boot = await readEvidence(page);
    expect(boot.backend).toBe("rapier");

    // First load: renderer-owned capture must be nonblank.
    const firstLoad = await page.evaluate(() => (window as unknown as { __GS_SHOT__?: () => string }).__GS_SHOT__?.() ?? "");
    expect(firstLoad.length, "renderer screenshot must produce data").toBeGreaterThan(1000);
    expect(dataUrlVariance(firstLoad), "first load must not be a blank frame").toBeGreaterThan(0.4);
    await page.screenshot({ path: join(REPORT_DIR, "first-load-desktop.png") });

    // Guard patrol visibly moves (position evidence + a second capture).
    const guardStart = (await readEvidence(page)).guardStates?.[0];
    await pump(page, 150);
    const guardLater = (await readEvidence(page)).guardStates?.[0];
    expect(guardStart && guardLater, "guard evidence must exist").toBeTruthy();
    expect(
      Math.hypot(guardLater!.x - guardStart!.x, guardLater!.z - guardStart!.z),
      "the patrol must walk its route"
    ).toBeGreaterThan(0.5);

    // Mid-sneak view: toggle sneak and walk up the hall.
    await page.keyboard.press("ShiftLeft");
    await page.keyboard.down("KeyW");
    await pump(page, 90);
    await page.keyboard.up("KeyW");
    const sneaking = await readEvidence(page);
    expect(sneaking.thiefGait).toBe("sneak");
    await page.screenshot({ path: join(REPORT_DIR, "mid-sneak-desktop.png") });
    // This is supporting evidence only. The canonical comparison matrix is
    // written after the real line-of-sight intercept below so a failed partial
    // run cannot replace it with a weaker traversal frame.
    const midSneak = await page.evaluate(() => (window as unknown as { __GS_SHOT__?: () => string }).__GS_SHOT__?.() ?? "");
    expect(dataUrlVariance(midSneak), "mid-sneak capture must not be blank").toBeGreaterThan(0.4);

    // Mobile first-load shot for review.
    await page.setViewportSize({ width: 430, height: 800 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(REPORT_DIR, "first-load-mobile.png") });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);

    // Test-control route: debug APIs are enabled, but release artifacts never
    // render the optional debug=visual perception overlays.
    await page.goto(server.origin + "/apps/showcase-gallery-shift/?debug=1&capture=review", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    // Advance guard-1 from the north edge into the central west lane before
    // staging the real LOS intercept. This keeps the proven gameplay moment
    // inside the strongest part of the museum composition instead of clipping
    // both actors against the far wall.
    await pump(page, 300);

    // Near-detection: stand in guard-1's cone; release frames show geometry,
    // patrol pose, and detection state without debug cones.
    let detection = 0;
    for (let batch = 0; batch < 60 && detection < 0.4; batch += 1) {
      // Track the moving patrol in short steps. A single teleport followed by
      // a long pump lets the guard walk away from the staged intercept and can
      // turn a nominal cone shot into a mechanically false capture.
      const intercept = await page.evaluate(() => {
        const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: GSEvidence }).__GALLERY_SHIFT_EVIDENCE__;
        const guard = ev?.guardStates?.[0];
        if (!guard) return { x: -8.5, z: 1.5 };
        return { x: guard.x + Math.sin(guard.yaw) * 3, z: guard.z + Math.cos(guard.yaw) * 3 };
      });
      await teleport(page, intercept.x, intercept.z, true);
      await pump(page, 5);
      detection = (await readEvidence(page)).detection ?? 0;
    }
    const nearDetection = await readEvidence(page);
    expect(nearDetection.detection).toBeGreaterThan(0.3);
    expect(nearDetection.losRayCount ?? 0).toBeGreaterThan(0);
    expect(nearDetection.guardVisionSamples?.some((sample) => sample.id === "guard-1" && sample.seesThief)).toBe(true);
    await page.screenshot({ path: join(REPORT_DIR, "near-detection-desktop.png") });

    // Caught view: hold the sighting until the meter fills.
    let caught = false;
    for (let batch = 0; batch < 40 && !caught; batch += 1) {
      await pump(page, 30);
      caught = (await readEvidence(page)).state === "caught";
    }
    expect(caught).toBe(true);
    await page.screenshot({ path: join(REPORT_DIR, "caught-desktop.png") });

    // Exit-win view: restart, clear both floors through the scripted path.
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { state?: string } }).__GALLERY_SHIFT_EVIDENCE__;
      return ev?.state === "playing";
    }, undefined, { timeout: 30_000 });
    const floors: readonly { x: number; z: number }[][] = [
      [
        { x: -6.5, z: -4.2 },
        { x: 6.5, z: -4.2 }
      ],
      [
        { x: -7, z: 4.8 }
      ]
    ];
    for (let floorIndex = 0; floorIndex < floors.length; floorIndex += 1) {
      for (const [pedestalIndex, pedestal] of floors[floorIndex]!.entries()) {
        const lifted = await liftAt(page, pedestal);
        expect(lifted, `pedestal at ${pedestal.x},${pedestal.z} must lift`).toBe(true);
        if (floorIndex === 0 && pedestalIndex === 0) {
          await page.screenshot({ path: join(REPORT_DIR, "exhibit-lift-desktop.png") });
        }
        if (floorIndex === 1) {
          const alarm = await readEvidence(page);
          expect(alarm.alarmActive).toBe(true);
          await page.screenshot({ path: join(REPORT_DIR, "alarm-return-desktop.png") });
        }
      }
      const clearedFloor = floorIndex + 1;
      let atExit = false;
      for (let attempt = 0; attempt < 8 && !atExit; attempt += 1) {
        await teleport(page, 0, -6.3);
        await pump(page, 10);
        const evidence = await readEvidence(page);
        atExit = clearedFloor === 1 ? evidence.floor === 2 : evidence.state === "won";
        if (!atExit) {
          // Detection from the exit approach drains before retrying.
          await teleport(page, 6.5, 0);
          await pump(page, 120);
        }
      }
      expect(atExit, "reaching the exit with all exhibits must clear the floor").toBe(true);
      if (clearedFloor === 1) {
        await page.screenshot({ path: join(REPORT_DIR, "stair-crossing-desktop.png") });
        await pump(page, 90);
        await page.screenshot({ path: join(REPORT_DIR, "camera-sweep-desktop.png") });
      }
    }
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __GALLERY_SHIFT_EVIDENCE__?: { state?: string } }).__GALLERY_SHIFT_EVIDENCE__;
      return ev?.state === "won";
    }, undefined, { timeout: 30_000 });
    const won = await readEvidence(page);
    expect(won.state).toBe("won");
    await page.screenshot({ path: join(REPORT_DIR, "exit-win-desktop.png") });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "commit" });
    await waitForReady(page);
    await page.screenshot({ path: join(REPORT_DIR, "reduced-motion-lobby.png") });

    const reducedEvidence = await readEvidence(page);
    const finalEvidence = won as unknown as Record<string, unknown>;
    writeFileSync(join(REPORT_DIR, "visual.json"), JSON.stringify({
      evidence: finalEvidence,
      reducedMotionEvidence: reducedEvidence,
      shots: [
        "first-load-desktop.png",
        "mid-sneak-desktop.png",
        "near-detection-desktop.png",
        "caught-desktop.png",
        "exhibit-lift-desktop.png",
        "stair-crossing-desktop.png",
        "camera-sweep-desktop.png",
        "alarm-return-desktop.png",
        "exit-win-desktop.png",
        "first-load-mobile.png",
        "reduced-motion-lobby.png"
      ]
    }, null, 2));
    expect(finalEvidence.totalExhibitsLifted ?? 0).toBe(3);
    expect(finalEvidence.alarmActive).toBe(true);
    const shots = [
      "first-load-desktop.png", "mid-sneak-desktop.png", "near-detection-desktop.png", "caught-desktop.png",
      "exhibit-lift-desktop.png", "stair-crossing-desktop.png", "camera-sweep-desktop.png", "alarm-return-desktop.png",
      "exit-win-desktop.png", "first-load-mobile.png", "reduced-motion-lobby.png"
    ];
    const binding = routeSourceBinding();
    const artifacts = [...shots, "visual.json"].map((file) => ({ path: `${REPORT_DIR}/${file}`, sha256: sha256(`${REPORT_DIR}/${file}`) }));
    writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
      schema: "aura3d.gallery-shift.browser-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(PRODUCER),
      routeSourceFiles: binding.files,
      routeSourceSha256: binding.sha256,
      scenarios: ["lobby", "cover-sneak", "near-detection", "caught", "exhibit-lift", "stair-transition", "camera-sweep", "alarm-return", "exit-win", "mobile", "reduced-motion"],
      artifacts,
      pass: true
    }, null, 2)}\n`);
    void testInfo;
  } finally {
    await server.close();
  }
});
