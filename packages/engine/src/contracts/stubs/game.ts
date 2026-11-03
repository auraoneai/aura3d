/**
 * The root C-24 contract slot is retained for source compatibility, but it
 * cannot provide a game shell. Importing the full kit here would create a
 * dependency cycle because that kit consumes engine contracts.
 */
import type { CreateGameOptions, Game } from "../game";

/**
 * The former root implementation silently returned a headless game with no
 * working HUD, touch, effects or audio. Fail before mounting a scene so the
 * caller can migrate without leaving a partially initialized app behind.
 *
 * The code and version are stable machine-readable migration identifiers.
 */
export function createGame<TCue extends string, TEvent extends string>(
  _options: CreateGameOptions<TCue, TEvent>
): Game<TCue, TEvent> {
  const error = new Error(
    "CREATE_GAME_ROOT_UNAVAILABLE_V1: The root createGame contract cannot provide the game runtime. " +
      "Import { createGame } from '@aura3d/engine/game'. If already using that subpath, " +
      "remove the '-game' / 'none' quality-rebuild opt-out and enable A3D_QR_GAME."
  ) as Error & { code: string; version: number };
  error.name = "AuraGameMigrationError";
  error.code = "CREATE_GAME_ROOT_UNAVAILABLE";
  error.version = 1;
  throw error;
}
