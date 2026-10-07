/**
 * Siege Golf deterministic 60-second replay proof (PRD DoD: ">=60s meaningful
 * play per hole demonstrated").
 *
 * A scripted stroke plan drives the real route simulation (`HoleFlow` over
 * `createHoleSimulation`) at the fixed 60 Hz step for at least 3600 simulated
 * frames. Every mechanic flag is derived from what actually happened in the
 * run - nothing is declared. The plan varies aim and power per stroke, so the
 * flags cannot pass on a single degenerate shot.
 *
 * Scope boundary (mirrors blockfall's contract): this replays the route's own
 * hole-flow module headlessly; mounted browser input is proven separately by
 * tests/browser/siege-golf-playable.spec.ts.
 */
import { SIEGE_GOLF_HOLES, type HoleDefinition } from "./course";
import { HoleFlow } from "./hole-flow";
import { hashString } from "./structures";

/** 60 seconds of meaningful play at the route's fixed 60 Hz step. */
export const REPLAY_PROOF_FRAMES = 3600;

export interface ReplayStrokePlan {
  readonly frame: number;
  readonly angle: number;
  readonly power: number;
}

/**
 * Stroke cadence: one resolved stroke roughly every 600 frames (10 s), with
 * alternating fine-aim offsets and varied powers so aim, charge variance, and
 * repeat sinks are exercised across the window. The opening stroke is the
 * verified hole-1 direct solution, ensuring every derived completion flag is
 * grounded in a legal player shot rather than a synthetic sensor mutation.
 */
export function createSixtySecondReplayPlan(): readonly ReplayStrokePlan[] {
  const plan: ReplayStrokePlan[] = [];
  const angles = [0, 0.06, -0.06, 0.03, -0.03, 0];
  const powers = [1.9, 1.25, 1.6, 2.2, 1.55, 0.9];
  for (let index = 0; index < 6; index += 1) {
    plan.push({
      frame: 120 + index * 600,
      angle: angles[index % angles.length]!,
      // 0.9..2.2 keeps every strike inside the ShotController clamp ceiling.
      power: powers[index]!
    });
  }
  return plan;
}

export interface SixtySecondReplayProof {
  readonly kind: "siege-golf-sixty-second-replay-proof";
  readonly replayName: "sixty-second-wrecking-green-demonstration";
  /** Scope: route-local HoleFlow simulation, not mounted browser playback. */
  readonly simulation: "apps/showcase-siege-golf/src/hole-flow.ts";
  readonly provesMountedKitPlayback: false;
  readonly holeId: string;
  readonly frames: number;
  readonly replayedSeconds: number;
  readonly meetsSixtySecondTarget: boolean;
  readonly eventCount: number;
  readonly lastEventFrame: number;
  readonly strokes: number;
  readonly deterministic: boolean;
  readonly finalChecksum: string;
  readonly secondFinalChecksum: string;
  readonly timelineChecksum: string;
  readonly mechanics: {
    readonly aimAdjust: boolean;
    readonly chargeVariance: boolean;
    readonly strike: boolean;
    readonly sensorFire: boolean;
    readonly targetDown: boolean;
    readonly targetSunk: boolean;
    readonly holeComplete: boolean;
    readonly reset: boolean;
    readonly hashProof: boolean;
  };
  readonly missingMechanics: readonly string[];
  readonly sensorEventCount: number;
  /** Peak sunk count observed during the window; reset restores it to zero. */
  readonly targetsSunkPeak: number;
  readonly targetsSunk: number;
  readonly resetHashMatch: boolean | null;
  readonly pass: boolean;
}

function checksumOfEvents(events: readonly string[]): string {
  return hashString(events.join("|"));
}

export function runSixtySecondReplay(hole: HoleDefinition = SIEGE_GOLF_HOLES[0]!, frames = REPLAY_PROOF_FRAMES): {
  proof: SixtySecondReplayProof;
} {
  const buildOnce = (): {
    finalChecksum: string;
    timelineChecksum: string;
    eventCount: number;
    lastEventFrame: number;
    strokes: number;
    sensorEventCount: number;
    targetsSunkPeak: number;
    targetsSunk: number;
    resetHashMatch: boolean | null;
    mechanics: SixtySecondReplayProof["mechanics"];
  } => {
    const flow = new HoleFlow(hole);
    // Mirror the route's boot: settle the stacking transient before aiming.
    flow.sim.stepFixed(30);
    let frame = 30;
    const eventsSeen: string[] = [];
    const plan = createSixtySecondReplayPlan();
    const usedAngles = new Set<number>();
    const usedPowers = new Set<number>();
    let lastEventFrame = 0;
    let sensorEventCount = 0;
    let targetsSunkPeak = 0;
    let resetHashMatch: boolean | null = null;

    while (frame < frames) {
      const due = plan.find((entry) => entry.frame === frame);
      if (due && flow.phase === "aiming") {
        // Fine aim: rotate to the planned offset before charging.
        flow.strike(
          [Math.sin(due.angle), -Math.cos(due.angle)],
          due.power
        );
        usedAngles.add(Number(due.angle.toFixed(3)));
        usedPowers.add(Number(due.power.toFixed(3)));
      }
      // Reset exactly once mid-window after a completed hole to prove the
      // byte-identical restore inside the same 60-second session.
      if (
        resetHashMatch === null
        && frame >= frames / 2
        && flow.phase === "hole-complete"
      ) {
        flow.resetHole();
        resetHashMatch = flow.resetHashMatch;
      }
      const events = flow.update(1);
      for (const event of events) {
        eventsSeen.push(event.type + "@" + frame);
        lastEventFrame = frame;
        if (event.type === "cup-flash") sensorEventCount += 1;
      }
      targetsSunkPeak = Math.max(targetsSunkPeak, flow.snapshot().targetsSunk);
      frame += 1;
    }

    const eventTypes = new Set(eventsSeen.map((entry) => entry.split("@")[0]!));
    const mechanics: SixtySecondReplayProof["mechanics"] = {
      aimAdjust: usedAngles.size > 1,
      chargeVariance: usedPowers.size > 1,
      strike: eventTypes.has("strike"),
      sensorFire: eventTypes.has("cup-flash"),
      targetDown: eventTypes.has("pin-down"),
      targetSunk: eventTypes.has("pin-sunk"),
      holeComplete: eventTypes.has("complete"),
      reset: resetHashMatch === true,
      hashProof: eventTypes.has("strike") && flow.lastShotHash.length === 8
    };
    return {
      finalChecksum: flow.sim.poseHash(),
      timelineChecksum: checksumOfEvents(eventsSeen),
      eventCount: eventsSeen.length,
      lastEventFrame,
      strokes: flow.strokes,
      sensorEventCount,
      targetsSunkPeak,
      targetsSunk: flow.snapshot().targetsSunk,
      resetHashMatch,
      mechanics
    };
  };

  const first = buildOnce();
  const second = buildOnce();

  const missingMechanics = Object.entries(first.mechanics)
    .filter(([, proven]) => !proven)
    .map(([name]) => name);
  const replayedSeconds = frames / 60;

  const proof: SixtySecondReplayProof = {
    kind: "siege-golf-sixty-second-replay-proof",
    replayName: "sixty-second-wrecking-green-demonstration",
    simulation: "apps/showcase-siege-golf/src/hole-flow.ts",
    provesMountedKitPlayback: false,
    holeId: hole.id,
    frames,
    replayedSeconds,
    meetsSixtySecondTarget: replayedSeconds >= 60,
    eventCount: first.eventCount,
    lastEventFrame: first.lastEventFrame,
    strokes: first.strokes,
    deterministic:
      first.finalChecksum === second.finalChecksum
      && first.timelineChecksum === second.timelineChecksum,
    finalChecksum: first.finalChecksum,
    secondFinalChecksum: second.finalChecksum,
    timelineChecksum: first.timelineChecksum,
    mechanics: first.mechanics,
    missingMechanics,
    sensorEventCount: first.sensorEventCount,
    targetsSunkPeak: first.targetsSunkPeak,
    targetsSunk: first.targetsSunk,
    resetHashMatch: first.resetHashMatch,
    pass:
      first.finalChecksum === second.finalChecksum
      && first.timelineChecksum === second.timelineChecksum
      && replayedSeconds >= 60
      && missingMechanics.length === 0
  };
  return { proof };
}
