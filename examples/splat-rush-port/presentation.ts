import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { SplatRushSim } from "./sim";

/**
 * Splat Rush scrolls its world toward a fixed ball: the road, gates, power-ups and splatters advance by one shared
 * `move` per step. The ball, camera and clock interpolate between the last two steps; the scrolling entities are shown
 * stepped back by the part of the last step that has not elapsed yet (they are re-created at the far end, so matching
 * entities between steps by index would tear the road whenever a segment is recycled).
 */
export interface Shown {
  distance: number;
  elapsed: number;
  /** How far the world scrolled in the last step (a world-space distance), scaled by the unelapsed fraction. */
  back: number;
  player: { x: number; y: number; z: number; rotX: number; scale: number };
  camera: { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number };
}

/** A step scrolls the world a fraction of a unit; a restart jumps the distance back to zero and must not smear. */
export const SNAP_DISTANCE = 5;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function shownOf(sim: Pick<SplatRushSim, "o" | "elapsed" | "player" | "camera">): Shown {
  const { player: p, camera: c } = sim;
  return {
    distance: sim.o.distance, elapsed: sim.elapsed, back: 0,
    player: { x: p.x, y: p.y, z: p.z, rotX: p.rotX, scale: p.scale },
    camera: { x: c.x, y: c.y, z: c.z, lookX: c.lookX, lookY: c.lookY, lookZ: c.lookZ }
  };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const moved = b.distance - a.distance;
  if (moved < 0 || moved > SNAP_DISTANCE) return { ...b, back: 0 };
  const m = <T extends Record<string, number>>(x: T, y: T): T => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(y)) out[k] = mix(x[k]!, y[k]!, t);
    return out as T;
  };
  return {
    distance: b.distance, elapsed: mix(a.elapsed, b.elapsed, t), back: (1 - t) * moved,
    player: m(a.player, b.player), camera: m(a.camera, b.camera)
  };
}

/** The sim the world runtime reads, with the presented ball and camera and the scrolling entities stepped back (the real sim is untouched). */
export function viewOf(sim: SplatRushSim, shown: Shown): SplatRushSim {
  const back = shown.back;
  const shift = <T extends { z: number }>(list: readonly T[]): T[] => (back === 0 ? (list as T[]) : list.map((e) => ({ ...e, z: e.z - back })));
  return Object.create(sim, {
    o: { value: { ...sim.o, distance: sim.o.distance - back } },
    elapsed: { value: shown.elapsed },
    player: { value: { ...sim.player, ...shown.player } },
    camera: { value: { ...shown.camera } },
    segments: { value: shift(sim.segments) },
    gates: { value: shift(sim.gates) },
    powerups: { value: shift(sim.powerups) },
    splatters: { value: shift(sim.splatters) }
  }) as SplatRushSim;
}

export function createSplatPresenter(getSim: () => Pick<SplatRushSim, "o" | "elapsed" | "player" | "camera">): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getSim()), blend: blendShown });
}

/**
 * C8 reduced motion: the sim's chase camera without the shake. It follows the same target with the same 0.1-per-step
 * lerp (sim.ts `frame`), so it matches the sim camera exactly whenever no shake is running, and the sim is never touched.
 */
export class SteadyCamera {
  prev: Shown["camera"];
  cur: Shown["camera"];
  constructor(sim: Pick<SplatRushSim, "camera">) {
    this.cur = { ...sim.camera };
    this.prev = { ...sim.camera };
  }
  reset(sim: Pick<SplatRushSim, "camera">): void {
    this.cur = { ...sim.camera };
    this.prev = { ...sim.camera };
  }
  /** Call once after every sim step. */
  step(sim: Pick<SplatRushSim, "o" | "player">): void {
    const ge = sim.player, e = Math.max(0, sim.o.introT / 2), e2 = e * e;
    const tx = 0.5 * ge.x, ty = ge.y + 5 + 9 * e2, tz = ge.z + 9 + 8 * e2;
    this.prev = this.cur;
    const c = this.cur;
    this.cur = { x: c.x + 0.1 * (tx - c.x), y: c.y + 0.1 * (ty - c.y), z: c.z + 0.1 * (tz - c.z), lookX: ge.x, lookY: ge.y, lookZ: ge.z - 10 };
  }
  /** The camera between the last two steps (`t` = the loop's blend factor, 1 = latest step). */
  at(t: number): Shown["camera"] {
    const a = this.prev, b = this.cur;
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), lookX: mix(a.lookX, b.lookX, t), lookY: mix(a.lookY, b.lookY, t), lookZ: mix(a.lookZ, b.lookZ, t) };
  }
}

/**
 * C2: the popups the HUD has not shown yet. The sim keeps only the last 64 popups and never clears the list, so a
 * reader that counts by index stalls for good once the list is full; reading by `seq` keeps working across restarts.
 */
export function drainPopups<T extends { readonly seq: number }>(list: readonly T[], nextSeq: number): { fresh: T[]; nextSeq: number } {
  const fresh: T[] = [];
  for (const p of list) if (p.seq >= nextSeq) fresh.push(p);
  return { fresh, nextSeq: fresh.length > 0 ? (fresh[fresh.length - 1] as T).seq + 1 : nextSeq };
}

/**
 * GU47 CR-AN1: the gate the ball just matched, read from values the sim already applied (presentation only). Mirrors the
 * sim's hit test (`|laneOffset - laneX| < 1.2` and colour or rainbow); lanes are 2.3 apart, so at most one gate of a row
 * qualifies outside the 0.05 overlap the sim resolves to the nearest gate.
 */
export function gateMatched(
  o: { readonly laneOffset: number; readonly playerColorIndex: number; readonly isRainbowActive: boolean },
  g: { readonly laneX: number; readonly colorIndex: number }
): boolean {
  return Math.abs(o.laneOffset - g.laneX) < 1.2 && (o.isRainbowActive || g.colorIndex === o.playerColorIndex);
}

/** CR-AN1 squash-and-splat of a matched gate: flattens and spreads over `seconds`, then `null` (the gate is gone). */
export function gateSquash(t: number, seconds: number): { sx: number; sy: number; sz: number } | null {
  if (!(seconds > 0) || t >= seconds) return null;
  const k = Math.max(0, t) / seconds, e = k * k * (3 - 2 * k);
  const spread = 1 + 0.45 * e;
  return { sx: spread, sy: Math.max(0.02, 1 - e), sz: spread };
}
