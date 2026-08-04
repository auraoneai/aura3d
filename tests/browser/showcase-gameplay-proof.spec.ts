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

interface TurboRenderedFeedback {
  readonly driftVisible?: boolean;
  readonly driftAmount?: number;
  readonly speedFraction?: number;
  readonly ribbonLength?: number;
  readonly offTrack?: boolean;
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
  readonly nativeAuraJsLimit: string;
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

    // FS-102 named capture points. Each is written only after the mounted race
    // reached the named condition, so a filename cannot claim an unreached state.
    const turboCaptures: Record<string, ScreenshotEvidence> = { start: beforePng };

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(900);
    // High-speed chase: capture once real speed has built.
    const atSpeed = await readTurbo(page);
    if (atSpeed.speed > before.speed + 0.04) {
      turboCaptures["high-speed-chase"] = await capture(page, "showcase-turbo-drift-circuit", "high-speed-chase");
    }
    // Drift: the handbrake is what builds real slip in game.racing.
    await page.keyboard.down("KeyD");
    await page.keyboard.down("Space");
    await page.waitForTimeout(750);
    const drifting = await readTurbo(page);
    if (drifting.renderedFeedback?.driftVisible === true) {
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
    if (gated.kitContractProof?.checkpointAdvances === true) {
      turboCaptures.checkpoint = await capture(page, "showcase-turbo-drift-circuit", "checkpoint");
    }

    // Off-track: drive off the road and capture the retained penalty state.
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyA");
    let offTrack = gated;
    for (let sample = 0; sample < 40 && offTrack.renderedFeedback?.offTrack !== true; sample += 1) {
      await page.waitForTimeout(180);
      offTrack = await readTurbo(page);
    }
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyW");
    if (offTrack.renderedFeedback?.offTrack === true) {
      turboCaptures["off-track"] = await capture(page, "showcase-turbo-drift-circuit", "off-track");
    }

    await page.keyboard.press("KeyR");
    await page.waitForTimeout(260);
    const reset = await readTurbo(page);
    turboCaptures.reset = await capture(page, "showcase-turbo-drift-circuit", "reset");

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
    check(after.opponent?.controller === "route-local-deterministic-opponent-ai", blockers, "opponent controller evidence is missing");
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

  test("proves skyline runner gameplay when keyboard input is applied", async ({ page }) => {
    const blockers: string[] = [];
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-skyline-runner/`, { waitUntil: "domcontentloaded" });
    const before = await waitForSkyline(page);
    const beforePng = await capture(page, "showcase-skyline-runner", "before-input");

    const skylineCaptures: Record<string, ScreenshotEvidence> = { "first-load": beforePng };

    await page.keyboard.down("KeyD");
    await page.waitForTimeout(620);
    // Traversal: the runner is moving right along the course.
    skylineCaptures.traversal = await capture(page, "showcase-skyline-runner", "traversal");
    await page.keyboard.press("Space");
    await page.waitForTimeout(120);
    // Jump: capture while the runner is genuinely airborne.
    const airborne = await readSkyline(page);
    if (airborne.diagnostics?.snapshot?.grounded === false) {
      skylineCaptures.jump = await capture(page, "showcase-skyline-runner", "jump");
    }
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

    // Reach checkpoint 03 with ordinary keyboard play, miss the next jump naturally,
    // then prove the repaired checkpoint respawn can recover and continue forward.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(120);
    await page.keyboard.down("KeyD");
    let checkpointSpawn = await readSkyline(page);
    for (let sample = 0; sample < 120 && checkpointSpawn.checkpointId !== "asset-checkpoint-03"; sample += 1) {
      if (checkpointSpawn.diagnostics?.snapshot?.grounded === true) {
        await page.keyboard.press("Space");
      }
      await page.waitForTimeout(100);
      checkpointSpawn = await readSkyline(page);
    }
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(120);
    if (checkpointSpawn.checkpointId === "asset-checkpoint-03") {
      skylineCaptures.checkpoint = await capture(page, "showcase-skyline-runner", "checkpoint");
    }
    const checkpointDeaths = checkpointSpawn.deaths;
    await page.keyboard.down("KeyD");
    await expect.poll(async () => (await readSkyline(page)).deaths, { timeout: 4_000 }).toBeGreaterThan(checkpointDeaths);
    await page.keyboard.up("KeyD");
    await page.waitForTimeout(120);
    const respawned = await readSkyline(page);
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

    let completed = continued;
    await page.keyboard.down("KeyD");
    for (let hop = 0; hop < 80 && completed.diagnostics?.completionProof?.completed !== true; hop += 1) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(520);
      completed = await readSkyline(page);
    }
    await page.keyboard.up("KeyD");
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

    check((after.diagnostics?.snapshot?.x ?? 0) > (before.diagnostics?.snapshot?.x ?? 0) + 0.35, blockers, "movement did not change runner x position");
    check(rightFacing?.facing === 1 && rightFacing.facingYaw === Math.PI / 2, blockers, "runner did not face right along forward travel");
    check(leftFacing.diagnostics?.snapshot?.facing === -1 && leftFacing.diagnostics.snapshot.facingYaw === -Math.PI / 2, blockers, "runner did not turn left with reverse travel");
    check(checkpointSpawn.checkpointId === "asset-checkpoint-03", blockers, "mid-course checkpoint setup failed");
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
    check((completed.diagnostics?.completionProof?.finalTime ?? 0) >= 30, blockers, "completion proof is shorter than 30 seconds");
    check(completed.diagnostics?.completionProof?.stable === true && ((completed.diagnostics.completionProof.checkpoints?.length ?? 0) > 0 || (completed.diagnostics.completionProof.eventCounts?.respawn ?? 0) > 0), blockers, "stable checkpoint/hazard route progression proof is missing");
    check((after.levelDesign?.authoredPlayableSeconds ?? 0) >= 30, blockers, "authored platformer path is shorter than 30 seconds");
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
      "checkpoint", "respawn", "finish", "reset"
    ]) {
      check(
        skylineCaptures[requiredState] !== undefined,
        blockers,
        `named capture state was never reached: ${requiredState}`
      );
    }
    writeRouteReport("showcase-skyline-runner", blockers, errors, beforePng, afterPng, {
      before,
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
  check(physics?.selection === "cannon-es", blockers, `${label} did not select cannon-es`);
  check(physics?.angularContactResponse === true, blockers, `${label} did not prove angular contact response`);
  check(physics?.continuousCollisionActive === true, blockers, `${label} did not activate continuous-collision protection`);
  check(
    physics?.continuousCollisionProvider === "aura3d-adaptive-substep-wrapper",
    blockers,
    `${label} mislabeled the CCD provider`
  );
  check((physics?.continuousCollisionSubSteps ?? 0) > 1, blockers, `${label} did not exercise CCD substeps`);
  check(physics?.fastMoverDidNotTunnel === true, blockers, `${label} fast mover tunneled`);
  check(
    physics?.nativeAuraJsLimit.includes("without box-box") === true,
    blockers,
    `${label} did not disclose the native aura-js limit`
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
