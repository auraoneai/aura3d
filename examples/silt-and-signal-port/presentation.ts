import { createFixedStepPresenter, createRecordBlend, type FixedStepPresenter } from "@aura3d/engine/game";
import type { Sim } from "./sim";

/** What the renderer reads of one simulation step: the board pose and the flight numbers that drive tilt, thrusters and camera. */
export interface Shown {
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
  vertical: number;
  speed: number;
}

/** A step moves the rider at most a few units; a chapter change or restart jumps further and must not smear. */
export const SNAP_DISTANCE = 20;

export const blendShown = createRecordBlend<Shown>({ angleKeys: ["yaw"], snapDistance: SNAP_DISTANCE, position: (p) => [p.x, p.y, p.z] });

export function shownOf(sim: Sim): Shown {
  const { state: s, flight: f } = sim;
  return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, bank: f.bank, vertical: f.vertical, speed: f.speed };
}

/** The sim the world runtime reads, with the presented pose in place of the latest step. */
export function viewOf(sim: Sim, shown: Shown): Sim {
  return {
    ...sim,
    state: { ...sim.state, x: shown.x, y: shown.y, z: shown.z, yaw: shown.yaw },
    flight: { ...sim.flight, bank: shown.bank, vertical: shown.vertical, speed: shown.speed }
  };
}

export function createSiltPresenter(getSim: () => Sim): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getSim()), blend: blendShown });
}
