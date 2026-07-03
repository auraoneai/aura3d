import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__?: TurboEvidence;
    __AURA3D_SHOWCASE_RACING_GAME_LAYER_PROOF__?: TurboEvidence;
    __AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__?: TurboEvidence;
    __AURA3D_SHOWCASE_SKYLINE_RUNNER__?: SkylineEvidence;
    __AURA3D_SHOWCASE_PLATFORMER_GAME_LAYER_PROOF__?: SkylineEvidence;
    __AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__?: SkylineEvidence;
    __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: BlockfallEvidence;
  }
}

interface ScreenshotEvidence {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface VisualReviewRoute {
  readonly id?: string;
  readonly verdict?: string;
  readonly screenshotEvidence?: readonly string[];
}

interface VisualReviewFile {
  readonly routes?: readonly VisualReviewRoute[];
}

interface RuntimeCell {
  readonly x: number;
  readonly y: number;
}

interface TurboEvidence {
  readonly status: string;
  readonly frameCount: number;
  readonly speed: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly raceState?: {
    readonly x: number;
    readonly z: number;
    readonly heading: number;
    readonly progress: number;
    readonly lastProgress: number;
    readonly lapValidated: boolean;
    readonly roadAlignment?: {
      readonly trackOffset: number;
      readonly roadHalfWidth: number;
      readonly normalizedOffset: number;
      readonly onRoad: boolean;
    };
  };
  readonly kitContractProof?: {
    readonly throttleIncreasesSpeed?: boolean;
    readonly steeringChangesHeading?: boolean;
    readonly checkpointAdvances?: boolean;
    readonly resetRestoresStart?: boolean;
  };
  readonly raceDesign?: {
    readonly authoredLapSeconds: number;
    readonly minimumMeaningfulLapSeconds: number;
    readonly routeAlignedToVisibleTrack: boolean;
    readonly noDebugLocatorDisk: boolean;
    readonly carTrackSceneBinding?: boolean;
    readonly carAlignedToVisibleRoad?: boolean;
    readonly visualReviewPass: boolean;
  };
}

interface SkylineEvidence {
  readonly frameCount: number;
  readonly score: number;
  readonly coins: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly animation?: {
    readonly state: string;
    readonly stateHistory: readonly { readonly state: string }[];
    readonly sampleFrame: number;
  };
  readonly diagnostics?: {
    readonly snapshot?: { readonly x: number; readonly y: number; readonly vy: number };
    readonly surfaceContactAlignment?: {
      readonly feetOnSurface: boolean;
      readonly surfaceId: string;
      readonly verticalGap: number;
      readonly sceneContact: readonly number[];
      readonly scenePlayer: readonly number[];
      readonly playerTargetHeight: number;
    };
    readonly completionProof?: { readonly completed?: boolean; readonly stable?: boolean; readonly finalTime?: number; readonly checkpoints?: readonly string[]; readonly eventCounts?: { readonly respawn?: number; readonly hit?: number } };
  };
  readonly kitContractProof?: {
    readonly checkpointEvent?: boolean;
    readonly hazardEvent?: boolean;
    readonly respawnEvent?: boolean;
    readonly finishEvent?: boolean;
  };
  readonly levelDesign?: {
    readonly authoredPlayableSeconds: number;
    readonly minimumMeaningfulPlaySeconds: number;
    readonly styleCompatible: boolean;
    readonly scaleCompatible: boolean;
    readonly visualReviewPass: boolean;
  };
}

interface BlockfallEvidence {
  readonly frameCount: number;
  readonly current?: {
    readonly checksum: string;
    readonly score: number;
    readonly lines: number;
    readonly hold: string | null;
    readonly piecesPlaced: number;
  };
  readonly live?: {
    readonly lastMove: string;
    readonly activeCells: readonly RuntimeCell[];
    readonly visibleLockedCells: number;
  };
  readonly kitContractProof?: {
    readonly moveChangesX?: boolean;
    readonly rotateChangesRotation?: boolean;
    readonly hardDropLocksPiece?: boolean;
    readonly lineClear?: boolean;
    readonly resetRestoresStart?: boolean;
  };
  readonly lineClearProof?: { readonly passed?: boolean; readonly clearedLines?: number };
}

const REPORT_DIR = resolve("tests/reports/showcase-gameplay");
const VISUAL_REVIEW_PATH = "docs/project/showcase-visual-review.json";

test.describe("showcase gameplay proof", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves turbo drift circuit gameplay when keyboard input is applied", async ({ page }) => {
    const blockers: string[] = [];
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-turbo-drift-circuit/`, { waitUntil: "domcontentloaded" });
    const before = await waitForTurbo(page);
    const beforePng = await capture(page, "showcase-turbo-drift-circuit", "before-input");

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(900);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(650);
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);
    const after = await readTurbo(page);
    const afterPng = await capture(page, "showcase-turbo-drift-circuit", "after-input");
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    const reset = await readTurbo(page);

    check(after.speed > before.speed + 0.04, blockers, "throttle did not increase visible car speed");
    check((after.raceState?.progress ?? 0) > (before.raceState?.progress ?? 0) + 0.015, blockers, "throttle did not advance race progress");
    check(Math.abs((after.raceState?.heading ?? 0) - (before.raceState?.heading ?? 0)) > 0.008, blockers, "steering did not change heading");
    check((after.raceState?.x ?? 0) !== (before.raceState?.x ?? 0) || (after.raceState?.z ?? 0) !== (before.raceState?.z ?? 0), blockers, "car position did not change");
    check(after.kitContractProof?.checkpointAdvances === true || after.checkpoint > before.checkpoint || after.lap > before.lap, blockers, "checkpoint/lap progression is not proven");
    check(reset.speed === 0 && reset.lap === 1 && reset.checkpoint === 0 && (reset.raceState?.progress ?? 1) < 0.005, blockers, "reset did not restore the start state");
    check((after.raceDesign?.authoredLapSeconds ?? 0) >= 30, blockers, "authored racing lap length is shorter than 30 seconds");
    check(after.raceDesign?.routeAlignedToVisibleTrack === true, blockers, "racing route is not proven aligned to the visible typed circuit");
    check(after.raceDesign?.noDebugLocatorDisk === true, blockers, "racing route still exposes a debug locator disk as public composition");
    check(after.raceDesign?.carTrackSceneBinding === true, blockers, "racing track model and route topology do not share one scene binding");
    check(after.raceDesign?.carAlignedToVisibleRoad === true, blockers, "racing car is not proven aligned to the visible road surface");
    check(after.raceState?.roadAlignment?.onRoad === true, blockers, "racing car is not proven on retained road topology after input");
    check((after.raceState?.roadAlignment?.normalizedOffset ?? Number.POSITIVE_INFINITY) <= 1, blockers, "racing car drifted outside the retained road width");
    writeRouteReport("showcase-turbo-drift-circuit", blockers, errors, beforePng, afterPng, { before, after, reset });
    expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
  });

  test("proves racing game layer proof gameplay when keyboard input is applied", async ({ page }) => {
    await proveRacingRoute(page, server.origin, {
      appId: "showcase-racing-game-layer-proof",
      path: "/apps/showcase-racing-game-layer-proof/",
      globalName: "__AURA3D_SHOWCASE_RACING_GAME_LAYER_PROOF__"
    });
  });

  test("proves public racing presentation proof gameplay when keyboard input is applied", async ({ page }) => {
    await proveRacingRoute(page, server.origin, {
      appId: "showcase-public-racing-presentation-proof",
      path: "/apps/showcase-public-racing-presentation-proof/",
      globalName: "__AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__"
    });
  });

  test("proves skyline runner gameplay when keyboard input is applied", async ({ page }) => {
    const blockers: string[] = [];
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-skyline-runner/`, { waitUntil: "domcontentloaded" });
    const before = await waitForSkyline(page);
    const beforePng = await capture(page, "showcase-skyline-runner", "before-input");

    await page.keyboard.down("KeyD");
    await page.waitForTimeout(620);
    await page.keyboard.press("Space");
    await page.waitForTimeout(240);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(580);
    const after = await readSkyline(page);
    const afterPng = await capture(page, "showcase-skyline-runner", "after-input");
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    const reset = await readSkyline(page);
    const states = (after.animation?.stateHistory ?? []).map((entry) => entry.state);
    const beforeContact = before.diagnostics?.surfaceContactAlignment;

    check((after.diagnostics?.snapshot?.x ?? 0) > (before.diagnostics?.snapshot?.x ?? 0) + 0.35, blockers, "movement did not change runner x position");
    check(states.includes("jump") || Math.abs(after.diagnostics?.snapshot?.vy ?? 0) > 0.05 || (after.diagnostics?.snapshot?.y ?? 0) !== (before.diagnostics?.snapshot?.y ?? 0), blockers, "jump did not change vertical or animation state");
    check(after.animation?.sampleFrame !== before.animation?.sampleFrame, blockers, "animation state frame did not advance");
    check(after.kitContractProof?.checkpointEvent === true && after.kitContractProof.hazardEvent === true && after.kitContractProof.respawnEvent === true && after.kitContractProof.finishEvent === true, blockers, "checkpoint/hazard/respawn/finish progression is not proven");
    check(after.diagnostics?.completionProof?.completed === true, blockers, "completion proof does not reach the finish");
    check((after.diagnostics?.completionProof?.finalTime ?? 0) >= 30, blockers, "completion proof is shorter than 30 seconds");
    check(after.diagnostics?.completionProof?.stable === true && ((after.diagnostics.completionProof.checkpoints?.length ?? 0) > 0 || (after.diagnostics.completionProof.eventCounts?.respawn ?? 0) > 0), blockers, "stable checkpoint/hazard route progression proof is missing");
    check((after.levelDesign?.authoredPlayableSeconds ?? 0) >= 30, blockers, "authored platformer path is shorter than 30 seconds");
    check(after.levelDesign?.styleCompatible === true && after.levelDesign.scaleCompatible === true, blockers, "platformer asset style/scale fit is not proven");
    check(beforeContact?.feetOnSurface === true, blockers, "runner initial feet are not proven on a visible playable surface");
    check(Math.abs(beforeContact?.verticalGap ?? Number.POSITIVE_INFINITY) <= 0.12, blockers, "runner surface contact gap exceeds playable-surface tolerance");
    check((beforeContact?.playerTargetHeight ?? 0) > 0, blockers, "runner visible target height is missing from surface binding evidence");
    check(reset.checkpointId === "start" && reset.coins === 0, blockers, "reset did not restore the start checkpoint");
    writeRouteReport("showcase-skyline-runner", blockers, errors, beforePng, afterPng, { before, after, reset });
    expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
  });

  test("proves platformer game layer proof gameplay when keyboard input is applied", async ({ page }) => {
    await provePlatformerRoute(page, server.origin, {
      appId: "showcase-platformer-game-layer-proof",
      path: "/apps/showcase-platformer-game-layer-proof/",
      globalName: "__AURA3D_SHOWCASE_PLATFORMER_GAME_LAYER_PROOF__"
    });
  });

  test("proves public platformer presentation proof gameplay when keyboard input is applied", async ({ page }) => {
    await provePlatformerRoute(page, server.origin, {
      appId: "showcase-public-platformer-presentation-proof",
      path: "/apps/showcase-public-platformer-presentation-proof/",
      globalName: "__AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__"
    });
  });

  test("proves blockfall reactor gameplay when keyboard input is applied", async ({ page }) => {
    const blockers: string[] = [];
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-blockfall-reactor/`, { waitUntil: "domcontentloaded" });
    const before = await waitForBlockfall(page);
    const beforePng = await capture(page, "showcase-blockfall-reactor", "before-input");

    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(160);
    const movedLeft = await readBlockfall(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(180);
    const movedRight = await readBlockfall(page);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(160);
    const rotated = await readBlockfall(page);
    await page.keyboard.press("Space");
    await page.waitForTimeout(360);
    const after = await readBlockfall(page);
    const afterPng = await capture(page, "showcase-blockfall-reactor", "after-input");
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    const reset = await readBlockfall(page);

    check(minCellX(movedLeft) < minCellX(before), blockers, "left input did not move active block left");
    check(minCellX(movedRight) > minCellX(movedLeft), blockers, "right input did not move active block right");
    check(rotated.kitContractProof?.rotateChangesRotation === true, blockers, "rotate orientation proof is missing");
    check((after.current?.piecesPlaced ?? 0) > (before.current?.piecesPlaced ?? 0), blockers, "hard drop did not lock a piece");
    check(after.current?.checksum !== before.current?.checksum, blockers, "game state checksum did not change after input");
    check(after.lineClearProof?.passed === true && after.lineClearProof.clearedLines === 1, blockers, "line-clear scoring proof is missing");
    check(reset.current?.score === 0 && reset.current.lines === 0 && reset.current.hold === null && reset.current.piecesPlaced === 0, blockers, "reset did not clear score, lines, hold, and placed pieces");
    writeRouteReport("showcase-blockfall-reactor", blockers, errors, beforePng, afterPng, { before, movedLeft, movedRight, rotated, after, reset });
    expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
  });
});

async function proveRacingRoute(
  page: Page,
  origin: string,
  route: { readonly appId: string; readonly path: string; readonly globalName: "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__" | "__AURA3D_SHOWCASE_RACING_GAME_LAYER_PROOF__" | "__AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__" }
): Promise<void> {
  const blockers: string[] = [];
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${origin}${route.path}`, { waitUntil: "domcontentloaded" });
  const before = await waitForRacing(page, route.globalName);
  const beforePng = await capture(page, route.appId, "before-input");

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(650);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(300);
  const after = await readRacing(page, route.globalName);
  const afterPng = await capture(page, route.appId, "after-input");
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(260);
  const reset = await readRacing(page, route.globalName);

  check(after.speed > before.speed + 0.04, blockers, "throttle did not increase visible car speed");
  check((after.raceState?.progress ?? 0) > (before.raceState?.progress ?? 0) + 0.015, blockers, "throttle did not advance race progress");
  check(Math.abs((after.raceState?.heading ?? 0) - (before.raceState?.heading ?? 0)) > 0.008, blockers, "steering did not change heading");
  check((after.raceState?.x ?? 0) !== (before.raceState?.x ?? 0) || (after.raceState?.z ?? 0) !== (before.raceState?.z ?? 0), blockers, "car position did not change");
  check(after.kitContractProof?.checkpointAdvances === true || after.checkpoint > before.checkpoint || after.lap > before.lap, blockers, "checkpoint/lap progression is not proven");
  check(reset.speed === 0 && reset.lap === 1 && reset.checkpoint === 0 && (reset.raceState?.progress ?? 1) < 0.005, blockers, "reset did not restore the start state");
  check((after.raceDesign?.authoredLapSeconds ?? 0) >= 30, blockers, "authored racing lap length is shorter than 30 seconds");
  check(after.raceDesign?.routeAlignedToVisibleTrack === true, blockers, "racing route is not proven aligned to the visible typed circuit");
  check(after.raceDesign?.noDebugLocatorDisk === true, blockers, "racing route still exposes a debug locator disk as public composition");
  check(after.raceDesign?.carTrackSceneBinding === true, blockers, "racing track model and route topology do not share one scene binding");
  check(after.raceDesign?.carAlignedToVisibleRoad === true, blockers, "racing car is not proven aligned to the visible road surface");
  check(after.raceState?.roadAlignment?.onRoad === true, blockers, "racing car is not proven on retained road topology after input");
  check((after.raceState?.roadAlignment?.normalizedOffset ?? Number.POSITIVE_INFINITY) <= 1, blockers, "racing car drifted outside the retained road width");
  writeRouteReport(route.appId, blockers, errors, beforePng, afterPng, { before, after, reset });
  expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
}

async function provePlatformerRoute(
  page: Page,
  origin: string,
  route: { readonly appId: string; readonly path: string; readonly globalName: "__AURA3D_SHOWCASE_SKYLINE_RUNNER__" | "__AURA3D_SHOWCASE_PLATFORMER_GAME_LAYER_PROOF__" | "__AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__" }
): Promise<void> {
  const blockers: string[] = [];
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${origin}${route.path}`, { waitUntil: "domcontentloaded" });
  const before = await waitForPlatformer(page, route.globalName);
  const beforePng = await capture(page, route.appId, "before-input");

  await page.keyboard.down("KeyD");
  await page.waitForTimeout(620);
  await page.keyboard.press("Space");
  await page.waitForTimeout(240);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(580);
  const after = await readPlatformer(page, route.globalName);
  const afterPng = await capture(page, route.appId, "after-input");
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(260);
  const reset = await readPlatformer(page, route.globalName);
  const states = (after.animation?.stateHistory ?? []).map((entry) => entry.state);
  const beforeContact = before.diagnostics?.surfaceContactAlignment;

  check((after.diagnostics?.snapshot?.x ?? 0) > (before.diagnostics?.snapshot?.x ?? 0) + 0.35, blockers, "movement did not change runner x position");
  check(states.includes("jump") || Math.abs(after.diagnostics?.snapshot?.vy ?? 0) > 0.05 || (after.diagnostics?.snapshot?.y ?? 0) !== (before.diagnostics?.snapshot?.y ?? 0), blockers, "jump did not change vertical or animation state");
  check(after.animation?.sampleFrame !== before.animation?.sampleFrame, blockers, "animation state frame did not advance");
  check(after.kitContractProof?.checkpointEvent === true && after.kitContractProof.hazardEvent === true && after.kitContractProof.respawnEvent === true && after.kitContractProof.finishEvent === true, blockers, "checkpoint/hazard/respawn/finish progression is not proven");
  check(after.diagnostics?.completionProof?.completed === true, blockers, "completion proof does not reach the finish");
  check((after.diagnostics?.completionProof?.finalTime ?? 0) >= 30, blockers, "completion proof is shorter than 30 seconds");
  check(after.diagnostics?.completionProof?.stable === true && ((after.diagnostics.completionProof.checkpoints?.length ?? 0) > 0 || (after.diagnostics.completionProof.eventCounts?.respawn ?? 0) > 0), blockers, "stable checkpoint/hazard route progression proof is missing");
  check((after.levelDesign?.authoredPlayableSeconds ?? 0) >= 30, blockers, "authored platformer path is shorter than 30 seconds");
  check(after.levelDesign?.styleCompatible === true && after.levelDesign.scaleCompatible === true, blockers, "platformer asset style/scale fit is not proven");
  check(beforeContact?.feetOnSurface === true, blockers, "runner initial feet are not proven on a visible playable surface");
  check(Math.abs(beforeContact?.verticalGap ?? Number.POSITIVE_INFINITY) <= 0.12, blockers, "runner surface contact gap exceeds playable-surface tolerance");
  check((beforeContact?.playerTargetHeight ?? 0) > 0, blockers, "runner visible target height is missing from surface binding evidence");
  check(reset.checkpointId === "start" && reset.coins === 0, blockers, "reset did not restore the start checkpoint");
  writeRouteReport(route.appId, blockers, errors, beforePng, afterPng, { before, after, reset });
  expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) errors.push(`response ${response.status()}: ${response.url()}`);
  });
  return errors;
}

async function waitForTurbo(page: Page): Promise<TurboEvidence> {
  await expect.poll(() => page.evaluate(() => window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__?.status), { timeout: 60_000 }).toBeTruthy();
  return readTurbo(page);
}

async function waitForRacing(
  page: Page,
  globalName: "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__" | "__AURA3D_SHOWCASE_RACING_GAME_LAYER_PROOF__" | "__AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__"
): Promise<TurboEvidence> {
  await expect.poll(() => page.evaluate((name) => window[name]?.status, globalName), { timeout: 60_000 }).toBeTruthy();
  return readRacing(page, globalName);
}

async function waitForSkyline(page: Page): Promise<SkylineEvidence> {
  await expect.poll(() => page.evaluate(() => window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__?.frameCount), { timeout: 60_000 }).toBeGreaterThanOrEqual(0);
  return readSkyline(page);
}

async function waitForPlatformer(
  page: Page,
  globalName: "__AURA3D_SHOWCASE_SKYLINE_RUNNER__" | "__AURA3D_SHOWCASE_PLATFORMER_GAME_LAYER_PROOF__" | "__AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__"
): Promise<SkylineEvidence> {
  await expect.poll(() => page.evaluate((name) => window[name]?.frameCount, globalName), { timeout: 60_000 }).toBeGreaterThanOrEqual(0);
  return readPlatformer(page, globalName);
}

async function waitForBlockfall(page: Page): Promise<BlockfallEvidence> {
  await expect.poll(() => page.evaluate(() => window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?.frameCount), { timeout: 60_000 }).toBeGreaterThanOrEqual(0);
  return readBlockfall(page);
}

async function readTurbo(page: Page): Promise<TurboEvidence> {
  const evidence = await page.evaluate(() => window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__);
  if (!evidence) throw new Error("Turbo route did not publish gameplay evidence.");
  return evidence;
}

async function readRacing(
  page: Page,
  globalName: "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__" | "__AURA3D_SHOWCASE_RACING_GAME_LAYER_PROOF__" | "__AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__"
): Promise<TurboEvidence> {
  const evidence = await page.evaluate((name) => window[name], globalName);
  if (!evidence) throw new Error(`${globalName} did not publish gameplay evidence.`);
  return evidence;
}

async function readSkyline(page: Page): Promise<SkylineEvidence> {
  const evidence = await page.evaluate(() => window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__);
  if (!evidence) throw new Error("Skyline route did not publish gameplay evidence.");
  return evidence;
}

async function readPlatformer(
  page: Page,
  globalName: "__AURA3D_SHOWCASE_SKYLINE_RUNNER__" | "__AURA3D_SHOWCASE_PLATFORMER_GAME_LAYER_PROOF__" | "__AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__"
): Promise<SkylineEvidence> {
  const evidence = await page.evaluate((name) => window[name], globalName);
  if (!evidence) throw new Error(`${globalName} did not publish gameplay evidence.`);
  return evidence;
}

async function readBlockfall(page: Page): Promise<BlockfallEvidence> {
  const evidence = await page.evaluate(() => window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__);
  if (!evidence) throw new Error("Blockfall route did not publish gameplay evidence.");
  return evidence;
}

async function capture(page: Page, appId: string, label: string): Promise<ScreenshotEvidence> {
  const path = resolve(REPORT_DIR, `${appId}-${label}.png`);
  const buffer = await page.screenshot({ path, fullPage: false, scale: "css" });
  return { path, bytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex") };
}

function check(condition: boolean, blockers: string[], message: string): void {
  if (!condition) blockers.push(message);
}

function minCellX(evidence: BlockfallEvidence): number {
  const xs = (evidence.live?.activeCells ?? []).map((cell) => cell.x);
  return xs.length > 0 ? Math.min(...xs) : Number.POSITIVE_INFINITY;
}

function writeRouteReport(appId: string, blockers: readonly string[], errors: readonly string[], beforeInput: ScreenshotEvidence, afterInput: ScreenshotEvidence, evidence: object): void {
  const categoryProof = createCategoryProof(appId, evidence);
  writeFileSync(
    resolve(REPORT_DIR, `${appId}.json`),
    `${JSON.stringify({ schema: "aura3d-showcase-gameplay-proof", appId, pass: blockers.length === 0 && errors.length === 0, blockers, browserErrors: errors, screenshots: { beforeInput, afterInput }, evidence, ...(categoryProof ? { categoryProof } : {}) }, null, 2)}\n`
  );
}

function createCategoryProof(appId: string, evidence: object): object | undefined {
  const visualReview = readVisualReview(appId);
  if ((appId === "showcase-turbo-drift-circuit" || appId === "showcase-racing-game-layer-proof" || appId === "showcase-public-racing-presentation-proof") && isTurboReport(evidence)) {
    return {
      racing: {
        inputChangesSpeed: evidence.after.speed > evidence.before.speed + 0.04,
        inputChangesHeading: Math.abs((evidence.after.raceState?.heading ?? 0) - (evidence.before.raceState?.heading ?? 0)) > 0.008,
        checkpointOrLapProgression: evidence.after.kitContractProof?.checkpointAdvances === true || evidence.after.checkpoint > evidence.before.checkpoint || evidence.after.lap > evidence.before.lap,
        resetWorks: evidence.reset.speed === 0 && evidence.reset.lap === 1 && evidence.reset.checkpoint === 0,
        authoredLapSeconds: evidence.after.raceDesign?.authoredLapSeconds ?? 0,
        routeAlignedToVisibleTrack: evidence.after.raceDesign?.routeAlignedToVisibleTrack === true,
        noDebugLocatorDisk: evidence.after.raceDesign?.noDebugLocatorDisk === true,
        visualReviewPass: visualReview.verdict === "pass",
        visualReviewEvidence: {
          source: VISUAL_REVIEW_PATH,
          verdict: visualReview.verdict ?? "missing",
          screenshotEvidence: visualReview.screenshotEvidence ?? []
        }
      }
    };
  }
  if ((appId === "showcase-skyline-runner" || appId === "showcase-platformer-game-layer-proof" || appId === "showcase-public-platformer-presentation-proof") && isSkylineReport(evidence)) {
    return {
      platformer: {
        movementChangesPosition: (evidence.after.diagnostics?.snapshot?.x ?? 0) > (evidence.before.diagnostics?.snapshot?.x ?? 0) + 0.35,
        jumpChangesState: (evidence.after.animation?.stateHistory ?? []).some((entry) => entry.state === "jump") || Math.abs(evidence.after.diagnostics?.snapshot?.vy ?? 0) > 0.05,
        checkpointProgression: evidence.after.kitContractProof?.checkpointEvent === true,
        hazardRespawn: evidence.after.kitContractProof?.hazardEvent === true && evidence.after.kitContractProof.respawnEvent === true,
        finishProgression: evidence.after.kitContractProof?.finishEvent === true && evidence.after.diagnostics?.completionProof?.completed === true,
        authoredPlayableSeconds: evidence.after.levelDesign?.authoredPlayableSeconds ?? 0,
        styleCompatible: evidence.after.levelDesign?.styleCompatible === true,
        scaleCompatible: evidence.after.levelDesign?.scaleCompatible === true,
        visualReviewPass: visualReview.verdict === "pass",
        visualReviewEvidence: {
          source: VISUAL_REVIEW_PATH,
          verdict: visualReview.verdict ?? "missing",
          screenshotEvidence: visualReview.screenshotEvidence ?? []
        }
      }
    };
  }
  return undefined;
}

function readVisualReview(appId: string): VisualReviewRoute {
  const review = JSON.parse(readFileSync(resolve(VISUAL_REVIEW_PATH), "utf8")) as VisualReviewFile;
  return review.routes?.find((route) => route.id === appId) ?? {};
}

function isTurboReport(value: object): value is { readonly before: TurboEvidence; readonly after: TurboEvidence; readonly reset: TurboEvidence } {
  const record = value as Readonly<Record<string, unknown>>;
  return isRecord(record.before) && isRecord(record.after) && isRecord(record.reset) && "raceState" in record.after;
}

function isSkylineReport(value: object): value is { readonly before: SkylineEvidence; readonly after: SkylineEvidence; readonly reset: SkylineEvidence } {
  const record = value as Readonly<Record<string, unknown>>;
  return isRecord(record.before) && isRecord(record.after) && isRecord(record.reset) && "checkpointId" in record.after;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
