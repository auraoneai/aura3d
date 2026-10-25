import { createFixedStepPresenter, createRecordBlend, type FixedStepPresenter } from "@aura3d/engine/game";
import type { MatchState } from "../contract";

/** The continuous parts of one simulation step the renderer reads: the clock, the ball and the two actors' presentation drivers. */
export interface ShownActor {
  x: number; y: number; vx: number; vy: number;
  swing: number; swingAge: number; serveMotion: number; contactFlash: number; strokeContactAge: number;
  stride: number; moveBlend: number; facing: number; lean: number; splitStep: number; recovery: number;
}
export interface Shown {
  time: number;
  ball: { x: number; y: number; z: number };
  player: ShownActor;
  ai: ShownActor;
}

/** Court units: a rally step moves the ball a few hundredths; a point reset or a serve toss jumps further and must not smear. */
export const SNAP_DISTANCE = 0.35;
/** Timers that restart at a swing or a serve: a drop larger than this is a restart, not a motion to interpolate through. */
export const RESTART_DROP = 0.2;

const ACTOR_KEYS: readonly (keyof ShownActor)[] = [
  "x", "y", "vx", "vy", "swing", "swingAge", "serveMotion", "contactFlash", "strokeContactAge", "stride", "moveBlend", "facing", "lean", "splitStep", "recovery"
];
const TIMERS: ReadonlySet<keyof ShownActor> = new Set(["swing", "swingAge", "serveMotion", "contactFlash", "strokeContactAge", "splitStep", "recovery"]);

const actorOf = (a: MatchState["player"]): ShownActor => {
  const out = {} as Record<string, number>;
  for (const k of ACTOR_KEYS) out[k] = Number((a as unknown as Record<string, unknown>)[k]) || 0;
  return out as unknown as ShownActor;
};

export function shownOf(s: Pick<MatchState, "time" | "ball" | "player" | "ai">): Shown {
  return { time: s.time, ball: { x: s.ball.x, y: s.ball.y, z: s.ball.z }, player: actorOf(s.player), ai: actorOf(s.ai) };
}

const blendActorFields = createRecordBlend<ShownActor>({ angleKeys: ["facing"] });

function blendActor(a: ShownActor, b: ShownActor, t: number): ShownActor {
  if (Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DISTANCE) return b;
  const out = blendActorFields(a, b, t);
  for (const k of TIMERS) if (Math.abs(b[k] - a[k]) > RESTART_DROP) out[k] = b[k];
  return out;
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  if (Math.hypot(b.ball.x - a.ball.x, b.ball.y - a.ball.y, b.ball.z - a.ball.z) > SNAP_DISTANCE) return { ...b, player: blendActor(a.player, b.player, t), ai: blendActor(a.ai, b.ai, t), ball: b.ball };
  return {
    time: a.time + (b.time - a.time) * t,
    ball: { x: a.ball.x + (b.ball.x - a.ball.x) * t, y: a.ball.y + (b.ball.y - a.ball.y) * t, z: a.ball.z + (b.ball.z - a.ball.z) * t },
    player: blendActor(a.player, b.player, t),
    ai: blendActor(a.ai, b.ai, t)
  };
}

/** The state the renderer reads, with the presented poses in place of the latest step (the engine state is untouched). */
export function viewOf<S extends Pick<MatchState, "time" | "ball" | "player" | "ai">>(state: S, shown: Shown): S {
  return { ...state, time: shown.time, ball: { ...state.ball, ...shown.ball }, player: { ...state.player, ...shown.player }, ai: { ...state.ai, ...shown.ai } };
}

export function createMatchPresenter(getState: () => Pick<MatchState, "time" | "ball" | "player" | "ai">): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getState()), blend: blendShown });
}
