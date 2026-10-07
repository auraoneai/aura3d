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
  resolveQrFlags,
  type CreateGameOptions,
  type Game,
  type QrFlagInput
} from "@aura3d/engine/contracts";
import { createGameImpl, type Prd09Game } from "./createGame";

export const C24_GAME_SLOT = defineContractSlot<typeof stubCreateGame>(
  "C-24",
  "prd09",
  "A3D_QR_GAME",
  stubCreateGame
);

C24_GAME_SLOT.provide(createGameImpl as typeof stubCreateGame);

const envFlags = (): Readonly<Record<string, string | undefined>> | undefined => {
  try {
    const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (viteEnv !== undefined) return viteEnv;
  } catch {
    /* non-Vite context */
  }
  return typeof process !== "undefined" ? process.env : undefined;
};

const currentUrl = (): string | undefined =>
  typeof location !== "undefined" ? location.href : undefined;

export function createGame<TCue extends string, TEvent extends string>(
  options: CreateGameOptions<TCue, TEvent>
): Game<TCue, TEvent> {
  const flags = resolveQrFlags({
    options: options.qualityRebuild?.flags as QrFlagInput | undefined,
    url: currentUrl(),
    env: envFlags()
  });
  return C24_GAME_SLOT.get(flags)(options);
}

export { captureFromUrl, lookSignature, lookManifest, type LookSource } from "./capture/index";
export { createGameImpl, type Prd09Game } from "./createGame";
export { GameSessionImpl } from "./session/GameSession";
export { attachSessionLifecycle } from "./session/lifecycle";
export { createAccessibility } from "./session/accessibility";
export { installGameBeacon } from "./evidence/beacon";
export { installEvidenceChannel, createPerfRing, type EvidenceChannelContract } from "./evidence/channel";
export type { Prd09CreateGameOptions } from "./createGame";
export type {
  Game,
  CreateGameOptions,
  GameSession,
  GameSessionState,
  GameShell,
  Hud,
  TouchControls,
  GameFxLayer,
  CaptureContext,
  GameBeacon
} from "@aura3d/engine/contracts";

export { sfx, SFX_IDS } from "./sfx";
export type { SfxId, SfxPack } from "./sfx";
