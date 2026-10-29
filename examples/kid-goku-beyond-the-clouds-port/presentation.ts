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

interface ViewCache { view: Game; state: Game["state"]; falling: NonNullable<Game["falling"]> }
const views = new WeakMap<Game, ViewCache>();

/**
 * The game the world runtime reads, with the presented pose in place of the latest step (the real game is untouched).
 * One view object per game is reused every frame: the state copy is refreshed in place instead of allocating a new spread.
 * The view's `state` and `falling` are plain own properties; every other field reads through to the real game.
 */
export function viewOf(game: Game, shown: Shown): Game {
  let c = views.get(game);
  if (!c) {
    const state = {} as Game["state"], falling = {} as NonNullable<Game["falling"]>;
    const view = Object.create(game, { state: { value: state, writable: true }, falling: { value: null, writable: true } }) as Game;
    c = { view, state, falling };
    views.set(game, c);
  }
  // `game.state` is replaced on start/menu, so copy its current fields each frame (no allocation)
  Object.assign(c.state, game.state);
  c.state.s = shown.s; c.state.lane = shown.lane; c.state.laneVelocity = shown.laneVelocity; c.state.jump = shown.jump; c.state.speed = shown.speed;
  const writable = c.view as { falling: Game["falling"] };
  if (game.falling && shown.falling) { Object.assign(c.falling, game.falling, shown.falling); writable.falling = c.falling; }
  else writable.falling = game.falling;
  return c.view;
}

export function createGoPresenter(getGame: () => Pick<Game, "state" | "falling">): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getGame()), blend: blendShown });
}
