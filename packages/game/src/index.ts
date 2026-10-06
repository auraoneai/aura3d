/**
 * @aura3d/game skeleton (CONTRACTS.md §3.8). Re-exports the C-24 stubs until
 * PRD 09 lands the real package.
 */

export {
  createGame,
  captureFromUrl
} from "@aura3d/engine-runtime/contracts";
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
} from "@aura3d/engine-runtime/contracts";

export { sfx, SFX_IDS } from "./sfx";
export type { SfxId, SfxPack } from "./sfx";
