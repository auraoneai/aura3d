import { createFixedStepPresenter, createRecordBlend, type FixedStepPresenter } from "@aura3d/engine/game";
import type { Game } from "./game";

/** What the renderer reads of one simulation step: the runner's track position and the fall pose. */
export interface Shown {
  s: number;
  lane: number;
  laneVelocity: number;
  jump: number;
  speed: number;
  falling: { t: number; y: number; s: number; lane: number; jump: number } | null;
}

/** A step moves the runner a fraction of a unit; a respawn, retry or menu start jumps much further and must not smear. */
export const SNAP_DISTANCE = 5;

export const blendShown = createRecordBlend<Shown>({ snapDistance: SNAP_DISTANCE, position: (p) => [p.s] });

export function shownOf(game: Pick<Game, "state" | "falling">): Shown {
  const st = game.state;
  const f = game.falling;
  return {
    s: st.s, lane: st.lane, laneVelocity: st.laneVelocity, jump: st.jump, speed: st.speed,
    falling: f ? { t: f.t, y: f.y, s: f.s, lane: f.lane, jump: f.jump } : null
  };
}

/** The game the world runtime reads, with the presented pose in place of the latest step (the real game is untouched). */
export function viewOf(game: Game, shown: Shown): Game {
  const props: PropertyDescriptorMap = {
    state: { value: { ...game.state, s: shown.s, lane: shown.lane, laneVelocity: shown.laneVelocity, jump: shown.jump, speed: shown.speed } }
  };
  if (game.falling && shown.falling) props.falling = { value: { ...game.falling, ...shown.falling } };
  return Object.create(game, props) as Game;
}

export function createGoPresenter(getGame: () => Pick<Game, "state" | "falling">): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getGame()), blend: blendShown });
}
