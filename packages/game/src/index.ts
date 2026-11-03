/**
 * @aura3d/game — real C-24 entry (PRD-09 day-0).
 *
 * The C-24 contract slot is DEFINED here (CONTRACTS.md §3.8: no slot exists
 * in `contracts/game.ts` — the stub is exported directly). The entry calls
 * `slot.provide(realCreateGame)` once at module load; `createGame` resolves
 * `slot.get(resolveQrFlags(...))` so callers get the real impl iff
 * `A3D_QR_GAME` is on and the stub otherwise.
 */

import { defineContractSlot } from "@aura3d/rendering/contracts";
import {
  createGame as stubCreateGame,
  resolveQrFlags
} from "@aura3d/engine";
import {
  createGameImpl,
  createGameImplWithPhysicsWorldAccess,
  type GameAppWithPhysicsWorldAccess,
  type GamePhysicsWorldAccess,
  type Prd09CreateGameOptions,
  type Prd09Game
} from "./createGame";
import { createGameForSlot } from "./gameCore";

export const C24_GAME_SLOT = defineContractSlot<typeof stubCreateGame>(
  "C-24",
  "prd09",
  "A3D_QR_GAME",
  stubCreateGame
);

C24_GAME_SLOT.provide(createGameImpl as typeof stubCreateGame);

export const createGame = createGameForSlot(C24_GAME_SLOT, resolveQrFlags);

/**
 * @internal Stage a separate C-24 slot for one engine entry. The supplied
 * app factory captures that entry's physics access; neither the provider nor
 * the slot is shared with the legacy entry or another factory invocation.
 */
export function createGameEntryWithPhysicsWorldAccess<TAccess extends GamePhysicsWorldAccess>(
  access: TAccess,
  createGameAppWithAccess: GameAppWithPhysicsWorldAccess<TAccess>
) {
  const slot = defineContractSlot<typeof stubCreateGame>("C-24", "prd09", "A3D_QR_GAME", stubCreateGame);
  const createGameForEntry = <TCue extends string, TEvent extends string>(
    options: Prd09CreateGameOptions<TCue, TEvent>
  ): Prd09Game<TCue, TEvent> => createGameImplWithPhysicsWorldAccess(access, createGameAppWithAccess, options);
  slot.provide(createGameForEntry as typeof stubCreateGame);
  return { C24_GAME_SLOT: slot, createGame: createGameForSlot(slot, resolveQrFlags) } as const;
}

export { createGameImpl } from "./createGame";
export * from "./shared";
