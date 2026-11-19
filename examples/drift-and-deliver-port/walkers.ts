/**
 * Gridlock Courier sidewalk walkers (Idol rigged people playing the GLB `walk` / `idle` clips). Render only: positions are
 * a pure function of a seeded layout and a presentation clock, never read by the sim, solids, replay or scoring. Walkers
 * stroll back and forth on the sidewalk band (6.6-7.6 m from a street centre line, outside both traffic lanes) between
 * two crossings, stopping 12 m short of each crossing, so they never step onto the carriageway the courier drives on.
 * The 456 static instanced pedestrians stay as the background crowd.
 */
import { model } from "@aura3d/engine";
import { IDOL_ASSETS as assets } from "../../apps/showcase-drift-and-deliver-port/src/idol-assets";
import { PITCH, STREET_LINES, noise } from "./world";

export const WALKER_KEYS = ["gcWalkerA", "gcWalkerB", "gcWalkerC", "gcWalkerD"] as const;
/** `<key>.idol.json` normalized.sceneScale: rigged Idol GLBs are 1 m tall and unscaled in the file. */
export const WALKER_SCENE_SCALE: Readonly<Record<(typeof WALKER_KEYS)[number], number>> = { gcWalkerA: 1.759, gcWalkerB: 1.66, gcWalkerC: 1.721, gcWalkerD: 1.684 };
/** Pooled nodes per variant (4 variants x 4 = 16 walkers on screen around the courier). */
export const WALKERS_PER_VARIANT = 4;
export const WALKER_POOL = WALKER_KEYS.length * WALKERS_PER_VARIANT;
export const WALKER_CLIPS = { walk: "walk", idle: "idle" } as const;
export const walkerNodeId = (slot: number): string => `walker-${slot}`;
/** Metres the walkers' feet sink below the flat sidewalk plane (y = 0). */
export const WALKER_SINK = 0.02;

/** Walking speed (m/s) and the sidewalk band; crossings sit at along = 30 (mod PITCH), kept 12 m clear like buildPedestrians. */
const SPEED = 1.25;
const CROSS_CLEAR = 12;
const BAND: readonly [number, number] = [6.6, 7.6];
/** Walkers defined per sidewalk segment (each side of each street, between two crossings). */
const PER_SEGMENT = 3;

export interface WalkerPose {
  readonly x: number;
  readonly z: number;
  /** Facing yaw (+Z at 0, the Idol GLB's forward). */
  readonly yaw: number;
  readonly clip: (typeof WALKER_CLIPS)[keyof typeof WALKER_CLIPS];
  readonly variant: number;
  readonly id: number;
}

interface Walker {
  readonly id: number;
  readonly onZ: boolean;
  readonly line: number;
  readonly lateral: number;
  readonly a0: number;
  readonly a1: number;
  readonly phase: number;
  readonly speed: number;
  readonly idle: boolean;
  readonly variant: number;
}

function walkerFor(lineIndex: number, onZ: boolean, side: number, segment: number, slot: number): Walker {
  const id = (((lineIndex * 2 + (onZ ? 1 : 0)) * 2 + (side > 0 ? 1 : 0)) * 64 + (segment + 32)) * PER_SEGMENT + slot;
  const r = (k: number) => noise(id * 1.618 + k * 7.31);
  const start = segment * PITCH + 30 + CROSS_CLEAR;
  const lane = slot % 2;
  return {
    id,
    onZ,
    line: STREET_LINES[lineIndex]!,
    lateral: side * (BAND[0] + lane * (BAND[1] - BAND[0]) + (r(1) - 0.5) * 0.2),
    a0: start,
    a1: start + PITCH - 2 * CROSS_CLEAR,
    phase: r(2),
    speed: SPEED * (0.85 + r(3) * 0.3),
    idle: r(4) < 0.22,
    variant: Math.floor(r(5) * WALKER_KEYS.length) % WALKER_KEYS.length
  };
}

/** Pose of one walker at presentation time `t` (ping-pong along its segment; idlers stand facing the street). */
export function walkerPose(w: Walker, t: number): WalkerPose {
  const len = w.a1 - w.a0;
  let along: number;
  let dir: number;
  if (w.idle) {
    along = w.a0 + w.phase * len;
    dir = 0;
  } else {
    const s = (w.phase * 2 * len + t * w.speed) % (2 * len);
    along = w.a0 + (s < len ? s : 2 * len - s);
    dir = s < len ? 1 : -1;
  }
  const x = w.onZ ? w.line + w.lateral : along;
  const z = w.onZ ? along : w.line + w.lateral;
  // walking: face the direction of travel along the street; idling: face the street centre line
  const yaw = dir !== 0
    ? (w.onZ ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2))
    : (w.onZ ? (w.lateral > 0 ? -Math.PI / 2 : Math.PI / 2) : (w.lateral > 0 ? Math.PI : 0));
  return { x, z, yaw, clip: w.idle ? WALKER_CLIPS.idle : WALKER_CLIPS.walk, variant: w.variant, id: w.id };
}

/** Walkers on the street segments around (cx, cz): the two nearest street lines in each axis, the segments either side. */
export function walkersNear(cx: number, cz: number): Walker[] {
  const out: Walker[] = [];
  const nearestLines = (v: number): number[] =>
    STREET_LINES.map((l, i) => [Math.abs(l - v), i] as const).sort((a, b) => a[0] - b[0]).slice(0, 2).map(([, i]) => i);
  for (const onZ of [true, false]) {
    const lines = nearestLines(onZ ? cx : cz);
    const alongNow = onZ ? cz : cx;
    const seg0 = Math.floor((alongNow - 30) / PITCH);
    for (const li of lines) for (const side of [-1, 1]) for (let seg = seg0 - 1; seg <= seg0 + 1; seg++) {
      for (let slot = 0; slot < PER_SEGMENT; slot++) out.push(walkerFor(li, onZ, side, seg, slot));
    }
  }
  return out;
}

/**
 * The walkers to show this frame: per variant, the WALKERS_PER_VARIANT nearest to (cx, cz). Slot k of the pool always
 * holds variant floor(k / WALKERS_PER_VARIANT). `null` entries hide their node.
 */
export function assignWalkers(cx: number, cz: number, t: number): (WalkerPose | null)[] {
  const poses = walkersNear(cx, cz).map((w) => walkerPose(w, t));
  const slots: (WalkerPose | null)[] = [];
  for (let v = 0; v < WALKER_KEYS.length; v++) {
    const mine = poses.filter((p) => p.variant === v).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz) || a.id - b.id);
    for (let k = 0; k < WALKERS_PER_VARIANT; k++) slots.push(mine[k] ?? null);
  }
  return slots;
}

/** The pooled walker model nodes (rigged Idol GLBs, world scale = sceneScale). */
export function walkerNodes() {
  return Array.from({ length: WALKER_POOL }, (_, slot) => {
    const key = WALKER_KEYS[Math.floor(slot / WALKERS_PER_VARIANT)]!;
    const s = WALKER_SCENE_SCALE[key];
    return model(assets[key] as typeof assets.gcWalkerA, { name: walkerNodeId(slot), scaleMode: "world", scale: [s, s, s], position: [0, -60, 0], castShadow: true, receiveShadow: true })
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

/** Per-frame placement; re-sends a clip only when a slot's clip changes (`clips` remembers what each slot plays). */
export function placeWalkers(node: (id: string) => Handle, cx: number, cz: number, t: number, clips: (string | null)[]): void {
  assignWalkers(cx, cz, t).forEach((p, slot) => {
    const h = node(walkerNodeId(slot));
    if (!p) {
      h.setVisible(false);
      clips[slot] = null;
      return;
    }
    // soles 2 cm into the sidewalk plane so the walk clip's planted foot never hovers
    h.setPosition(p.x, -WALKER_SINK, p.z);
    h.setRotation(0, p.yaw, 0);
    h.setVisible(true);
    if (clips[slot] !== p.clip) {
      clips[slot] = p.clip;
      h.setAnimation?.({ clip: p.clip, loop: true, speed: p.clip === WALKER_CLIPS.walk ? 1.05 : 1 });
    }
  });
}
