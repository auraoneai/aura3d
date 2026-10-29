/**
 * What the renderer reads of one simulation step, for createFixedStepPresenter (audit C14, lessons M1): drawing
 * between the last two steps keeps a 60 Hz simulation smooth on 120 and 144 Hz displays.
 * Layout: player [progress, x, y, roll, pitch, yaw], rivals [progress, x, y] per rival.
 */
import type { RaceState } from "./sim";

export interface Shown {
  readonly player: Float64Array;
  readonly rivals: Float64Array;
}

/** A step that moves an entity further than this is a respawn or setback: show the new state, never smear. */
export const SNAP_DISTANCE = 30;

export function createShown(rivalCount: number): Shown {
  return { player: new Float64Array(6), rivals: new Float64Array(rivalCount * 3) };
}

export function writeShown(race: RaceState, out: Shown): Shown {
  const p = race.player;
  out.player[0] = p.progress; out.player[1] = p.x; out.player[2] = p.y;
  out.player[3] = p.roll; out.player[4] = p.pitch; out.player[5] = p.yaw;
  for (let i = 0; i < race.rivals.length && i * 3 < out.rivals.length; i += 1) {
    const r = race.rivals[i]!;
    out.rivals[i * 3] = r.progress; out.rivals[i * 3 + 1] = r.x; out.rivals[i * 3 + 2] = r.y;
  }
  return out;
}

let blendOut: Shown = createShown(0);

/** Blend into one reused buffer: the presenter calls this once per drawn frame. */
export function blendShown(a: Shown, b: Shown, t: number): Shown {
  if (a.rivals.length !== b.rivals.length || Math.abs(b.player[0]! - a.player[0]!) > SNAP_DISTANCE) return b;
  if (blendOut.rivals.length !== b.rivals.length) blendOut = createShown(b.rivals.length / 3);
  const out = blendOut;
  for (let i = 0; i < 6; i += 1) out.player[i] = a.player[i]! + (b.player[i]! - a.player[i]!) * t;
  for (let i = 0; i < b.rivals.length; i += 3) {
    const snap = Math.abs(b.rivals[i]! - a.rivals[i]!) > SNAP_DISTANCE;
    for (let k = 0; k < 3; k += 1) out.rivals[i + k] = snap ? b.rivals[i + k]! : a.rivals[i + k]! + (b.rivals[i + k]! - a.rivals[i + k]!) * t;
  }
  return out;
}
