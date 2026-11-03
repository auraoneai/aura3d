/** Versioned game facade sharing the isolated engine entry's physics provider. */
import { v5PhysicsWorldAccess, createGameAppWithPhysicsWorldAccess } from "@aura3d/engine/v5/context";
import { bindFeelSound, createGame as stubCreateGame, createGameAudio, normalizeSceneSnapshot, resolveQrFlags, StubTimeController } from "@aura3d/engine/v5/internal";
import { createGameEntryWithPhysicsWorldAccess } from "./gameCore.js";
import { createGameImplWithPhysicsWorldAccess, type Prd09CreateGameOptions, type Prd09Game } from "./createGameCore.js";

const bindings = { stubCreateGame, resolveQrFlags, normalizeSceneSnapshot, StubTimeController, createGameAudio, bindFeelSound };
const entry = createGameEntryWithPhysicsWorldAccess(v5PhysicsWorldAccess, createGameAppWithPhysicsWorldAccess, bindings);

export const C24_GAME_SLOT = entry.C24_GAME_SLOT;
export const createGame = entry.createGame;

export function createGameImpl<TCue extends string, TEvent extends string>(
  options: Prd09CreateGameOptions<TCue, TEvent>
): Prd09Game<TCue, TEvent> {
  return createGameImplWithPhysicsWorldAccess(v5PhysicsWorldAccess, createGameAppWithPhysicsWorldAccess, bindings, options);
}

export * from "./shared.js";
