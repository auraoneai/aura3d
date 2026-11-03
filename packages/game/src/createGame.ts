/** Legacy C-24 implementation binding. The core accepts entry-owned dependencies. */
import { createGameApp, StubTimeController, createGameAudio } from "@aura3d/engine";
import { normalizeSceneSnapshot } from "@aura3d/engine-runtime";
import { bindFeelSound } from "@aura3d/engine/lanes";
import {
  createGameImplWithGameApp,
  createGameImplWithPhysicsWorldAccess as createGameCoreWithPhysicsWorldAccess,
  type GameAppWithPhysicsWorldAccess,
  type GamePhysicsWorldAccess,
  type Prd09CreateGameOptions,
  type Prd09Game
} from "./createGameCore";

export type { GameAppWithPhysicsWorldAccess, GameImplementationBindings, GamePhysicsWorldAccess, Prd09CreateGameOptions, Prd09Game } from "./createGameCore";

const bindings = { normalizeSceneSnapshot, StubTimeController, createGameAudio, bindFeelSound };

export function createGameImpl<TCue extends string, TEvent extends string>(options: Prd09CreateGameOptions<TCue, TEvent>): Prd09Game<TCue, TEvent> {
  return createGameImplWithGameApp(createGameApp, bindings, options);
}

export function createGameImplWithPhysicsWorldAccess<TAccess extends GamePhysicsWorldAccess, TCue extends string, TEvent extends string>(
  access: TAccess,
  createGameAppWithAccess: GameAppWithPhysicsWorldAccess<TAccess>,
  options: Prd09CreateGameOptions<TCue, TEvent>
): Prd09Game<TCue, TEvent> {
  return createGameCoreWithPhysicsWorldAccess(access, createGameAppWithAccess, bindings, options);
}
