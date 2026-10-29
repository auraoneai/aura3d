import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { Run } from "./sim";

/** What the renderer reads of one simulation step that moves continuously: the car, its attitude and the traffic. */
export interface Shown {
  s: number;
  l: number;
  h: number;
  v: number;
  roll: number;
  spin: number;
  flip: number;
  theta: number;
  traffic: { s: number; l: number }[];
}

/** A step moves the car a fraction of a metre; a checkpoint respawn or restart jumps further and must not smear. */
export const SNAP_DISTANCE = 20;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function shownOf(run: Pick<Run, "s" | "l" | "h" | "v" | "roll" | "spin" | "flip" | "theta" | "traffic">): Shown {
  return {
    s: run.s, l: run.l, h: run.h, v: run.v, roll: run.roll, spin: run.spin, flip: run.flip, theta: run.theta,
    traffic: run.traffic.map((c) => ({ s: c.s, l: c.l }))
  };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  if (Math.abs(b.s - a.s) > SNAP_DISTANCE) return b;
  return {
    s: mix(a.s, b.s, t), l: mix(a.l, b.l, t), h: mix(a.h, b.h, t), v: mix(a.v, b.v, t), roll: mix(a.roll, b.roll, t),
    spin: mix(a.spin, b.spin, t), flip: mix(a.flip, b.flip, t), theta: mix(a.theta, b.theta, t),
    traffic: a.traffic.length === b.traffic.length
      ? b.traffic.map((c, i) => (Math.abs(c.s - a.traffic[i]!.s) > SNAP_DISTANCE ? c : { s: mix(a.traffic[i]!.s, c.s, t), l: mix(a.traffic[i]!.l, c.l, t) }))
      : b.traffic
  };
}

/**
 * The run the world runtime reads, with the presented pose in place of the latest step (the real run is untouched). Pass
 * the previous view as `out` to reuse it and its traffic objects (the game renders one view per frame; audit C14).
 */
export function viewOf(run: Run, shown: Shown, out?: Run): Run {
  const previous = out?.traffic;
  const view = Object.assign(out ?? ({} as Run), run);
  view.s = shown.s; view.l = shown.l; view.h = shown.h; view.v = shown.v; view.roll = shown.roll; view.spin = shown.spin; view.flip = shown.flip; view.theta = shown.theta;
  const traffic = previous && previous !== run.traffic && previous.length === run.traffic.length ? previous : run.traffic.map((c) => ({ ...c }));
  for (let i = 0; i < run.traffic.length; i++) {
    const t = Object.assign(traffic[i]!, run.traffic[i]!);
    const p = shown.traffic[i];
    if (p) { t.s = p.s; t.l = p.l; }
  }
  view.traffic = traffic;
  return view;
}

export function createRoadsterPresenter(getRun: () => Run): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getRun()), blend: blendShown });
}
