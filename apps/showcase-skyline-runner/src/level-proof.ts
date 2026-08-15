import { game } from "@aura3d/engine";
import {
  SKYLINE_AUTHORED_PLAYABLE_SECONDS,
  SKYLINE_MAX_TARGET_PLAYABLE_SECONDS,
  SKYLINE_MIN_PLAYABLE_SECONDS,
  createSkylineLevel
} from "./level";

/**
 * Deterministic responsive-course acceptance proof for the five-act Level 1.
 *
 * FS-103 requires "at least 30 seconds of asset-aligned level duration and a 60-second" review run.
 * Duration is not observable in a screenshot and a mounted browser session cannot be replayed
 * deterministically, so the claim is proven by driving the *public* `game.platformer` kit with the
 * route's own asset-bound level over the full 7,200-frame acceptance window and recording
 * the exact physical finish frame.
 *
 * This mirrors the Blockfall replay proof and the Turbo race proof, and carries the same boundary:
 * it proves the kit sustains the level for the required duration under the route's real
 * configuration. It is not a claim about mounted browser playback, which the gameplay-proof browser
 * suite covers separately.
 */

/** Two minutes at 60 Hz: enough to cover the 115-second responsive completion ceiling. */
export const LEVEL_PROOF_FRAMES = 7200;
const STEP_SECONDS = 1 / 60;

export interface SkylineLevelProof {
  readonly simulation: string;
  /** Explicitly false: a kit simulation, not mounted browser playback. */
  readonly provesMountedKitPlayback: false;
  readonly simulatedSeconds: number;
  readonly frames: number;
  readonly deterministic: boolean;
  readonly minimumPlayableSeconds: number;
  readonly authoredPlayableSeconds: number;
  readonly metrics: {
    readonly framesPlayable: number;
    readonly secondsPlayable: number;
    /** Furthest forward distance reached from the start during the sweep. */
    readonly maxTraversalX: number;
    readonly jumpsLaunched: number;
    readonly groundedFrames: number;
    readonly airborneFrames: number;
    readonly collectedCount: number;
    readonly activatedCheckpointCount: number;
    readonly deaths: number;
    readonly finalScore: number;
    readonly finalStatus: string;
    readonly finishFrame: number | null;
  };
  readonly mechanics: {
    readonly movementAdvancesTraversal: boolean;
    readonly jumpLeavesGround: boolean;
    readonly landingReturnsToGround: boolean;
    readonly collectiblesBanked: boolean;
    readonly checkpointsActivated: boolean;
    readonly sustainsMinimumDuration: boolean;
    readonly completionFallsInsideTargetWindow: boolean;
    readonly resetReturnsToStart: boolean;
  };
}

/**
 * The route's level, from its single owning module.
 *
 * This used to construct the level itself from `gameGeometryContract`, which meant
 * retuning the jump in `main.ts` left this proof running the old floaty tuning. Sharing
 * one definition is what makes this proof about the level the route actually ships.
 */
const createProofLevel = createSkylineLevel;

/**
 * Runs the level for the full 120-second proof window and reports only observed values.
 *
 * The input policy is deterministic and deliberately simple: run right, and jump when grounded and
 * either blocked or approaching a gap. Because it is competent but not optimal it produces real
 * traversal, real airtime, and real collection rather than a scripted ideal path.
 */
export function createSixtySecondLevelProof(): SkylineLevelProof {
  const run = simulate();
  const confirm = simulate();

  const deterministic =
    run.maxTraversalX === confirm.maxTraversalX &&
    run.jumpsLaunched === confirm.jumpsLaunched &&
    run.collectedCount === confirm.collectedCount &&
    run.framesPlayable === confirm.framesPlayable &&
    run.finishFrame === confirm.finishFrame;

  return {
    simulation: "apps/showcase-skyline-runner/src/level-proof.ts",
    provesMountedKitPlayback: false,
    simulatedSeconds: Number((LEVEL_PROOF_FRAMES * STEP_SECONDS).toFixed(3)),
    frames: LEVEL_PROOF_FRAMES,
    deterministic,
    minimumPlayableSeconds: SKYLINE_MIN_PLAYABLE_SECONDS,
    authoredPlayableSeconds: SKYLINE_AUTHORED_PLAYABLE_SECONDS,
    metrics: {
      framesPlayable: run.framesPlayable,
      secondsPlayable: Number((run.framesPlayable * STEP_SECONDS).toFixed(3)),
      maxTraversalX: run.maxTraversalX,
      jumpsLaunched: run.jumpsLaunched,
      groundedFrames: run.groundedFrames,
      airborneFrames: run.airborneFrames,
      collectedCount: run.collectedCount,
      activatedCheckpointCount: run.activatedCheckpointCount,
      deaths: run.deaths,
      finalScore: run.finalScore,
      finalStatus: run.finalStatus,
      finishFrame: run.finishFrame >= 0 ? run.finishFrame : null
    },
    mechanics: {
      movementAdvancesTraversal: run.maxTraversalX > 1,
      jumpLeavesGround: run.jumpsLaunched > 0 && run.airborneFrames > 0,
      // Airtime must end: a hero that leaves the ground and never returns is falling, not jumping.
      landingReturnsToGround: run.landedAfterJump,
      collectiblesBanked: run.collectedCount > 0,
      checkpointsActivated: run.activatedCheckpointCount > 0,
      // Measured, not assumed: the level must remain playable for at least the extended floor,
      // either by still running at that mark or by being completed after it.
      sustainsMinimumDuration: run.framesPlayable * STEP_SECONDS >= SKYLINE_MIN_PLAYABLE_SECONDS,
      completionFallsInsideTargetWindow:
        run.finishFrame >= SKYLINE_MIN_PLAYABLE_SECONDS / STEP_SECONDS
        && run.finishFrame <= SKYLINE_MAX_TARGET_PLAYABLE_SECONDS / STEP_SECONDS,
      resetReturnsToStart: run.resetStatus === "playing" && run.resetScore === 0
    }
  };
}

function simulate() {
  const level = createProofLevel();
  const platformer = game.platformer(level);
  const platforms = [...(level.platforms ?? [])].sort((left, right) => left.x - right.x);
  const hazards = [...(level.hazards ?? [])].sort((left, right) => left.x - right.x);

  let snapshot = platformer.snapshot();
  const startX = snapshot.player.x;
  let maxTraversalX = 0;
  let jumpsLaunched = 0;
  let groundedFrames = 0;
  let airborneFrames = 0;
  let framesPlayable = 0;
  let finishFrame = -1;
  let landedAfterJump = false;
  let sawAirborne = false;
  let jumpCooldown = 0;

  for (let frame = 0; frame < LEVEL_PROOF_FRAMES; frame += 1) {
    // Use the shipped platform geometry to jump near an edge or into a rising step. The former fixed
    // cadence happened to miss the bridge into district two on every retry and therefore proved only
    // the first 15 units of a 66-unit course. This policy is still deterministic, but it demonstrates
    // that an ordinary forward player can traverse the actual section joins.
    const currentSurfaceIndex = platforms.findIndex((surface) => {
      const top = surface.y + surface.height;
      return snapshot.player.x >= surface.x - 0.04
        && snapshot.player.x <= surface.x + surface.width + 0.04
        && Math.abs(snapshot.player.y - top) <= 0.08;
    });
    const currentSurface = platforms[currentSurfaceIndex];
    const nextSurface = currentSurfaceIndex >= 0 ? platforms[currentSurfaceIndex + 1] : undefined;
    const edgeDistance = currentSurface
      ? currentSurface.x + currentSurface.width - snapshot.player.x <= 0.38
      : false;
    const nextGap = currentSurface && nextSurface
      ? nextSurface.x - (currentSurface.x + currentSurface.width)
      : 0;
    const risingStep = currentSurface && nextSurface
      ? nextSurface.y + nextSurface.height > currentSurface.y + currentSurface.height + 0.08
      : false;
    const upcomingHazard = hazards.find((hazard) => {
      const distance = hazard.x - snapshot.player.x;
      // At 1.1 units/second the 0.32-second jump apex lands roughly 0.35 units
      // after launch. Triggering farther away puts the hero back below the
      // sentry collider by the time their horizontal bounds overlap.
      return distance >= 0 && distance <= 0.28;
    });
    const routeJump = edgeDistance && (nextGap > 0.05 || risingStep);
    const wantJump = snapshot.player.grounded && (
      Boolean(upcomingHazard) ||
      (jumpCooldown <= 0 && (routeJump || currentSurfaceIndex < 0))
    );
    jumpCooldown = wantJump ? 18 : jumpCooldown - 1;

    snapshot = platformer.step(STEP_SECONDS, {
      // The duration proof now runs straight toward the finish. The former proof reversed direction
      // to pad a 13.8-second strip to 30 seconds; that measured the input policy, not the level.
      moveX: 1,
      jumpPressed: wantJump,
      jumpHeld: wantJump || jumpCooldown > 84
    });

    if (wantJump) jumpsLaunched += 1;
    // Completed/failed snapshots are frozen terminal states, not locomotion frames. Counting the
    // remainder of the proof window as airborne made the grounding ratio depend on how
    // early a course finished rather than on the traversal itself.
    if (snapshot.status === "playing") {
      if (snapshot.player.grounded) {
        groundedFrames += 1;
        if (sawAirborne) landedAfterJump = true;
      } else {
        airborneFrames += 1;
        sawAirborne = true;
      }
    }

    maxTraversalX = Math.max(maxTraversalX, snapshot.player.x - startX);
    if (snapshot.status === "playing") framesPlayable += 1;
    if (snapshot.status !== "playing" && finishFrame < 0) finishFrame = frame;
  }

  const collected = Array.isArray(snapshot.collected) ? snapshot.collected.length : 0;
  const activatedCheckpoints = Array.isArray(snapshot.activatedCheckpoints)
    ? snapshot.activatedCheckpoints.length
    : 0;
  const resetSnapshot = platformer.reset();

  return {
    framesPlayable,
    maxTraversalX: Number(maxTraversalX.toFixed(6)),
    jumpsLaunched,
    groundedFrames,
    airborneFrames,
    landedAfterJump,
    collectedCount: collected,
    activatedCheckpointCount: activatedCheckpoints,
    deaths: snapshot.deaths,
    finalScore: snapshot.score,
    finalStatus: snapshot.status,
    finishFrame,
    resetStatus: resetSnapshot.status,
    resetScore: resetSnapshot.score
  };
}
