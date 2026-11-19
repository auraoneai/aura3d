import { model } from "@aura3d/engine";
import { assets } from "./aura-assets.route";

/**
 * Idol wow pass: sidewalk walkers. Grid Dispatch's only person used to be the kerbside fare, visible during a pickup;
 * now 12 rigged Idol pedestrians (four San Francisco adults, gdWalkerA-D, playing their `walk` / `idle` clips) stroll the
 * sidewalks either side of the avenue, recycled in a 135 m window around the car. Render only: positions are a pure
 * function of the presentation clock and the car's world z; the sim, collision and replays never read them. They keep
 * to x = +-14.0 / +-15.6 m (between the street trees at 12.2 m and the building fronts at 19.5 m), so none steps onto
 * the carriageway.
 */
export const WALKER_KEYS = ["gdWalkerA", "gdWalkerB", "gdWalkerC", "gdWalkerD"] as const;
/** `<key>.idol.json` normalized.sceneScale (rigged Idol GLBs are 1 m tall and unscaled). */
export const WALKER_SCENE_SCALE: Readonly<Record<(typeof WALKER_KEYS)[number], number>> = { gdWalkerA: 1.78, gdWalkerB: 1.659, gdWalkerC: 1.701, gdWalkerD: 1.741 };
/** Literal references so `assets typegen --route` ships these four GLBs with this app. */
const WALKER_ASSET = { gdWalkerA: assets.gdWalkerA, gdWalkerB: assets.gdWalkerB, gdWalkerC: assets.gdWalkerC, gdWalkerD: assets.gdWalkerD } as const;
export const WALKER_POOL = 12;
export const WALKER_CLIPS = { walk: "walk", idle: "idle" } as const;
export const walkerNodeId = (slot: number): string => `sf-walker-${slot}`;
/** Feet on the sidewalk slab top (the kerbside fare stands at the same height). */
export { SIDEWALK_TOP_Y as SIDEWALK_Y } from "./art/idolModels";
/** Recycling window in world z around the car: from 120 m ahead to 15 m behind. */
export const WALKER_WINDOW: readonly [number, number] = [-120, 15];

interface Walker {
  readonly x: number;
  readonly dir: 1 | -1;
  readonly speed: number;
  readonly phase: number;
  readonly idle: boolean;
  readonly variant: number;
}

const frac = (v: number): number => v - Math.floor(v);
const hash = (k: number): number => frac(Math.sin(k * 127.1 + 3.7) * 43758.5453);

export const WALKERS: readonly Walker[] = Array.from({ length: WALKER_POOL }, (_, i) => {
  const side = i % 2 === 0 ? 1 : -1;
  return {
    x: side * (i % 4 < 2 ? 14.0 : 15.6),
    dir: (i % 3 === 0 ? 1 : -1) as 1 | -1,
    speed: 1.15 + hash(i * 3.1) * 0.3,
    phase: hash(i * 7.7),
    idle: i % 6 === 5,
    variant: i % WALKER_KEYS.length
  };
});

export interface WalkerPose {
  /** Sim-world x / z (the caller maps them through rx / rz like every other street object). */
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly clip: (typeof WALKER_CLIPS)[keyof typeof WALKER_CLIPS];
}

/** Pose of walker `w` at presentation time `t` with the car at world z `carZ`. */
export function walkerPose(w: Walker, t: number, carZ: number): WalkerPose {
  const span = WALKER_WINDOW[1] - WALKER_WINDOW[0];
  const travel = w.idle ? 0 : w.dir * w.speed * t;
  const zw = w.phase * span + travel;
  const hi = carZ + WALKER_WINDOW[1];
  const z = hi - (((hi - zw) % span) + span) % span;
  const yaw = w.idle ? (w.x > 0 ? -Math.PI / 2 : Math.PI / 2) : w.dir > 0 ? 0 : Math.PI;
  return { x: w.x, z, yaw, clip: w.idle ? WALKER_CLIPS.idle : WALKER_CLIPS.walk };
}

export function walkerNodes() {
  return WALKERS.map((w, slot) => {
    const key = WALKER_KEYS[w.variant]!;
    const s = WALKER_SCENE_SCALE[key];
    return model(WALKER_ASSET[key], { name: walkerNodeId(slot), scaleMode: "world", scale: [s, s, s], position: [0, -50, 200 + slot], castShadow: true, receiveShadow: true })
      .runtime({ id: walkerNodeId(slot) });
  });
}
