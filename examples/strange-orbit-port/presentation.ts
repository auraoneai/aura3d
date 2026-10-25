import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { RaceState } from "./race";
import { Vec3 } from "./vec3";

type V3 = readonly [number, number, number];

/** What the renderer reads of one simulation step that moves continuously. */
export interface Shown {
  s: number;
  lane: number;
  heading: number;
  lean: number;
  time: number;
  speed: number;
  air: { height: number; vy: number; age: number } | null;
  loopT: number | null;
  flight: { position: V3; forward: V3; up: V3; age: number } | null;
  rivals: { s: number; lane: number; lean: number; airHeight: number | null }[];
}

/** A step moves the rider a few metres at most; a restart, a re-entry or a lap reset jumps further and must not smear. */
export const SNAP_DISTANCE = 30;

const v3 = (v: Vec3): V3 => [v.x, v.y, v.z];
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixV = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

export function shownOf(race: RaceState): Shown {
  return {
    s: race.s, lane: race.lane, heading: race.heading || 0, lean: race.lean, time: race.time, speed: race.speed,
    air: race.air ? { height: race.air.height, vy: race.air.vy, age: race.air.age } : null,
    loopT: race.loop ? race.loop.t : null,
    flight: race.flight ? { position: v3(race.flight.position), forward: v3(race.flight.forward), up: v3(race.flight.up), age: race.flight.age } : null,
    rivals: race.rivals.map((r) => ({ s: r.s, lane: r.lane, lean: r.lean ?? 0, airHeight: r.air ? r.air.height : null }))
  };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  if (Math.abs(b.s - a.s) > SNAP_DISTANCE) return b;
  if (Boolean(a.flight) !== Boolean(b.flight) || Boolean(a.loopT !== null) !== Boolean(b.loopT !== null)) return b;
  return {
    s: mix(a.s, b.s, t), lane: mix(a.lane, b.lane, t), heading: mix(a.heading, b.heading, t), lean: mix(a.lean, b.lean, t),
    time: mix(a.time, b.time, t), speed: mix(a.speed, b.speed, t),
    air: a.air && b.air ? { height: mix(a.air.height, b.air.height, t), vy: mix(a.air.vy, b.air.vy, t), age: mix(a.air.age, b.air.age, t) } : b.air,
    loopT: a.loopT !== null && b.loopT !== null ? mix(a.loopT, b.loopT, t) : b.loopT,
    flight: a.flight && b.flight ? {
      position: mixV(a.flight.position, b.flight.position, t), forward: mixV(a.flight.forward, b.flight.forward, t),
      up: mixV(a.flight.up, b.flight.up, t), age: mix(a.flight.age, b.flight.age, t)
    } : b.flight,
    rivals: a.rivals.length === b.rivals.length
      ? b.rivals.map((r, i) => {
        const p = a.rivals[i]!;
        if (Math.abs(r.s - p.s) > SNAP_DISTANCE) return r;
        return { s: mix(p.s, r.s, t), lane: mix(p.lane, r.lane, t), lean: mix(p.lean, r.lean, t), airHeight: p.airHeight !== null && r.airHeight !== null ? mix(p.airHeight, r.airHeight, t) : r.airHeight };
      })
      : b.rivals
  };
}

/** The race the world runtime reads, with the presented poses in place of the latest step (the real race is untouched). */
export function viewOf(race: RaceState, shown: Shown): RaceState {
  return {
    ...race,
    s: shown.s, lane: shown.lane, heading: shown.heading, lean: shown.lean, time: shown.time, speed: shown.speed,
    air: race.air && shown.air ? { ...race.air, height: shown.air.height, vy: shown.air.vy, age: shown.air.age } : race.air,
    loop: race.loop && shown.loopT !== null ? { ...race.loop, t: shown.loopT } : race.loop,
    flight: race.flight && shown.flight
      ? {
        ...race.flight,
        position: new Vec3(...shown.flight.position), forward: new Vec3(...shown.flight.forward),
        up: new Vec3(...shown.flight.up), age: shown.flight.age
      }
      : race.flight,
    rivals: race.rivals.map((r, i) => {
      const m = shown.rivals[i];
      if (!m) return r;
      return { ...r, s: m.s, lane: m.lane, lean: m.lean, air: r.air && m.airHeight !== null ? { ...r.air, height: m.airHeight } : r.air };
    })
  };
}

export function createOrbitPresenter(getRace: () => RaceState): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getRace()), blend: blendShown });
}
