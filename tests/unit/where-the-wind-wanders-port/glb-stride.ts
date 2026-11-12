import { CLIP_SECONDS, type Gait } from "../../../examples/where-the-wind-wanders-port/locomotion";
import {
  computeBellkeeperFootWorld,
  measureBellkeeperRestBounds,
  sampleBellkeeperRigPose
} from "../../../examples/where-the-wind-wanders-port/art/proceduralModels";

export interface ClipStride {
  readonly duration: number;
  readonly stanceFootSpeed: number;
}

/**
 * Planted-foot speed per clip (world units per second at rate 1) evaluated by forward kinematics
 * of the procedural multi-material Bellkeeper Wanderer rig (`art/proceduralModels.ts`) — zero `.glb` files.
 */
export interface HeroRig {
  clips: Record<string, ClipStride>;
  meshHeight: number;
  minY: number;
  /** Foot and toe joint positions (hero root units) of a gait at `time` seconds. */
  footAt(
    clip: string,
    time: number
  ): {
    left: [number, number, number];
    right: [number, number, number];
    toeLeft: [number, number, number];
    toeRight: [number, number, number];
  };
}

const GAIT_NAMES: readonly Gait[] = ["Idle", "Walk", "Run"];

export function proceduralHeroStride(): HeroRig {
  const bounds = measureBellkeeperRestBounds();
  const footAt: HeroRig["footAt"] = (clip, time) => {
    const gait = (GAIT_NAMES.includes(clip as Gait) ? clip : "Idle") as Gait;
    const pose = sampleBellkeeperRigPose({ gait, phaseSeconds: time });
    const fk = computeBellkeeperFootWorld(pose);
    return {
      left: [...fk.left],
      right: [...fk.right],
      toeLeft: [...fk.toeLeft],
      toeRight: [...fk.toeRight]
    };
  };

  const clips: Record<string, ClipStride> = {};
  for (const name of GAIT_NAMES) {
    const duration = CLIP_SECONDS[name];
    if (name === "Idle") {
      clips[name] = { duration, stanceFootSpeed: 0 };
      continue;
    }
    const N = 120;
    const dt = duration / N;
    const samples = Array.from({ length: N + 1 }, (_, k) => {
      const f = footAt(name, (k / N) * duration);
      return [f.left, f.right] as const;
    });
    const speeds: number[] = [];
    for (let f = 0; f < 2; f++) {
      const ys = samples.map((p) => p[f]![1]);
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      const thr = lo + 0.25 * (hi - lo);
      for (let k = 0; k < N; k++) {
        if (ys[k]! <= thr && ys[k + 1]! <= thr) {
          speeds.push(Math.abs(samples[k + 1]![f]![2] - samples[k]![f]![2]) / dt);
        }
      }
    }
    speeds.sort((a, b) => a - b);
    clips[name] = {
      duration,
      stanceFootSpeed: speeds.length ? speeds[Math.floor(speeds.length / 2)]! : 0
    };
  }

  return {
    clips,
    meshHeight: bounds.height,
    minY: bounds.minY,
    footAt
  };
}

/** Backwards-compatible alias for procedural Bellkeeper forward-kinematics stride analysis (zero `.glb` files). */
export function glbStride(_unusedPath?: string): HeroRig {
  return proceduralHeroStride();
}
