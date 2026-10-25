import { createFixedStepPresenter, createRecordBlend, type FixedStepPresenter } from "@aura3d/engine/game";
import type { WindState } from "./sim";

/** What the renderer reads of one simulation step that moves continuously: the walker's position, stride and hop height. */
export interface Shown {
  x: number;
  z: number;
  stride: number;
  hopHeight: number;
}

/** A walking step covers a few hundredths of a unit; a restart or snap jumps further and must not smear. */
export const SNAP_DISTANCE = 2;

export const blendShown = createRecordBlend<Shown>({ snapDistance: SNAP_DISTANCE, position: (p) => [p.x, p.z] });

export function shownOf(state: WindState): Shown {
  return { x: state.pos.x, z: state.pos.z, stride: state.stride, hopHeight: state.hop.height };
}

/** The state the world runtime reads, with the presented pose in place of the latest step (the real state is untouched). */
export function viewOf(state: WindState, shown: Shown): WindState {
  return { ...state, pos: { x: shown.x, z: shown.z }, stride: shown.stride, hop: { ...state.hop, height: shown.hopHeight } };
}

export function createWindPresenter(getState: () => WindState): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getState()), blend: blendShown });
}
