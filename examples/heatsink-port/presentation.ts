import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { Race } from "./race";

/** What the renderer reads of one simulation step that moves continuously: the drone pose and the bolts in flight. */
export interface Shown {
  position: { x: number; y: number; z: number };
  s: number;
  theta: number;
  pitch: number;
  lean: number;
  v: number;
  bolts: { alive: boolean; x: number; y: number; z: number }[];
}

/** A step moves the drone a few metres at most; a respawn or restart jumps further and must not smear. */
export const SNAP_DISTANCE = 30;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function shownOf(race: Pick<Race, "player" | "ops">): Shown {
  const p = race.player;
  return {
    position: { x: p.position.x, y: p.position.y, z: p.position.z },
    s: p.s, theta: p.theta, pitch: p.pitch, lean: p.lean, v: p.v,
    bolts: race.ops.bolts.map((b) => ({ alive: b.alive, x: b.x, y: b.y, z: b.z }))
  };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const jump = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z);
  if (jump > SNAP_DISTANCE) return b;
  return {
    position: { x: mix(a.position.x, b.position.x, t), y: mix(a.position.y, b.position.y, t), z: mix(a.position.z, b.position.z, t) },
    s: mix(a.s, b.s, t), theta: mix(a.theta, b.theta, t), pitch: mix(a.pitch, b.pitch, t), lean: mix(a.lean, b.lean, t), v: mix(a.v, b.v, t),
    bolts: b.bolts.map((bolt, i) => {
      const prev = a.bolts[i];
      if (!prev || !prev.alive || !bolt.alive) return bolt;
      if (Math.hypot(bolt.x - prev.x, bolt.y - prev.y, bolt.z - prev.z) > SNAP_DISTANCE) return bolt;
      return { alive: true, x: mix(prev.x, bolt.x, t), y: mix(prev.y, bolt.y, t), z: mix(prev.z, bolt.z, t) };
    })
  };
}

/** The race the world runtime reads, with the presented drone and bolts in place of the latest step (the real race is untouched). */
export function viewOf(race: Race, shown: Shown): Race {
  const player = Object.create(race.player, {
    position: { value: shown.position }, s: { value: shown.s }, theta: { value: shown.theta },
    pitch: { value: shown.pitch }, lean: { value: shown.lean }, v: { value: shown.v }
  });
  const ops = Object.create(race.ops, {
    bolts: { value: race.ops.bolts.map((bolt, i) => (shown.bolts[i]?.alive && bolt.alive ? { ...bolt, x: shown.bolts[i]!.x, y: shown.bolts[i]!.y, z: shown.bolts[i]!.z } : bolt)) }
  });
  return Object.create(race, { player: { value: player }, ops: { value: ops } }) as Race;
}

export function createHeatsinkPresenter(getRace: () => Pick<Race, "player" | "ops">): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getRace()), blend: blendShown });
}
