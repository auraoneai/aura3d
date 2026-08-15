import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  SKYLINE_FIRST_MID_CHECKPOINT_ID,
  SKYLINE_FIRST_MID_CHECKPOINT_X,
  SKYLINE_LEVEL_ACTS,
  SKYLINE_SECTION_COUNT,
  SKYLINE_SECTION_STRIDE,
  createSkylineLevel
} from "../../apps/showcase-skyline-runner/src/level";
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

interface TurboRenderedFeedback {
  readonly driftVisible?: boolean;
  readonly driftAmount?: number;
  readonly speedFraction?: number;
  readonly ribbonLength?: number;
  readonly offTrack?: boolean;
  readonly recoveryVisible?: boolean;
}

interface TurboEvidence {
  readonly renderedFeedback?: TurboRenderedFeedback;
  readonly observedRenderedFeedback?: {
    readonly driftRendered?: boolean;
    readonly highSpeedRendered?: boolean;
    readonly offTrackRendered?: boolean;
  };
  readonly status: string;
  readonly frameCount: number;
  readonly speed: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly opponent?: {
    readonly controller: string;
    readonly independentFromPlayerPlacement: boolean;
    readonly decisionCount: number;
    readonly progress: number;
    readonly playerProgress: number;
    readonly separation: number;
  };
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
  readonly physics?: PhysicsRouteEvidence;
}

interface SkylineEvidence {
  readonly frameCount: number;
  readonly score: number;
  readonly coins: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly challenge?: {
    readonly kind: string;
    readonly elapsedSeconds: number;
    readonly flow: number;
    readonly maxFlow: number;
    readonly collectionChain: number;
    readonly maxCollectionChain: number;
    readonly challengeScore: number;
    readonly resets: number;
  };
  readonly animation?: {
    readonly state: string;
    readonly stateHistory: readonly { readonly state: string }[];
    readonly sampleFrame: number;
  };
  readonly diagnostics?: {
    readonly snapshot?: { readonly x: number; readonly y: number; readonly vy: number; readonly facing?: number; readonly facingYaw?: number };
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
    readonly level: number;
    readonly gameOver: boolean;
    readonly hold: string | null;
    readonly piecesPlaced: number;
  };
  readonly sixtySecondReplayProof?: {
    readonly pass: boolean;
    readonly replayedSeconds: number;
    readonly deterministic: boolean;
    readonly missingMechanics: readonly string[];
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
  readonly physics?: PhysicsRouteEvidence;
}

interface PhysicsRouteEvidence {
  readonly selection: string;
  readonly angularContactResponse: boolean;
  readonly continuousCollisionActive: boolean;
  readonly continuousCollisionProvider: string;
  readonly continuousCollisionSubSteps: number;
  readonly fastMoverDidNotTunnel: boolean;
  readonly continuousCollisionOwnership: string;
}

const REPORT_DIR = resolve("tests/reports/showcase-gameplay");
const VISUAL_REVIEW_PATH = "docs/project/showcase-visual-review.json";

test.describe("showcase gameplay proof", () => {
  // Skyline's physical Level 1 now runs for two-to-three minutes before the test's
  // checkpoint, deliberate-fall, respawn, reset and screenshot work. The former
  // three-minute ceiling expired during valid mounted traversal.
  test.setTimeout(300_000);

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

    // FS-102 named capture points. Each is written only after the mounted race
    // reached the named condition, so a filename cannot claim an unreached state.
    const turboCaptures: Record<string, ScreenshotEvidence> = { start: beforePng };

    await page.keyboard.down("KeyW");
    // Capture the launch while the car is still on the opening straight. Waiting 900 ms
    // carried an unsteered car into the first bend, so the frame raced the boundary
    // recovery even though its sampled telemetry was still on-road.
    await page.waitForTimeout(650);
    // High-speed chase: capture once real speed has built.
    const atSpeed = await readTurbo(page);
    if (atSpeed.speed > before.speed + 0.04) {
      turboCaptures["high-speed-chase"] = await capture(page, "showcase-turbo-drift-circuit", "high-speed-chase");
    }
    // The first ordered gate is normally credited during this clean launch.
    // Bind the checkpoint evidence to that actual event before the intentional
    // drift changes the car's line and composition.
    if (atSpeed.kitContractProof?.checkpointAdvances === true) {
      turboCaptures.checkpoint = await capture(page, "showcase-turbo-drift-circuit", "checkpoint");
    }
    // Drift: the handbrake is what builds real slip in game.racing.
    // The first visible bend turns right. Drive the authored corner rather than
    // manufacturing a left-hand slide into its grass verge.
    await page.keyboard.down("KeyD");
    await page.keyboard.down("Space");
    // Sample across a short, bounded handbrake window. Do not stop at the first visible frame:
    // the route intentionally reveals the ribbons as slip crosses 0.12, while its public evidence
    // is rounded for stable JSON. Capturing at that boundary could report exactly 0.12 and produced
    // a weak-looking proof frame. Wait for pronounced, reportable slip so both the contract and the
    // screenshot demonstrate a real drift rather than the onset of one.
    await page.waitForTimeout(120);
    let drifting = await readTurbo(page);
    for (let sample = 0; sample < 12 && (
      drifting.renderedFeedback?.driftVisible !== true
      || (drifting.renderedFeedback?.driftAmount ?? 0) <= 0.24
    ); sample += 1) {
      await page.waitForTimeout(35);
      drifting = await readTurbo(page);
    }
    if (
      drifting.renderedFeedback?.driftVisible === true
      && (drifting.renderedFeedback?.driftAmount ?? 0) > 0.24
    ) {
      turboCaptures.drift = await capture(page, "showcase-turbo-drift-circuit", "drift");
    }
    await page.keyboard.up("Space");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);
    const after = await readTurbo(page);
    const afterPng = await capture(page, "showcase-turbo-drift-circuit", "after-input");

    // Checkpoint: capture once an ordered gate has actually been credited.
    let gated = after;
    for (let sample = 0; sample < 40 && (gated.kitContractProof?.checkpointAdvances !== true); sample += 1) {
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(220);
      gated = await readTurbo(page);
    }
    await page.keyboard.up("KeyW");
    if (gated.kitContractProof?.checkpointAdvances === true && turboCaptures.checkpoint === undefined) {
      turboCaptures.checkpoint = await capture(page, "showcase-turbo-drift-circuit", "checkpoint");
    }

    // Off-track: drive across the certified boundary and capture only after the
    // route has made that transient clamp/recovery state visibly legible. Start
    // this scenario from a reset race so the capture proves recovery rather than
    // inheriting an arbitrary post-drift camera position beside track scenery.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyA");
    let offTrack = gated;
    let recoveryStatus = await page.locator("#alignment-status").getAttribute("data-state");
    for (let sample = 0; sample < 40 && (
      offTrack.renderedFeedback?.offTrack !== true ||
      offTrack.renderedFeedback?.recoveryVisible !== true ||
      recoveryStatus !== "recovering"
    ); sample += 1) {
      await page.waitForTimeout(180);
      offTrack = await readTurbo(page);
      recoveryStatus = await page.locator("#alignment-status").getAttribute("data-state");
    }
    if (
      offTrack.renderedFeedback?.offTrack === true &&
      offTrack.renderedFeedback?.recoveryVisible === true &&
      recoveryStatus === "recovering"
    ) {
      turboCaptures["off-track"] = await capture(page, "showcase-turbo-drift-circuit", "off-track");
    }
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyW");

    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    const reset = await readTurbo(page);
    turboCaptures.reset = await capture(page, "showcase-turbo-drift-circuit", "reset");

    // Prove throttle against the named high-speed sample captured while throttle is still held.
    // `after` is intentionally sampled after releasing throttle and waiting for the drift recovery,
    // so comparing its decelerated speed to launch becomes timing-sensitive when a detailed GLB
    // increases screenshot encode time. The retained high-speed frame and its telemetry are the
    // direct evidence for this assertion.
    check(atSpeed.speed > before.speed + 0.04, blockers, "throttle did not increase visible car speed");
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
    /*
     * The opponent must be driven by a *named, evidenced* controller.
     *
     * This previously pinned the exact string `route-local-deterministic-opponent-ai`, and had been
     * failing since 1.5.0 — commit 94fe85fb moved the route onto the reusable
     * `aura-vehicle-driver-ai` and this assertion was never updated. So the gate was red for a
     * reason that was an *improvement*: the route stopped hand-rolling its opponent and adopted the
     * shared driver, which is exactly the direction WS-3 wants.
     *
     * Accepting either value keeps the invariant that matters (the opponent reports a known
     * controller, not nothing) without pinning the route to the less reusable of the two. Both are
     * declared in `opponent-ai.ts`; an unknown or absent value still fails.
     */
    check(
      after.opponent?.controller === "aura-vehicle-driver-ai"
        || after.opponent?.controller === "route-local-deterministic-opponent-ai",
      blockers,
      `opponent controller evidence is missing (got ${String(after.opponent?.controller)})`
    );
    check(after.opponent?.independentFromPlayerPlacement === true, blockers, "opponent is still derived from player placement");
    check((after.opponent?.decisionCount ?? 0) > 0, blockers, "opponent did not make autonomous pacing decisions");
    check((after.opponent?.progress ?? 0) !== ((after.raceState?.progress ?? 0) + 0.22) % 1, blockers, "opponent retained the old player-progress offset behavior");
    checkPhysicsBackend(after.physics, blockers, "turbo drift");
    for (const requiredState of ["start", "high-speed-chase", "drift", "checkpoint", "off-track", "reset"]) {
      check(
        turboCaptures[requiredState] !== undefined,
        blockers,
        `named capture state was never reached: ${requiredState}`
      );
    }
    // Rendered drift feedback must come from real slip, not steering input.
    check(
      drifting.renderedFeedback?.driftAmount !== undefined && drifting.renderedFeedback.driftAmount > 0.12,
      blockers,
      "handbrake did not build real drift slip in game.racing"
    );
    check(
      (drifting.renderedFeedback?.ribbonLength ?? 0) > (before.renderedFeedback?.ribbonLength ?? 0),
      blockers,
      "drift ribbon length did not scale with slip and speed"
    );
    check(
      after.observedRenderedFeedback?.driftRendered === true
        && after.observedRenderedFeedback?.highSpeedRendered === true,
      blockers,
      "rendered drift and speed feedback were never observed"
    );
    writeRouteReport("showcase-turbo-drift-circuit", blockers, errors, beforePng, afterPng, {
      before, atSpeed, drifting, after, gated, offTrack, reset,
      namedCaptures: turboCaptures
    });
    expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
  });

  test("proves skyline runner gameplay when keyboard input is applied", async ({ page }, testInfo) => {
    // The route itself must finish within the responsive 70–115 simulated
    // seconds. This wall-clock allowance covers the earlier real-time checkpoint/
    // respawn journey, deterministic mounted-app simulation, WebGL rendering,
    // evidence serialization, and thirteen PNG encodes.
    testInfo.setTimeout(480_000);
    const blockers: string[] = [];
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-skyline-runner/`, { waitUntil: "domcontentloaded" });
    const before = await waitForSkyline(page);
    const beforePng = await capture(page, "showcase-skyline-runner", "before-input");

    const skylineCaptures: Record<string, ScreenshotEvidence> = { "first-load": beforePng };

    // The opening platform immediately teaches a moving jump. Start both inputs
    // together so a loaded browser cannot turn a nominally short walk capture
    // into an unobserved fall before Space is delivered.
    await page.keyboard.down("KeyD");
    await page.keyboard.down("Space");
    await expect.poll(async () => {
      const current = await readSkylineDriver(page);
      return current.deaths === before.deaths && current.snapshot?.grounded === false
        ? current.snapshot.x
        : Number.NEGATIVE_INFINITY;
    }, { timeout: 2_000, message: "runner should perform the opening moving jump" })
      .toBeGreaterThan((before.diagnostics?.snapshot?.x ?? 0) + 0.1);
    await page.keyboard.up("KeyD");
    const traversing = await readSkyline(page);
    expect(traversing.deaths, "runner must stay alive during the opening moving jump").toBe(before.deaths);
    expect(
      traversing.diagnostics?.snapshot?.x ?? 0,
      "runner should move right while alive before the opening jump"
    ).toBeGreaterThan((before.diagnostics?.snapshot?.x ?? 0) + 0.1);
    // Freeze the genuinely reached traversal state before capturing it. Keeping
    // Right held while Chromium encodes the screenshot can carry the runner off
    // the finite opening platform and respawn it, replacing the state the poll
    // just proved with the reset position. This does not relax the movement
    // assertion above; it makes the named traversal evidence deterministic.
    // Traversal: the runner is moving right along the course.
    skylineCaptures.traversal = await capture(page, "showcase-skyline-runner", "traversal");
    // Jump: capture while the runner is genuinely airborne.
    if (traversing.diagnostics?.snapshot?.grounded === false) {
      skylineCaptures.jump = await capture(page, "showcase-skyline-runner", "jump");
    }
    await page.keyboard.up("Space");
    await page.waitForTimeout(240);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(580);
    const after = await readSkyline(page);
    const afterPng = await capture(page, "showcase-skyline-runner", "after-input");
    // Landing: back in contact with a surface after the jump.
    if (after.diagnostics?.snapshot?.grounded === true) {
      skylineCaptures.landing = await capture(page, "showcase-skyline-runner", "landing");
    }

    const rightFacing = after.diagnostics?.snapshot;
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(180);
    await page.keyboard.up("KeyA");
    await page.waitForTimeout(80);
    const leftFacing = await readSkyline(page);

    // Reach the first relay with ordinary keyboard play, miss the next jump naturally,
    // then prove the repaired checkpoint respawn can recover and continue forward.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(120);
    await page.keyboard.down("KeyD");
    let checkpointSpawn = await readSkyline(page);
    let checkpointDriver = await readSkylineDriver(page);
    // At the shipped 1.1-unit/second pace the first relay sits about 29 units from
    // spawn, so the old 12-second allowance could never reach it after the Level 1
    // was extended. This bound covers that physical distance without teleporting.
    for (let sample = 0; sample < 350 && checkpointDriver.checkpointId !== SKYLINE_FIRST_MID_CHECKPOINT_ID; sample += 1) {
      if (checkpointDriver.snapshot?.grounded === true) {
        await page.keyboard.press("Space");
      }
      await page.waitForTimeout(100);
      checkpointDriver = await readSkylineDriver(page);
    }
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(120);
    checkpointSpawn = await readSkyline(page);
    if (checkpointSpawn.checkpointId === SKYLINE_FIRST_MID_CHECKPOINT_ID) {
      skylineCaptures.checkpoint = await capture(page, "showcase-skyline-runner", "checkpoint");
    }
    const checkpointDeaths = checkpointSpawn.deaths;
    await page.keyboard.down("KeyD");
    // Continue without jumping until the next certified gap or sentry produces a real
    // route death, then prove that the active checkpoint owns the recovery.
    await expect.poll(async () => (await readSkylineDriver(page)).deaths, { timeout: 10_000 }).toBeGreaterThan(checkpointDeaths);
    await page.keyboard.up("KeyD");
    // A death is observable on the same browser frame that starts the respawn.
    // Do not treat that transient, falling frame as the recovered checkpoint state:
    // keep input neutral until the new body has actually landed on the certified
    // supporting surface. Reapplying Right before this condition was what turned a
    // valid respawn into a deterministic second fall in the evidence driver.
    await expect.poll(async () => (await readSkylineDriver(page)).snapshot?.grounded, {
      timeout: 5_000,
      message: "runner should settle on a certified surface after respawn"
    }).toBe(true);
    const respawned = await readSkyline(page);
    expect(respawned.deaths, "respawn must retain the observed death count").toBeGreaterThan(checkpointDeaths);
    expect(respawned.checkpointId, "respawn must retain the active first relay").toBe(SKYLINE_FIRST_MID_CHECKPOINT_ID);
    const firstRelay = createSkylineLevel().checkpoints.find((checkpoint) => checkpoint.id === SKYLINE_FIRST_MID_CHECKPOINT_ID);
    expect(
      Math.abs((respawned.diagnostics?.snapshot?.x ?? Number.POSITIVE_INFINITY) - SKYLINE_FIRST_MID_CHECKPOINT_X),
      "respawn must land within the visible first-relay trigger and its certified supporting surface"
    ).toBeLessThanOrEqual(firstRelay?.radius ?? 0.35);
    expect(respawned.diagnostics?.snapshot?.grounded, "respawn must settle on the certified relay support").toBe(true);
    skylineCaptures.respawn = await capture(page, "showcase-skyline-runner", "respawn");
    await page.keyboard.down("KeyD");
    let continued = respawned;
    for (
      let sample = 0;
      sample < 50
      && continued.deaths === respawned.deaths
      && (continued.diagnostics?.snapshot?.x ?? 0) <= (respawned.diagnostics?.snapshot?.x ?? 0) + 0.65;
      sample += 1
    ) {
      if (continued.diagnostics?.snapshot?.grounded === true) {
        await page.keyboard.press("Space");
      }
      await page.waitForTimeout(100);
      continued = await readSkyline(page);
    }
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(120);
    continued = await readSkyline(page);

    // The deliberate checkpoint death above proves recovery, but it must not pad
    // or contaminate the physical start-to-finish duration measurement. Begin the
    // completion run from a clean public reset and traverse the entire level.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    let completed = await readSkyline(page);
    let completionDriver = await readSkylineCompletionDriver(page);
    const completionLevel = createSkylineLevel();
    await startSkylineManualDriver(page);
    // Drive the mounted Aura app through its public deterministic lifecycle. Each
    // batch advances real `app.onFrame` callbacks, `game.input`, `game.platformer`,
    // collisions, checkpoints, renderer output, and route evidence by exactly 60
    // fixed 1/60-second frames. Only wall-clock RAF scheduling is removed.
    for (let second = 0; second < 180 && completionDriver.completed !== true; second += 1) {
      completionDriver = await stepSkylineManualDriver(page, completionLevel, 60);
      const x = completionDriver.snapshot?.x ?? 0;
      for (const act of SKYLINE_LEVEL_ACTS.slice(1)) {
        const label = `act-${act.id}`;
        const actStartX = act.sections[0] * SKYLINE_SECTION_STRIDE;
        if (x >= actStartX + 7.5 && skylineCaptures[label] === undefined) {
          await presentSkylineManualDriver(page);
          skylineCaptures[label] = await captureScene(page, "showcase-skyline-runner", label);
        }
      }
    }
    await stopSkylineManualDriver(page);
    completed = await readSkyline(page);
    // Collection chain: by the completion run the player has banked collectibles.
    if (Number(completed.coins ?? 0) > Number(before.coins ?? 0)) {
      skylineCaptures["collection-chain"] = await capture(page, "showcase-skyline-runner", "collection-chain");
    }
    if (completed.diagnostics?.completionProof?.completed === true) {
      skylineCaptures.finish = await capture(page, "showcase-skyline-runner", "finish");
    }

    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    const reset = await readSkyline(page);
    skylineCaptures.reset = await capture(page, "showcase-skyline-runner", "reset");
    const states = (after.animation?.stateHistory ?? []).map((entry) => entry.state);
    const beforeContact = before.diagnostics?.surfaceContactAlignment;

    check((traversing.diagnostics?.snapshot?.x ?? 0) > (before.diagnostics?.snapshot?.x ?? 0) + 0.1, blockers, "movement did not change runner x position");
    check(rightFacing?.facing === 1 && rightFacing.facingYaw === Math.PI / 2, blockers, "runner did not face right along forward travel");
    check(leftFacing.diagnostics?.snapshot?.facing === -1 && leftFacing.diagnostics.snapshot.facingYaw === -Math.PI / 2, blockers, "runner did not turn left with reverse travel");
    check(checkpointSpawn.checkpointId === SKYLINE_FIRST_MID_CHECKPOINT_ID, blockers, "first-district checkpoint setup failed");
    check(respawned.deaths > checkpointSpawn.deaths, blockers, "missed mid-course jump did not respawn the runner");
    check((continued.diagnostics?.snapshot?.x ?? 0) > (respawned.diagnostics?.snapshot?.x ?? 0) + 0.65, blockers, "runner remained blocked after checkpoint respawn");
    check(continued.deaths === respawned.deaths, blockers, "runner re-entered a death loop after checkpoint respawn");
    check(states.includes("jump") || Math.abs(after.diagnostics?.snapshot?.vy ?? 0) > 0.05 || (after.diagnostics?.snapshot?.y ?? 0) !== (before.diagnostics?.snapshot?.y ?? 0), blockers, "jump did not change vertical or animation state");
    check(after.animation?.sampleFrame !== before.animation?.sampleFrame, blockers, "animation state frame did not advance");
    // The contract is event-derived and cumulative per mounted session. Hazard
    // and respawn are proven by the deliberate missed-jump sequence (`respawned`);
    // checkpoint and finish are proven by the completion run (`completed`). A
    // clean completion run legitimately reports no hazard, so read each flag from
    // the sample that actually drove it.
    check(
      (respawned.kitContractProof?.hazardEvent === true || respawned.kitContractProof?.fallEvent === true)
        && respawned.kitContractProof?.respawnEvent === true
        && respawned.kitContractProof?.hazardRespawnOrRetry === true,
      blockers,
      "hazard-or-fall death and respawn progression is not proven"
    );
    check(
      completed.kitContractProof?.checkpointEvent === true && completed.kitContractProof.finishEvent === true,
      blockers,
      "checkpoint/finish progression is not proven"
    );
    check(completed.diagnostics?.completionProof?.completed === true, blockers, "completion proof does not reach the finish");
    check((completed.diagnostics?.completionProof?.finalTime ?? 0) >= 70, blockers, "physical completion occurred before the responsive Level 1 floor");
    check((completed.diagnostics?.completionProof?.finalTime ?? Number.POSITIVE_INFINITY) <= 115, blockers, "physical completion exceeded the responsive Level 1 ceiling");
    check(completed.diagnostics?.completionProof?.stable === true && ((completed.diagnostics.completionProof.checkpoints?.length ?? 0) > 0 || (completed.diagnostics.completionProof.eventCounts?.respawn ?? 0) > 0), blockers, "stable checkpoint/hazard route progression proof is missing");
    check((after.levelDesign?.authoredPlayableSeconds ?? 0) === 95, blockers, "authored platformer path is not the five-act 95-second target");
    check(after.levelDesign?.styleCompatible === true && after.levelDesign.scaleCompatible === true, blockers, "platformer asset style/scale fit is not proven");
    check(beforeContact?.feetOnSurface === true, blockers, "runner initial feet are not proven on a visible playable surface");
    check(Math.abs(beforeContact?.verticalGap ?? Number.POSITIVE_INFINITY) <= 0.12, blockers, "runner surface contact gap exceeds playable-surface tolerance");
    check((beforeContact?.playerTargetHeight ?? 0) > 0, blockers, "runner visible target height is missing from surface binding evidence");
    check(after.challenge?.kind === "skyline-runner-flow-challenge", blockers, "runner flow challenge evidence is missing");
    check((after.challenge?.elapsedSeconds ?? 0) > (before.challenge?.elapsedSeconds ?? 0), blockers, "runner challenge clock did not advance");
    check((after.challenge?.maxFlow ?? 0) > 0, blockers, "movement and jumping did not build runner flow");
    check((reset.challenge?.resets ?? 0) > (before.challenge?.resets ?? 0), blockers, "reset did not restart the flow challenge");
    check(reset.checkpointId === "start" && reset.coins === 0, blockers, "reset did not restore the start checkpoint");
    // FS-103: every named state must have been genuinely reached and captured.
    for (const requiredState of [
      "first-load", "traversal", "jump", "landing", "collection-chain",
      "checkpoint", "respawn", "act-broken-canopy", "act-sentry-pass",
      "act-cloudstep-rise", "act-aurora-crown", "finish", "reset"
    ]) {
      check(
        skylineCaptures[requiredState] !== undefined,
        blockers,
        `named capture state was never reached: ${requiredState}`
      );
    }
    writeRouteReport("showcase-skyline-runner", blockers, errors, beforePng, afterPng, {
      before,
      traversing,
      after,
      checkpointSpawn,
      respawned,
      continued,
      completed,
      reset,
      namedCaptures: skylineCaptures
    });
    expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
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

    // FS-101 named capture states. Each capture is taken only after the mounted
    // game actually reached the named condition, so the filename cannot claim a
    // state the route never entered.
    const namedCaptures: Record<string, ScreenshotEvidence> = {
      "first-load": beforePng,
      "active-piece": afterPng
    };

    // Named capture states reachable from the route's opening board.
    //
    // Scope note: level progression is deliberately NOT captured here. The route
    // advances a level every ten cleared lines, and forcing ten clears from a
    // fresh board would require an opening stack filling half the playfield —
    // i.e. a nearly-lost game on first load, which contradicts the visual goal.
    // Level progression is instead proven by the deterministic replay proof in
    // `rules.ts` (92 lines, level 29), asserted by
    // `tests/unit/apps/blockfall-sixty-second-replay.test.ts`.
    const spreadDrop = async (column: number): Promise<void> => {
      for (let step = 0; step < 5; step += 1) await page.keyboard.press("ArrowLeft");
      for (let step = 0; step < column; step += 1) await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Space");
      await page.waitForTimeout(80);
    };

    // Line clear: the opening board's top rows sit one cell from completing, so
    // a placed piece completes a row. `lines` already advanced during the
    // earlier hard-drop assertions, so compare against the pre-input baseline.
    const baselineLines = Number(before.current?.lines ?? 0);
    let lineClearState = await readBlockfall(page);
    for (let round = 0; round < 40 && Number(lineClearState.current?.lines ?? 0) <= baselineLines; round += 1) {
      if (lineClearState.current?.gameOver === true) {
        await page.keyboard.press("KeyR");
        await page.waitForTimeout(180);
      }
      await spreadDrop(round % 10);
      lineClearState = await readBlockfall(page);
    }
    if (Number(lineClearState.current?.lines ?? 0) > baselineLines) {
      // A clear immediately spawns the next piece on the hidden/top row. Capturing that exact
      // transition made the new piece read as a stray pink bar attached to the cabinet header,
      // even though it was ordinary live gameplay. Advance the mounted piece into the visible
      // well while the 900 ms renderer-owned clear burst is still active. This keeps the named
      // frame truthful (the clear just occurred and its beat is visible) while making the newly
      // spawned controllable piece legible as a tetromino rather than a cabinet artifact.
      for (let step = 0; step < 3; step += 1) {
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(35);
      }
      lineClearState = await readBlockfall(page);
      namedCaptures["line-clear"] = await capture(page, "showcase-blockfall-reactor", "line-clear");
    }

    // Game over: stack a single column until the board tops out.
    let gameOverState = lineClearState;
    for (let drop = 0; drop < 260 && gameOverState.current?.gameOver !== true; drop += 1) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(60);
      gameOverState = await readBlockfall(page);
    }
    if (gameOverState.current?.gameOver === true) {
      namedCaptures["game-over"] = await capture(page, "showcase-blockfall-reactor", "game-over");
    }

    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    const reset = await readBlockfall(page);
    namedCaptures.reset = await capture(page, "showcase-blockfall-reactor", "reset");

    check(minCellX(movedLeft) < minCellX(before), blockers, "left input did not move active block left");
    check(minCellX(movedRight) > minCellX(movedLeft), blockers, "right input did not move active block right");
    check(rotated.kitContractProof?.rotateChangesRotation === true, blockers, "rotate orientation proof is missing");
    check((after.current?.piecesPlaced ?? 0) > (before.current?.piecesPlaced ?? 0), blockers, "hard drop did not lock a piece");
    check(after.current?.checksum !== before.current?.checksum, blockers, "game state checksum did not change after input");
    check(after.lineClearProof?.passed === true && after.lineClearProof.clearedLines === 1, blockers, "line-clear scoring proof is missing");
    check(reset.current?.score === 0 && reset.current.lines === 0 && reset.current.hold === null && reset.current.piecesPlaced === 0, blockers, "reset did not clear score, lines, hold, and placed pieces");
    checkPhysicsBackend(after.physics, blockers, "blockfall");
    // Every named state the PRD requires must have been reached and captured.
    for (const requiredState of ["first-load", "active-piece", "line-clear", "game-over", "reset"]) {
      check(
        namedCaptures[requiredState] !== undefined,
        blockers,
        `named capture state was never reached: ${requiredState}`
      );
    }
    check(
      lineClearState.current !== undefined && Number(lineClearState.current.lines) > baselineLines,
      blockers,
      "mounted play did not produce a line clear"
    );
    check(gameOverState.current?.gameOver === true, blockers, "mounted play did not reach game over");
    // Level progression is proven by the deterministic replay proof, not here.
    check(
      (after.sixtySecondReplayProof?.missingMechanics ?? ["unproven"]).length === 0,
      blockers,
      "deterministic replay proof did not cover every named mechanic"
    );
    check(
      after.sixtySecondReplayProof?.pass === true,
      blockers,
      "deterministic 60-second replay proof does not pass"
    );
    writeRouteReport("showcase-blockfall-reactor", blockers, errors, beforePng, afterPng, {
      before, movedLeft, movedRight, rotated, after, reset,
      lineClearState, gameOverState,
      namedCaptures,
      levelProgressionProvenBy: "tests/unit/apps/blockfall-sixty-second-replay.test.ts",
      sixtySecondReplayProof: after.sixtySecondReplayProof
    });
    expect([...blockers, ...errors], blockers.join("\n")).toEqual([]);
  });
});

function checkPhysicsBackend(
  physics: PhysicsRouteEvidence | undefined,
  blockers: string[],
  label: string
): void {
  check(physics?.selection === "rapier", blockers, `${label} did not select Rapier`);
  check(physics?.angularContactResponse === true, blockers, `${label} did not prove angular contact response`);
  check(physics?.continuousCollisionActive === true, blockers, `${label} did not activate continuous-collision protection`);
  check(
    physics?.continuousCollisionProvider === "rapier-native-ccd+adaptive-substeps",
    blockers,
    `${label} mislabeled the CCD provider`
  );
  check((physics?.continuousCollisionSubSteps ?? 0) > 1, blockers, `${label} did not exercise CCD substeps`);
  check(physics?.fastMoverDidNotTunnel === true, blockers, `${label} fast mover tunneled`);
  check(
    physics?.continuousCollisionOwnership.includes("Rapier native CCD") === true,
    blockers,
    `${label} did not disclose which layer owns fast-body protection`
  );
}

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
  await expect.poll(() => page.evaluate(() => {
    const evidence = window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__;
    const renderSize = evidence?.diagnostics?.renderSize;
    return evidence !== undefined
      && Number(evidence.frameCount) > 0
      && Number(evidence.diagnostics?.drawCalls) > 0
      && Array.isArray(renderSize)
      && Number(renderSize[0]) > 0
      && Number(renderSize[1]) > 0;
  }), {
    timeout: 60_000,
    message: "Turbo should complete a non-empty Aura3D render before first-load capture"
  }).toBe(true);
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
  await expect.poll(() => page.evaluate(() => {
    const evidence = window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
    const renderSize = evidence?.diagnostics?.renderSize;
    return evidence !== undefined
      && Number(evidence.frameCount) > 0
      && Number(evidence.diagnostics?.drawCalls) > 0
      && Array.isArray(renderSize)
      && Number(renderSize[0]) > 0
      && Number(renderSize[1]) > 0;
  }), {
    timeout: 60_000,
    message: "Skyline should complete a non-empty Aura3D render before first-load capture"
  }).toBe(true);
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
  await expect.poll(() => page.evaluate(() => {
    const evidence = window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
    const renderSize = evidence?.diagnostics?.renderSize;
    return evidence !== undefined
      && Number(evidence.frameCount) > 0
      && Number(evidence.diagnostics?.drawCalls) > 0
      && Array.isArray(renderSize)
      && Number(renderSize[0]) > 0
      && Number(renderSize[1]) > 0;
  }), {
    timeout: 60_000,
    message: "Blockfall should complete a non-empty Aura3D render before first-load capture"
  }).toBe(true);
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

async function readSkylineCompletionDriver(page: Page): Promise<{
  readonly completed: boolean;
  readonly snapshot?: { readonly x: number; readonly y: number; readonly grounded: boolean };
}> {
  return page.evaluate(() => {
    const evidence = window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
    return {
      completed: evidence?.diagnostics?.completionProof?.completed === true,
      snapshot: evidence?.diagnostics?.snapshot === undefined
        ? undefined
        : {
            x: evidence.diagnostics.snapshot.x,
            y: evidence.diagnostics.snapshot.y,
            grounded: evidence.diagnostics.snapshot.grounded
          }
    };
  });
}

async function startSkylineManualDriver(page: Page): Promise<void> {
  await page.evaluate(() => {
    type DriverHost = typeof globalThis & {
      __AURA3D_SKYLINE_TEST_DRIVER__?: {
        lastJumpFrame: number;
        observedDeaths: number;
        recoveryFrames: number;
      };
      __AURA3D_LIVE_APPS__?: {
        pauseAll(): number;
      };
    };
    const host = globalThis as DriverHost;
    host.__AURA3D_LIVE_APPS__?.pauseAll();
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "KeyD", bubbles: true }));
    host.__AURA3D_SKYLINE_TEST_DRIVER__ = {
      lastJumpFrame: Number.NEGATIVE_INFINITY,
      observedDeaths: window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__?.deaths ?? 0,
      recoveryFrames: 0
    };
  });
}

async function stepSkylineManualDriver(
  page: Page,
  level: ReturnType<typeof createSkylineLevel>,
  frames: number
): Promise<Awaited<ReturnType<typeof readSkylineCompletionDriver>>> {
  return page.evaluate(({ platforms, hazards, framesToRun }) => {
    type DriverHost = typeof globalThis & {
      __AURA3D_SKYLINE_TEST_DRIVER__?: {
        lastJumpFrame: number;
        observedDeaths: number;
        recoveryFrames: number;
      };
      __AURA3D_LIVE_APPS__?: {
        all(): readonly { advance(dt?: number): void; step(dt?: number): void }[];
      };
    };
    const host = globalThis as DriverHost;
    const driver = host.__AURA3D_SKYLINE_TEST_DRIVER__;
    const app = host.__AURA3D_LIVE_APPS__?.all()[0];
    if (!driver || !app) throw new Error("Skyline manual driver requires one mounted Aura app.");
    const dispatch = (type: "keydown" | "keyup", code: string) => {
      window.dispatchEvent(new KeyboardEvent(type, { code, key: code === "Space" ? " " : code, bubbles: true }));
    };
    for (let index = 0; index < framesToRun; index += 1) {
      const evidence = window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
      if (evidence?.diagnostics?.completionProof?.completed === true) {
        break;
      }
      const grounded = evidence?.diagnostics?.snapshot?.grounded === true;
      const snapshot = evidence?.diagnostics?.snapshot;
      const frame = evidence?.frameCount ?? 0;
      const deaths = evidence?.deaths ?? 0;
      if (deaths > driver.observedDeaths) {
        driver.observedDeaths = deaths;
        driver.recoveryFrames = 1;
        dispatch("keyup", "KeyD");
        dispatch("keyup", "Space");
      }
      const recovering = driver.recoveryFrames > 0 || (
        driver.observedDeaths > 0 && snapshot?.grounded !== true && deaths === driver.observedDeaths
      );
      if (!recovering) {
        dispatch("keydown", "KeyD");
      }
      const currentSurfaceIndex = snapshot === undefined
        ? -1
        : platforms.findIndex((surface) => {
            const top = surface.y + surface.height;
            return snapshot.x >= surface.x - 0.04
              && snapshot.x <= surface.x + surface.width + 0.04
              && Math.abs(snapshot.y - top) <= 0.08;
          });
      const currentSurface = platforms[currentSurfaceIndex];
      const nextSurface = currentSurfaceIndex >= 0 ? platforms[currentSurfaceIndex + 1] : undefined;
      const edgeDistance = currentSurface !== undefined && snapshot !== undefined
        ? currentSurface.x + currentSurface.width - snapshot.x
        : Number.POSITIVE_INFINITY;
      const nextGap = currentSurface !== undefined && nextSurface !== undefined
        ? nextSurface.x - (currentSurface.x + currentSurface.width)
        : 0;
      const risingStep = currentSurface !== undefined && nextSurface !== undefined
        ? nextSurface.y + nextSurface.height > currentSurface.y + currentSurface.height + 0.08
        : false;
      const upcomingHazard = snapshot !== undefined && hazards.some((hazard) => {
        const distance = hazard.x - snapshot.x;
        return distance >= 0 && distance <= 0.28;
      });
      const routeJump = edgeDistance <= 0.38 && (nextGap > 0.05 || risingStep);
      const wantJump = !recovering
        && grounded
        && frame - driver.lastJumpFrame >= 18
        && (upcomingHazard || routeJump || currentSurfaceIndex < 0);
      if (wantJump) {
        driver.lastJumpFrame = frame;
        dispatch("keydown", "Space");
        // Preserve the route proof's one-step `jumpPressed` input without a
        // variable-height hold. `game.input` retains the pending press edge
        // through the immediate release and consumes it on the next app frame.
        dispatch("keyup", "Space");
      }
      app.advance(1 / 60);
      if (driver.recoveryFrames > 0) driver.recoveryFrames -= 1;
    }
    const evidence = window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
    return {
      completed: evidence?.diagnostics?.completionProof?.completed === true,
      snapshot: evidence?.diagnostics?.snapshot === undefined
        ? undefined
        : {
            x: evidence.diagnostics.snapshot.x,
            y: evidence.diagnostics.snapshot.y,
            grounded: evidence.diagnostics.snapshot.grounded
          }
    };
  }, {
    platforms: [...(level.platforms ?? [])].sort((left, right) => left.x - right.x),
    hazards: [...(level.hazards ?? [])].sort((left, right) => left.x - right.x),
    framesToRun: frames
  });
}

async function stopSkylineManualDriver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __AURA3D_SKYLINE_TEST_DRIVER__?: unknown;
      __AURA3D_LIVE_APPS__?: { resumeAll(): number };
    };
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "KeyD", bubbles: true }));
    delete host.__AURA3D_SKYLINE_TEST_DRIVER__;
    host.__AURA3D_LIVE_APPS__?.resumeAll();
  });
}

async function presentSkylineManualDriver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __AURA3D_LIVE_APPS__?: { all(): readonly { step(dt?: number): void }[] };
    };
    host.__AURA3D_LIVE_APPS__?.all()[0]?.step(0);
  });
}

async function readSkylineDriver(page: Page): Promise<{
  readonly deaths: number;
  readonly checkpointId?: string;
  readonly snapshot?: { readonly x: number; readonly y: number; readonly grounded: boolean };
}> {
  return page.evaluate(() => {
    const evidence = window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__;
    return {
      deaths: evidence?.deaths ?? 0,
      checkpointId: evidence?.checkpointId,
      snapshot: evidence?.diagnostics?.snapshot === undefined
        ? undefined
        : {
            x: evidence.diagnostics.snapshot.x,
            y: evidence.diagnostics.snapshot.y,
            grounded: evidence.diagnostics.snapshot.grounded
          }
    };
  });
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
  /*
   * Screenshot encoding is not instantaneous on renderer-heavy routes. Turbo's PNG capture took
   * long enough for a held steering key to advance the simulation by hundreds of frames: the JSON
   * described the state that triggered the capture, while the PNG showed a car several corners
   * later, sometimes facing into the infield. The engine already owns a public capture seam for
   * exactly this purpose. Freeze every mounted Aura app while Chromium reads the pixels, then resume
   * in `finally` so a failed screenshot cannot leave the rest of the gameplay proof paused.
   */
  const pausedApps = await page.evaluate(() => {
    const registry = (globalThis as typeof globalThis & {
      __AURA3D_LIVE_APPS__?: { pauseAll(): number };
    }).__AURA3D_LIVE_APPS__;
    return registry?.pauseAll() ?? 0;
  });
  try {
    const buffer = await page.screenshot({ path, fullPage: false, scale: "css", timeout: 30_000 });
    return { path, bytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex") };
  } finally {
    if (pausedApps > 0) {
      await page.evaluate(() => {
        const registry = (globalThis as typeof globalThis & {
          __AURA3D_LIVE_APPS__?: { resumeAll(): number };
        }).__AURA3D_LIVE_APPS__;
        registry?.resumeAll();
      });
    }
  }
}

async function captureScene(page: Page, appId: string, label: string): Promise<ScreenshotEvidence> {
  const path = resolve(REPORT_DIR, `${appId}-${label}.png`);
  const canvas = page.locator("canvas").first();
  await expect(canvas, `${appId} should expose a rendered canvas for ${label}`).toBeVisible({ timeout: 10_000 });
  const buffer = await canvas.screenshot({ path, scale: "css", timeout: 30_000 });
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
  if (appId === "showcase-turbo-drift-circuit" && isTurboReport(evidence)) {
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
  if (appId === "showcase-skyline-runner" && isSkylineReport(evidence)) {
    return {
      platformer: {
        movementChangesPosition: (evidence.after.diagnostics?.snapshot?.x ?? 0) > (evidence.before.diagnostics?.snapshot?.x ?? 0) + 0.35,
        jumpChangesState: (evidence.after.animation?.stateHistory ?? []).some((entry) => entry.state === "jump") || Math.abs(evidence.after.diagnostics?.snapshot?.vy ?? 0) > 0.05,
        checkpointProgression: evidence.after.kitContractProof?.checkpointEvent === true,
        hazardRespawn: evidence.after.kitContractProof?.hazardEvent === true && evidence.after.kitContractProof.respawnEvent === true,
        finishProgression:
          evidence.completed?.kitContractProof?.finishEvent === true &&
          evidence.completed.diagnostics?.completionProof?.completed === true,
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

function isSkylineReport(value: object): value is {
  readonly before: SkylineEvidence;
  readonly after: SkylineEvidence;
  readonly completed?: SkylineEvidence;
  readonly reset: SkylineEvidence;
} {
  const record = value as Readonly<Record<string, unknown>>;
  return isRecord(record.before) && isRecord(record.after) && isRecord(record.reset) && "checkpointId" in record.after;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
