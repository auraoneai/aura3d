/**
 * Courier Rush playable proof.
 *
 * Drives the mounted route with real keyboard input for the feel checks, then
 * uses the route's documented autopilot diagnostic (?autopilot=1) to complete a
 * full five-delivery shift through the same simulation path a player drives,
 * proving every delivery lands inside its authored timer. A separate
 * timer-scaled load proves the timeout fail and full reset.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const ROUTE = "/apps/showcase-courier-rush/";
const REPORT_DIR = resolve("tests/reports/showcase-courier-rush");
const PRODUCER_PATH = fileURLToPath(import.meta.url);

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function routeSourceSha256(): string {
  const sourceDir = resolve("apps/showcase-courier-rush/src");
  const hash = createHash("sha256");
  for (const file of readdirSync(sourceDir).filter((name) => /\.(?:ts|css)$/.test(name)).sort()) {
    hash.update(file).update("\0").update(readFileSync(resolve(sourceDir, file))).update("\0");
  }
  return hash.digest("hex");
}

function artifact(file: string) {
  const path = resolve(REPORT_DIR, file);
  return { path: relative(resolve("."), path), sha256: sha256(path) };
}

function writeBoundEvidence(file: string, schema: string, facts: Record<string, unknown>, artifactFiles: readonly string[]): void {
  writeFileSync(resolve(REPORT_DIR, file), JSON.stringify({
    schema,
    generatedAt: new Date().toISOString(),
    producer: relative(resolve("."), PRODUCER_PATH),
    producerSourceSha256: sha256(PRODUCER_PATH),
    routeSourceSha256: routeSourceSha256(),
    artifacts: artifactFiles.map(artifact),
    ...facts
  }, null, 2) + "\n");
}

interface CourierEvidence {
  readonly schema: string;
  readonly appId: string;
  readonly claimLabel: string;
  readonly mounted: boolean;
  readonly state: string;
  readonly deliveryIndex: number;
  readonly deliveriesTotal: number;
  readonly timerMs: number;
  readonly strikes: number;
  readonly maxStrikes: number;
  readonly combo: number;
  readonly score: number;
  readonly parcelAttached: boolean;
  readonly zoneEvents: readonly { type: string; zoneId: string; onTriggerEnter: boolean }[];
  readonly trafficCount: number;
  readonly seed: number;
  readonly knownLimits: readonly string[];
  readonly primaryAssets: readonly string[];
  readonly primitiveCount: number;
  readonly reducedMotion?: boolean;
  readonly paused?: boolean;
  readonly autopilot?: boolean;
  readonly frameCount: number;
  readonly van: { x: number; z: number; heading: number; speed: number };
  readonly trafficSummaries: readonly { id: string; x: number; z: number; speed: number; courtesyStopped: boolean }[];
  readonly audio?: { cueCount: number; gestureUnlocked: boolean; recentCues: readonly string[] };
  readonly diagnostics?: { drawCalls?: number };
  readonly gameplay: {
    driveChangedState: boolean;
    pickupFired: boolean;
    dropFired: boolean;
    strikeObserved: boolean;
    timerFailObserved: boolean;
    resetRestoresShift: boolean;
    pauseFreezesSim: boolean;
    courtesyStopObserved: boolean;
    trafficMovedObserved: boolean;
    parcelVisibleInBed: boolean;
    allDeliveriesInsideTimers: boolean;
  };
}

async function readEvidence(page: Page): Promise<CourierEvidence> {
  return page.evaluate(() => {
    const value = (window as unknown as { __COURIER_RUSH_EVIDENCE__?: CourierEvidence }).__COURIER_RUSH_EVIDENCE__;
    if (!value) throw new Error("Courier Rush evidence not mounted yet");
    return value;
  });
}

async function placeVan(page: Page, x: number, z: number, heading = Math.PI / 2): Promise<void> {
  await page.evaluate(([px, pz, ph]) => {
    (window as unknown as { __COURIER_RUSH_DEBUG__?: { placeVan(x: number, z: number, h?: number): void } })
      .__COURIER_RUSH_DEBUG__?.placeVan(px, pz, ph);
  }, [x, z, heading] as const);
}

test.setTimeout(480_000);

test("courier rush is a playable delivery shift", async ({ page, browser }) => {
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
  });

  // ---- scenario A: manual input, pause, strikes ---------------------------------
  await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 120_000 }).toBe("true");
  await expect.poll(async () => (await readEvidence(page)).frameCount, { timeout: 30_000 }).toBeGreaterThan(20);

  const initial = await readEvidence(page);
  expect(initial.schema).toBe("aura3d-showcase-courier-rush/1.0");
  expect(initial.claimLabel).toBe("prototype");
  expect(initial.mounted).toBe(true);
  expect(initial.primaryAssets).toContain("assets.courierVan");
  expect(initial.primaryAssets).toContain("assets.courierParcel");
  expect(initial.primaryAssets).toContain("assets.courierTrafficSedan");
  expect(initial.trafficCount).toBeGreaterThanOrEqual(6);
  expect(initial.knownLimits.length).toBeGreaterThan(2);
  expect(initial.primitiveCount).toBeGreaterThan(0);

  writeFileSync(resolve(REPORT_DIR, "load.png"), await page.screenshot({ fullPage: false }));

  // Real keyboard input changes state.
  await page.locator("canvas").click();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");
  const driven = await readEvidence(page);
  expect(driven.gameplay.driveChangedState).toBe(true);
  expect(Math.abs(driven.van.speed)).toBeGreaterThan(0.5);

  // Pause freezes van, traffic and timers together.
  await page.keyboard.press("KeyP");
  const pauseA = await readEvidence(page);
  expect(pauseA.paused).toBe(true);
  await page.waitForTimeout(800);
  const pauseB = await readEvidence(page);
  // Timers and the solved van pose freeze; the render loop itself stays alive.
  expect(pauseB.timerMs).toBe(pauseA.timerMs);
  expect(pauseB.van.x).toBe(pauseA.van.x);
  expect(pauseB.van.z).toBe(pauseA.van.z);
  expect(pauseB.gameplay.pauseFreezesSim).toBe(true);
  await page.keyboard.press("KeyP");

  // Strike: place the van into an oncoming lamp pole and accelerate through it.
  await placeVan(page, 5.4, -5.1, 0);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyW");
  const struck = await readEvidence(page);
  expect(struck.strikes).toBeGreaterThanOrEqual(1);
  expect(struck.gameplay.strikeObserved).toBe(true);

  // The remaining strikes must come from live traffic colliders. Move clear
  // for the pinned one-second cooldown, then place the van on the current
  // measured traffic positions; collision/failure still run through gameplay.
  await placeVan(page, 31, 25);
  await page.waitForTimeout(1_100);
  const trafficStrikeA = (await readEvidence(page)).trafficSummaries[0]!;
  await placeVan(page, trafficStrikeA.x, trafficStrikeA.z);
  await expect.poll(async () => (await readEvidence(page)).strikes, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await placeVan(page, 31, 25);
  await page.waitForTimeout(1_100);
  const trafficStrikeB = (await readEvidence(page)).trafficSummaries[1]!;
  await placeVan(page, trafficStrikeB.x, trafficStrikeB.z);
  await expect.poll(async () => (await readEvidence(page)).state, { timeout: 10_000 }).toBe("shiftOver");
  const strikeFailed = await readEvidence(page);
  expect(strikeFailed.strikes).toBe(strikeFailed.maxStrikes);
  writeFileSync(resolve(REPORT_DIR, "traffic-strike-fail.png"), await page.screenshot({ fullPage: false }));

  // ---- scenario B: timer fail + full reset ---------------------------------------
  // timerScale multiplies the dispatch clock: at 8x a 60s window expires in
  // about eight real seconds while the van sits parked far from any zone.
  await page.goto(server.origin + ROUTE + "?timerScale=8", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 120_000 }).toBe("true");
  // Park the van off the street graph so idle traffic cannot strike it; the
  // scaled clock then expires with the van nowhere near any zone.
  await placeVan(page, 31, 25);
  await expect.poll(async () => (await readEvidence(page)).state, { timeout: 45_000 }).toBe("shiftOver");
  const failed = await readEvidence(page);
  expect(failed.gameplay.timerFailObserved).toBe(true);
  writeFileSync(resolve(REPORT_DIR, "timer-fail-summary.png"), await page.screenshot({ fullPage: false }));

  await page.keyboard.press("KeyR");
  const reset = await readEvidence(page);
  expect(reset.state).toBe("awaitingPickup");
  expect(reset.strikes).toBe(0);
  expect(reset.deliveryIndex).toBe(0);
  // The scaled clock keeps ticking after reset, so allow one tick of drift.
  expect(reset.timerMs).toBeGreaterThan(55_000);
  expect(reset.timerMs).toBeLessThanOrEqual(60_000);
  expect(reset.gameplay.resetRestoresShift).toBe(true);

  // ---- scenario C: autopilot playthrough of all five deliveries ------------------
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.origin + ROUTE + "?autopilot=1", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 120_000 }).toBe("true");
  const run = await readEvidence(page);
  expect(run.autopilot).toBe(true);
  // Start the run parked off the street graph so idle traffic cannot strike
  // the stationary van before the autopilot pulls away.
  await placeVan(page, 31, 25);

  let parcelShot = false;
  let dropFlashShot = false;
  let dropEventsSeen = 0;
  await expect
    .poll(
      async () => {
        const evidence = await readEvidence(page);
        appendFileSync(resolve(REPORT_DIR, "playthrough-trail.jsonl"), JSON.stringify({
          t: Date.now(),
          st: evidence.state,
          idx: evidence.deliveryIndex,
          s: evidence.strikes,
          van: evidence.van,
          tg: (evidence as unknown as { activeTargetId?: string }).activeTargetId
        }) + "\n");
        dropEventsSeen = Math.max(dropEventsSeen, evidence.zoneEvents.filter((event) => event.type === "drop").length);
        if (!parcelShot && evidence.carrying) {
          parcelShot = true;
          writeFileSync(resolve(REPORT_DIR, "parcel-in-bed.png"), await page.screenshot({ fullPage: false }));
        }
        if (parcelShot && !dropFlashShot && evidence.zoneEvents.some((event) => event.type === "drop")) {
          dropFlashShot = true;
          writeFileSync(resolve(REPORT_DIR, "drop-flash.png"), await page.screenshot({ fullPage: false }));
        }
        if (evidence.state === "shiftOver") {
          writeFileSync(resolve(REPORT_DIR, "playthrough-failure.json"), JSON.stringify(evidence, null, 2));
        }
        return evidence.state === "shiftClear" ? "done" : evidence.state;
      },
      { timeout: 330_000, intervals: [1_000] }
    )
    .toBe("done");

  const finished = await readEvidence(page);
  expect(finished.state).toBe("shiftClear");
  expect(finished.deliveryIndex).toBe(finished.deliveriesTotal);
  expect(finished.score).toBeGreaterThan(0);
  expect(finished.combo).toBeGreaterThanOrEqual(1);
  expect(finished.zoneEvents.filter((event) => event.type === "pickup")).toHaveLength(finished.deliveriesTotal);
  expect(finished.zoneEvents.filter((event) => event.type === "drop")).toHaveLength(finished.deliveriesTotal);
  expect(finished.zoneEvents.every((event) => event.onTriggerEnter === true)).toBe(true);
  expect(finished.gameplay.allDeliveriesInsideTimers).toBe(true);
  expect(finished.gameplay.parcelVisibleInBed).toBe(true);
  expect(finished.gameplay.trafficMovedObserved).toBe(true);
  writeFileSync(resolve(REPORT_DIR, "shift-clear.png"), await page.screenshot({ fullPage: false }));

  // Dispatch blip fires at each new delivery once audio is unlocked by the click.
  expect(finished.audio?.cueCount).toBe(10);

  // ---- scenario D: real touch control at a phone viewport ----------------------
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
  await expect.poll(() => mobilePage.locator("body").getAttribute("data-aura3d-ready"), { timeout: 120_000 }).toBe("true");
  await expect(mobilePage.locator("#throttle-control")).toBeVisible();
  await mobilePage.locator("#throttle-control").dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1 });
  await mobilePage.waitForTimeout(850);
  await mobilePage.locator("#throttle-control").dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1 });
  const mobileDriven = await readEvidence(mobilePage);
  expect(mobileDriven.gameplay.driveChangedState).toBe(true);
  expect(Math.abs(mobileDriven.van.speed)).toBeGreaterThan(0.4);
  writeFileSync(resolve(REPORT_DIR, "mobile.png"), await mobilePage.screenshot({ fullPage: false }));
  await mobileContext.close();

  // ---- scenario E: reduced-motion route truth remains live ---------------------
  const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
  await expect.poll(() => reducedPage.locator("body").getAttribute("data-aura3d-ready"), { timeout: 120_000 }).toBe("true");
  const reduced = await readEvidence(reducedPage);
  expect(reduced.reducedMotion).toBe(true);
  expect(reduced.state).toBe("awaitingPickup");
  writeFileSync(resolve(REPORT_DIR, "reduced-motion.png"), await reducedPage.screenshot({ fullPage: false }));
  await reducedContext.close();

  writeBoundEvidence("full-shift-evidence.json", "aura3d-courier-rush-full-shift/1.0", {
    final: finished,
    allFiveDeliveriesInsideTimers: finished.gameplay.allDeliveriesInsideTimers,
    pickupEvents: finished.zoneEvents.filter((event) => event.type === "pickup").length,
    dropEvents: finished.zoneEvents.filter((event) => event.type === "drop").length
  }, ["parcel-in-bed.png", "drop-flash.png", "shift-clear.png"]);
  writeBoundEvidence("failure-evidence.json", "aura3d-courier-rush-failure/1.0", {
    trafficStrikeFailure: { state: strikeFailed.state, strikes: strikeFailed.strikes, maxStrikes: strikeFailed.maxStrikes },
    timerFailure: { state: failed.state, timerFailObserved: failed.gameplay.timerFailObserved },
    reset: { state: reset.state, strikes: reset.strikes, deliveryIndex: reset.deliveryIndex }
  }, ["traffic-strike-fail.png", "timer-fail-summary.png"]);
  writeBoundEvidence("mobile-evidence.json", "aura3d-courier-rush-mobile/1.0", {
    viewport: { width: 390, height: 844 },
    touchPointerDriven: true,
    driveChangedState: mobileDriven.gameplay.driveChangedState,
    vanSpeed: mobileDriven.van.speed
  }, ["mobile.png"]);
  writeBoundEvidence("reduced-motion-evidence.json", "aura3d-courier-rush-reduced-motion/1.0", {
    reducedMotion: reduced.reducedMotion,
    gameplayState: reduced.state
  }, ["reduced-motion.png"]);

  expect(consoleErrors).toEqual([]);
});
