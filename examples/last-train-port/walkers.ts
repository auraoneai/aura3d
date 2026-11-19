/**
 * Lamplight Line town walkers (Idol rigged townsfolk playing the GLB `walk` / `idle` clips). Render only: each walker is a
 * pure function of its town's station frame, a seeded layout and a presentation clock; the sim, timetable and replays
 * never read it. Walkers stroll on the station platform (lateral 3.9-4.9 m, the far side of the track from the tram's
 * body) and across the town plaza (lateral -5.4 to -7.4 m), so none crosses the track. The static instanced townsfolk stay
 * as the background crowd.
 *
 * Pass-through QA (owner 2026-11-18): the walkers' lanes (`WALKER_ZONES`, body width included) are kept free of every solid
 * set piece: the plaza lane runs between the static crowd by the track and the market stalls (lateral -8.5 to -11.5 m), the
 * platform lane stops short of the freight crates at +-12.5 m, and world.ts keeps the standing folk and bushes out of both.
 */
import { model } from "@aura3d/engine";
import { IDOL_ASSETS } from "../../apps/showcase-last-train-port/src/idol-assets";
import { sampleRoute, type SimData } from "./sim";

export const WALKER_KEYS = ["llWalkerA", "llWalkerB", "llWalkerC", "llWalkerD"] as const;
/** `<key>.idol.json` normalized.sceneScale (rigged Idol GLBs are 1 m tall and unscaled in the file). */
export const WALKER_SCENE_SCALE: Readonly<Record<(typeof WALKER_KEYS)[number], number>> = { llWalkerA: 1.763, llWalkerB: 1.7, llWalkerC: 1.719, llWalkerD: 1.637 };
export const WALKERS_PER_VARIANT = 4;
export const WALKER_POOL = WALKER_KEYS.length * WALKERS_PER_VARIANT;
export const WALKER_CLIPS = { walk: "walk", idle: "idle" } as const;
export const walkerNodeId = (slot: number): string => `walker-${slot}`;
/** Half the walking body's width (m): shoulders and swinging arms. */
export const WALKER_BODY_HALF = 0.35;
const PLATFORM_LANE = { lateral: [3.9, 4.9], half: 10.5 } as const;
const PLAZA_LANE = { lateral: [-7.4, -5.4], half: 24 } as const;
/** Ground swept by the walkers in a town's station frame (lateral, along), body width included. */
export const WALKER_ZONES: readonly { readonly lateral: readonly [number, number]; readonly along: readonly [number, number] }[] = [PLATFORM_LANE, PLAZA_LANE].map((l) => ({
  lateral: [l.lateral[0] - WALKER_BODY_HALF, l.lateral[1] + WALKER_BODY_HALF] as const,
  along: [-l.half - WALKER_BODY_HALF, l.half + WALKER_BODY_HALF] as const
}));
/** True when a footprint (centre lateral/along, half extents) overlaps a walker lane. */
export function intersectsWalkerZone(lateral: number, along: number, halfLateral: number, halfAlong = halfLateral): boolean {
  return WALKER_ZONES.some((z) => lateral + halfLateral > z.lateral[0] && lateral - halfLateral < z.lateral[1] && along + halfAlong > z.along[0] && along - halfAlong < z.along[1]);
}

type ModelRef = Parameters<typeof model>[0];
const REFS = IDOL_ASSETS as unknown as Readonly<Record<string, ModelRef | undefined>>;
/** True when all four walker GLBs are admitted (otherwise no walker nodes are mounted). */
export const walkersReady = (): boolean => WALKER_KEYS.every((k) => REFS[k] !== undefined);

export interface TownFrame {
  readonly o: readonly [number, number, number];
  /** Forward (along the track) and side (lateral) unit vectors in x/z. */
  readonly f: readonly [number, number];
  readonly s: readonly [number, number];
}

/** The same station frame world.ts uses to lay out each town (sampleRoute at the leg start, forward from 6 m ahead). */
export function townFrame(data: SimData, town: number): TownFrame {
  const s0 = sampleRoute(data.route, town, 0), s1 = sampleRoute(data.route, town, 6);
  let fx = s1.x - s0.x, fz = s1.z - s0.z;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl; fz /= fl;
  return { o: [s0.x, s0.y, s0.z], f: [fx, fz], s: [fz, -fx] };
}

interface Walker {
  readonly id: number;
  readonly lateral: number;
  readonly a0: number;
  readonly a1: number;
  /** Height above the station sample: platform top (+0.75) or plaza cobbles (-0.26), feet planted 3 cm in (grounding sweep). */
  readonly up: number;
  readonly phase: number;
  readonly speed: number;
  readonly idle: boolean;
  readonly variant: number;
}

const frac = (v: number): number => v - Math.floor(v);
const hash = (k: number): number => frac(Math.sin(k * 127.1 + 3.7) * 43758.5453);

/** 16 walkers per town: 6 on the platform, 10 on the plaza; about one in five idles. Slot k has variant floor(k / 4). */
export function townWalkers(town: number): Walker[] {
  return Array.from({ length: WALKER_POOL }, (_, k) => {
    const id = town * 100 + k;
    const r = (n: number) => hash(id * 1.618 + n * 7.31);
    const onPlatform = k % 8 < 3;
    const lane = onPlatform ? PLATFORM_LANE : PLAZA_LANE;
    const lateral = lane.lateral[0] + r(1) * (lane.lateral[1] - lane.lateral[0]);
    const half = lane.half;
    const a0 = -half + r(2) * 4, a1 = half - r(3) * 4;
    return { id, lateral, a0, a1, up: onPlatform ? 0.72 : -0.29, phase: r(4), speed: 1.1 + r(5) * 0.35, idle: r(6) < 0.2, variant: Math.floor(k / WALKERS_PER_VARIANT) };
  });
}

export interface WalkerPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly clip: (typeof WALKER_CLIPS)[keyof typeof WALKER_CLIPS];
  /** Distance along the walker's path (for tests). */
  readonly along: number;
}

/** Pose at presentation time `t`: ping-pong along the town's forward axis; idlers stand facing the track. */
export function walkerPose(frame: TownFrame, w: Walker, t: number): WalkerPose {
  const len = w.a1 - w.a0;
  let along: number, dir: number;
  if (w.idle) {
    along = w.a0 + w.phase * len;
    dir = 0;
  } else {
    const u = (w.phase * 2 * len + t * w.speed) % (2 * len);
    along = w.a0 + (u < len ? u : 2 * len - u);
    dir = u < len ? 1 : -1;
  }
  const x = frame.o[0] + frame.s[0] * w.lateral + frame.f[0] * along;
  const z = frame.o[2] + frame.s[1] * w.lateral + frame.f[1] * along;
  // the Idol GLB faces +Z at yaw 0: yaw = atan2(dx, dz) of the facing direction
  const face: readonly [number, number] = dir !== 0 ? [frame.f[0] * dir, frame.f[1] * dir] : [-frame.s[0] * Math.sign(w.lateral), -frame.s[1] * Math.sign(w.lateral)];
  return { x, y: frame.o[1] + w.up, z, yaw: Math.atan2(face[0], face[1]), clip: w.idle ? WALKER_CLIPS.idle : WALKER_CLIPS.walk, along };
}

/** Index of the town whose station is nearest to (x, z). */
export function nearestTown(frames: readonly TownFrame[], x: number, z: number): number {
  let best = 0, bd = Infinity;
  frames.forEach((f, i) => { const d = Math.hypot(f.o[0] - x, f.o[2] - z); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** The pooled walker model nodes (world scale = sceneScale), parked out of view until placed. */
export function walkerNodes() {
  return Array.from({ length: WALKER_POOL }, (_, slot) => {
    const key = WALKER_KEYS[Math.floor(slot / WALKERS_PER_VARIANT)]!;
    const s = WALKER_SCENE_SCALE[key];
    return model(REFS[key]!, { name: walkerNodeId(slot), scaleMode: "world", scale: [s, s, s], position: [0, -400, 0], castShadow: false, receiveShadow: true })
      .runtime({ id: walkerNodeId(slot) });
  });
}

type Handle = {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setVisible(v: boolean): unknown;
  /** Optional so test doubles without animation support still place walkers. */
  setAnimation?(a: { clip: string; loop: boolean; speed: number } | undefined): unknown;
};

/** Per-frame placement of the 16 walkers of the town nearest the tram; a clip is re-sent only when a slot's clip changes. */
export function placeWalkers(node: (id: string) => Handle, frames: readonly TownFrame[], x: number, z: number, t: number, clips: (string | null)[]): void {
  const town = nearestTown(frames, x, z);
  townWalkers(town).forEach((w, slot) => {
    const p = walkerPose(frames[town]!, w, t);
    const h = node(walkerNodeId(slot));
    h.setPosition(p.x, p.y, p.z);
    h.setRotation(0, p.yaw, 0);
    h.setVisible(true);
    if (clips[slot] !== p.clip) {
      clips[slot] = p.clip;
      h.setAnimation?.({ clip: p.clip, loop: true, speed: 1 });
    }
  });
}
