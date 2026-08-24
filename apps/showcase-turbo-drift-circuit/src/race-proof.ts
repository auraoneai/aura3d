import { game } from "@aura3d/engine";
import { gameGeometryContract } from "./generated/game-geometry";
import { createTurboOpponentAi } from "./opponent-ai";

/**
 * Deterministic 60-second race proof for FS-102.
 *
 * FS-102 requires the race to last at least 30 seconds and to retain a 60-second playable review
 * run. A screenshot cannot show duration and a mounted browser session cannot be replayed
 * deterministically, so the duration claim is proven by simulating the *public* `game.racing` kit
 * with the route's own certified configuration and recording what actually happens.
 *
 * This mirrors `createSixtySecondReplayProof()` in the Blockfall route, and it carries the same
 * honesty boundary: the sequence is planned against the kit directly, so it proves the kit sustains
 * a 60-second race under the route's configuration. It is not a claim about mounted browser
 * playback, which is covered separately by the gameplay-proof browser suite.
 */

/** 60 seconds at 60 Hz. */
export const RACE_PROOF_FRAMES = 3600;
const STEP_SECONDS = 1 / 60;

const routeGeometry = gameGeometryContract.route;

/**
 * Proportional gain for steering back to the racing line.
 *
 * Derived from the route's own width rather than hardcoded: the correction has to reach
 * full lock by roughly half a lane of error, so the gain scales as 1/halfWidth. A fixed
 * gain tuned for a wide kart circuit (2.2 at width 1.79) under-corrects by ~5x on a
 * narrow real circuit and pins the car against the track edge for the whole run.
 */
const STEER_CORRECTION_GAIN = 2 / Math.max(0.05, routeGeometry.width / 2);

/**
 * Must match the mounted route's derived steer rate. See the note in `main.ts`: the
 * circuit's tightest corner radius sets a floor on yaw authority, and below it the car
 * cannot complete a lap at all.
 */
const CERTIFIED_STEER_RATE = (() => {
  const points = routeGeometry.points;
  let tightest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    let turn = Math.atan2(next.y - current.y, next.x - current.x)
      - Math.atan2(current.y - previous.y, current.x - previous.x);
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) < 1e-6) continue;
    const radius = ((incoming + outgoing) / 2) / Math.abs(turn);
    if (radius < tightest) tightest = radius;
  }
  const radius = Number.isFinite(tightest) ? tightest : 1;
  const maxSpeed = gameGeometryContract.speedModel.gameUnitsPerSecond * 4;
  return Number(Math.max(2.7, (maxSpeed / (radius * 1.28)) * 0.75).toFixed(3));
})();

/** Rebuilds the exact racing configuration the mounted route uses. */
function createProofRoute() {
  return game.assetBoundRacingRoute({
    vehicleAsset: "showcaseTexturedSportsCar",
    trackAsset: "showcaseTsukubaCircuit",
    authoredLapSeconds: gameGeometryContract.authoredSeconds,
    minLapSeconds: 30,
    minCheckpoints: 6,
    topology: gameGeometryContract.topology,
    route: {
      id: routeGeometry.id,
      width: routeGeometry.width,
      points: routeGeometry.points,
      checkpoints: routeGeometry.checkpoints
    }
  });
}

export interface TurboRaceProof {
  readonly simulation: string;
  /** Explicitly false: this is a kit simulation, not mounted browser playback. */
  readonly provesMountedKitPlayback: false;
  readonly simulatedSeconds: number;
  readonly frames: number;
  readonly deterministic: boolean;
  readonly minimumRaceSeconds: number;
  readonly metrics: {
    readonly checkpointsCredited: number;
    readonly lapsCompleted: number;
    readonly maxSpeed: number;
    readonly maxDrift: number;
    readonly framesAtSpeed: number;
    readonly framesDrifting: number;
    readonly offTrackFrames: number;
    readonly opponentCheckpointsCredited: number;
    readonly finalPlayerProgress: number;
    readonly finalOpponentProgress: number;
    /** Seconds at which the race actually finished, or null if it was still running at 60s. */
    readonly raceSecondsToFinish: number | null;
    readonly finalStatus: string;
  };
  readonly mechanics: {
    readonly throttleAccelerates: boolean;
    readonly steeringChangesHeading: boolean;
    readonly handbrakeBuildsDrift: boolean;
    readonly orderedCheckpointsCredited: boolean;
    readonly completesMinimumDuration: boolean;
    readonly opponentAdvancesIndependently: boolean;
    readonly resetReturnsToStart: boolean;
  };
  /**
   * Additive TDC-A1 fields. The headless kit simulation drives no ghost car, so it
   * reports that honestly rather than inventing a replay; mounted-route ghost state
   * lives on the route evidence object under `ghost`.
   */
  readonly ghostActive: false;
  readonly ghostLapMs: null;
}

/**
 * Simulates a full 60-second race and reports only what was observed.
 *
 * The driving policy is deliberately simple and deterministic: hold throttle, steer toward the next
 * checkpoint, and pulse the handbrake on the tightest heading errors. Because it is competent but
 * not optimal, the run produces real checkpoint progression, real slip, and real speed variation
 * rather than a scripted ideal line.
 */
export function createSixtySecondRaceProof(): TurboRaceProof {
  const run = simulate();
  // Re-run from a fresh state: identical results prove the simulation is deterministic, so the
  // recorded metrics are reproducible rather than a single lucky sample.
  const confirm = simulate();

  const deterministic =
    run.checkpointsCredited === confirm.checkpointsCredited &&
    run.lapsCompleted === confirm.lapsCompleted &&
    run.maxSpeed === confirm.maxSpeed &&
    run.finalProgress === confirm.finalProgress &&
    run.finishFrame === confirm.finishFrame;

  const resetSnapshot = run.resetSnapshot;

  return {
    simulation: "apps/showcase-turbo-drift-circuit/src/race-proof.ts",
    provesMountedKitPlayback: false,
    simulatedSeconds: Number((RACE_PROOF_FRAMES * STEP_SECONDS).toFixed(3)),
    frames: RACE_PROOF_FRAMES,
    deterministic,
    minimumRaceSeconds: 30,
    metrics: {
      checkpointsCredited: run.checkpointsCredited,
      lapsCompleted: Math.max(0, run.lapsCompleted - 1),
      maxSpeed: run.maxSpeed,
      maxDrift: run.maxDrift,
      framesAtSpeed: run.framesAtSpeed,
      framesDrifting: run.framesDrifting,
      offTrackFrames: run.offTrackFrames,
      opponentCheckpointsCredited: run.opponentCheckpointsCredited,
      finalPlayerProgress: run.finalProgress,
      finalOpponentProgress: run.finalOpponentProgress,
      raceSecondsToFinish: run.finishFrame >= 0 ? Number((run.finishFrame * STEP_SECONDS).toFixed(3)) : null,
      finalStatus: run.finalStatus
    },
    mechanics: {
      throttleAccelerates: run.maxSpeed > 0,
      steeringChangesHeading: run.headingChanged,
      handbrakeBuildsDrift: run.maxDrift > 0.12,
      orderedCheckpointsCredited: run.checkpointsCredited > 0 && run.checkpointOrderHeld,
      // Measured, not assumed: the race must actually be *raceable* for at least 30 seconds.
      // Either it was still running at the 30-second mark, or it finished after that mark.
      completesMinimumDuration: run.finishFrame < 0 || run.finishFrame * STEP_SECONDS >= 30,
      opponentAdvancesIndependently:
        run.opponentCheckpointsCredited > 0 && run.finalOpponentProgress !== run.finalProgress,
      resetReturnsToStart: resetSnapshot.lap === 1 && resetSnapshot.speed === 0 && resetSnapshot.progress === 0
    },
    // Additive TDC-A1 fields. The headless kit simulation drives no ghost car, so it
    // reports that honestly rather than inventing a replay; mounted-route ghost state
    // lives on the route evidence object under `ghost`.
    ghostActive: false as const,
    ghostLapMs: null as null
  };
}

function simulate() {
  const route = createProofRoute();
  const config = {
    route,
    startProgress: 0,
    checkpointRadius: 0.1,
    // Must match the mounted route. Tsukuba's authored lap is 35 s, so at pace 4 three
    // laps would finish at ~26 s, under the 30 s category floor; the route races 4.
    lapsToWin: 4,
    paceMultiplier: 4,
    acceleration: Number((route.assetBinding.speedModel.certifiedSpeed * 4 * 4.1).toFixed(3)),
    drag: 0.28,
    steerRate: CERTIFIED_STEER_RATE
  } as const;

  const racingState = game.racing(config);
  const opponentStartProgress = 0.12;
  const opponentState = game.racing({ ...config, startProgress: opponentStartProgress });
  const opponentAi = createTurboOpponentAi(opponentState, {
    startProgress: opponentStartProgress,
    maxSpeed: route.assetBinding.speedModel.certifiedSpeed * 4,
    cruiseRatio: 0.79,
    catchUpStrength: 0.22,
    steeringGain: STEER_CORRECTION_GAIN
  });

  let snapshot = racingState.snapshot();
  const startHeading = snapshot.heading;
  let maxSpeed = 0;
  let maxDrift = 0;
  let framesAtSpeed = 0;
  let framesDrifting = 0;
  let offTrackFrames = 0;
  let checkpointsCredited = 0;
  let lapsCompleted = 0;
  let headingChanged = false;
  let checkpointOrderHeld = true;
  let finishFrame = -1;
  let previousLap = snapshot.lap;
  let previousCheckpoint = snapshot.checkpoint;
  const checkpointCount = Math.max(1, routeGeometry.checkpoints.length);
  // Count the opponent's gates cumulatively. `checkpoint` is the gate index *within the
  // current lap* and resets to 0 on each lap, so sampling it once at the end reports 0
  // for an opponent that just crossed the line — which reads as "the AI never moved".
  let opponentCheckpointsCredited = 0;
  let opponentPreviousLap = opponentAi.snapshot().lap;
  let opponentPreviousCheckpoint = opponentAi.snapshot().checkpoint;

  for (let frame = 0; frame < RACE_PROOF_FRAMES; frame += 1) {
    // Steer back toward the racing line using the kit's own `trackOffset`, and pulse the handbrake
    // when the car is fast and far off-line, which is when a real driver would slide it. Correcting
    // toward the centre is what keeps the car on the road, so `offTrack` reflects real driving
    // rather than a car that never steers.
    // Steer proportionally back toward the racing line using the *signed* offset. `trackOffset` is
    // an unsigned magnitude and cannot express which side of the line the car is on, so a
    // controller reading it has no way to correct and ends up pinned against the track edge.
    const steer = Math.max(-1, Math.min(1, -snapshot.signedTrackOffset * STEER_CORRECTION_GAIN));
    const drift = Math.abs(steer) > 0.6 && snapshot.speed > maxSpeed * 0.5;

    snapshot = racingState.step(STEP_SECONDS, { throttle: true, brake: false, drift, steer });
    // The AI's contract is step(dt, playerProgress); omitting the second argument leaves it
    // with an undefined gap and it never accelerates.
    const opponentSample = opponentAi.step(STEP_SECONDS, snapshot.progress);
    if (opponentSample.lap !== opponentPreviousLap) {
      opponentCheckpointsCredited += Math.max(0, checkpointCount - opponentPreviousCheckpoint);
      opponentPreviousCheckpoint = 0;
      opponentPreviousLap = opponentSample.lap;
    }
    if (opponentSample.checkpoint !== opponentPreviousCheckpoint) {
      opponentCheckpointsCredited += Math.max(0, opponentSample.checkpoint - opponentPreviousCheckpoint);
      opponentPreviousCheckpoint = opponentSample.checkpoint;
    }

    maxSpeed = Math.max(maxSpeed, snapshot.speed);
    maxDrift = Math.max(maxDrift, Math.abs(snapshot.drift));
    if (snapshot.speed > 0.5) framesAtSpeed += 1;
    if (Math.abs(snapshot.drift) > 0.12) framesDrifting += 1;
    if (snapshot.offTrack === true) offTrackFrames += 1;
    if (snapshot.heading !== startHeading) headingChanged = true;

    // `checkpoint` counts gates within the current lap and resets to 0 when a lap completes, so
    // ordered progression means it either advances by exactly one or resets at a lap boundary.
    // Treating it as a globally monotonic counter reports false ordering violations at every lap.
    if (snapshot.checkpoint !== previousCheckpoint) {
      const advancedByOne = snapshot.checkpoint === previousCheckpoint + 1;
      const lapReset = snapshot.checkpoint === 0 && snapshot.lap > previousLap;
      if (!advancedByOne && !lapReset) checkpointOrderHeld = false;
      checkpointsCredited += 1;
      previousCheckpoint = snapshot.checkpoint;
    }
    previousLap = snapshot.lap;
    lapsCompleted = Math.max(lapsCompleted, snapshot.lap);
    if (snapshot.status === "finished" && finishFrame < 0) finishFrame = frame;
  }

  const finalProgress = Number(snapshot.progress.toFixed(6));
  const opponentSnapshot = opponentAi.snapshot();
  const resetSnapshot = racingState.reset(0);

  return {
    checkpointsCredited,
    lapsCompleted,
    maxSpeed: Number(maxSpeed.toFixed(6)),
    maxDrift: Number(maxDrift.toFixed(6)),
    framesAtSpeed,
    framesDrifting,
    offTrackFrames,
    headingChanged,
    checkpointOrderHeld,
    finalProgress,
    finishFrame,
    finalStatus: snapshot.status,
    opponentCheckpointsCredited,
    finalOpponentProgress: Number(opponentSnapshot.progress.toFixed(6)),
    resetSnapshot
  };
}
