/** Entry-local C-24 slot and createGame dispatch, with all engine bindings supplied by the caller. */
import { defineContractSlot } from "@aura3d/rendering/contracts";
import type { createGame as ContractCreateGame, resolveQrFlags, CreateGameOptions, QrFlagInput } from "@aura3d/engine/v5/internal";
import {
  createGameImplWithPhysicsWorldAccess,
  type GameAppWithPhysicsWorldAccess,
  type GameImplementationBindings,
  type GamePhysicsWorldAccess,
  type Prd09CreateGameOptions,
  type Prd09Game
} from "./createGameCore";
import { withGameFlagDefault } from "./flagDefault";

export interface GameEntryBindings extends GameImplementationBindings {
  readonly stubCreateGame: typeof ContractCreateGame;
  readonly resolveQrFlags: typeof resolveQrFlags;
}

type GameSlot = ReturnType<typeof defineContractSlot<typeof ContractCreateGame>>;
const envFlags = (): Readonly<Record<string, string | undefined>> | undefined => {
  try {
    const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (viteEnv !== undefined) return viteEnv;
  } catch {
    /* non-Vite context */
  }
  return typeof process !== "undefined" ? process.env : undefined;
};
const currentUrl = (): string | undefined => typeof location !== "undefined" ? location.href : undefined;

/** @internal Adapt a slot to the game subpath's flag defaults. */
export function createGameForSlot(slot: GameSlot, resolveFlags: typeof resolveQrFlags) {
  return function createGame<TCue extends string, TEvent extends string>(
    options: Prd09CreateGameOptions<TCue, TEvent>
  ): Prd09Game<TCue, TEvent> {
    const gameFlags = withGameFlagDefault(options.qualityRebuild?.flags as QrFlagInput | undefined);
    const flags = resolveFlags({ options: gameFlags, url: currentUrl(), env: envFlags() });
    const effective = { ...options, qualityRebuild: { ...options.qualityRebuild, flags: gameFlags } };
    return slot.get(flags)(effective as unknown as CreateGameOptions<TCue, TEvent>) as Prd09Game<TCue, TEvent>;
  };
}

/** @internal Create a fresh slot and bind every game it makes to the supplied access. */
export function createGameEntryWithPhysicsWorldAccess<TAccess extends GamePhysicsWorldAccess>(
  access: TAccess,
  createGameAppWithAccess: GameAppWithPhysicsWorldAccess<TAccess>,
  bindings: GameEntryBindings
) {
  const slot = defineContractSlot<typeof ContractCreateGame>("C-24", "prd09", "A3D_QR_GAME", bindings.stubCreateGame);
  const createGameForEntry = <TCue extends string, TEvent extends string>(
    options: Prd09CreateGameOptions<TCue, TEvent>
  ): Prd09Game<TCue, TEvent> => createGameImplWithPhysicsWorldAccess(access, createGameAppWithAccess, bindings, options);
  slot.provide(createGameForEntry as typeof ContractCreateGame);
  return { C24_GAME_SLOT: slot, createGame: createGameForSlot(slot, bindings.resolveQrFlags) } as const;
}
