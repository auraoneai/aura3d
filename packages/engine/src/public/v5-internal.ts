/**
 * Internal, provider-free engine leaves shared by game entry implementations.
 * Entry-owned physics access is supplied separately when a game is created.
 * @internal
 */
import type { CreateGameOptions, Game } from "../contracts/game.js";

/**
 * Preserve the root contract's actionable failure without sending isolated
 * callers through the legacy game entry and its separate physics provider.
 * @internal
 */
export function createGame<TCue extends string, TEvent extends string>(
  _options: CreateGameOptions<TCue, TEvent>
): Game<TCue, TEvent> {
  const error = new Error(
    "CREATE_GAME_ROOT_UNAVAILABLE_V1: The v5 root createGame contract cannot provide the game runtime. " +
      "Import { createGame } from '@aura3d/engine/v5/game'. If already using that subpath, " +
      "remove the '-game' / 'none' quality-rebuild opt-out and enable A3D_QR_GAME."
  ) as Error & { code: string; version: number };
  error.name = "AuraGameMigrationError";
  error.code = "CREATE_GAME_ROOT_UNAVAILABLE";
  error.version = 1;
  throw error;
}
export { resolveQrFlags } from "../contracts/flags.js";
export { StubTimeController } from "../contracts/time.js";
export { normalizeSceneSnapshot } from "../agent-api/sceneMath.js";
export { instances } from "../agent-api/nodes/instances.js";
export { material } from "../agent-api/nodes/material.js";
export { scene } from "../agent-api/nodes/scene.js";
export { bindFeelSound } from "../agent-api/feel/bindFeelSound.js";
export { createFixedStepLoop } from "../qa/fixedStepLoop.js";
export { createGameAudio } from "../game/GameAudio.js";

export type { QrFlagInput } from "../contracts/flags.js";
export type { AuraTimeController } from "../contracts/time.js";
export type { CaptureContext, CreateGameOptions, Game, GameBeacon, GameFxLayer, GameScenario, GameSession, GameSessionState, GameShell, Hud, PauseReason, TouchControls, TransitionSpec } from "../contracts/game.js";
export type { AuraApp, AuraAppTarget, AuraCreateGameAppOptions } from "../agent-api/nodes/types/runtime.js";
export type { AuraSceneSnapshot } from "../agent-api/nodes/types.js";
export type { AuraSceneBuilder } from "../agent-api/nodes/scene.js";
export type { GameAppRuntime } from "../agent-api/GameAppRuntime.js";
export type { GameAudio, GameAudioOptions } from "../game/GameAudio.js";
