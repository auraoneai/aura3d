// Compiled against an explicitly staged candidate with both optional backend
// packages denied. Import only the isolated entries under test.
import type {
  AnimationClip, ArcadeKartGameKitOptions, AuraApp, AuraAssetBudget, AuraBodyHandle, AuraCameraPose,
  AuraClipPlane, AuraColor, AuraComputeBuffer, AuraCrowd, AuraDiagnosticsOverlay, AuraPhysicsRuntime, AuraTextureRef,
  AuraTimeController, AuraXRSessionInit, CombatFrameData, CreateGameOptions, FontLoadOptions,
  FrameLoopOptions, GameAudioOptions, GameSession,
  MeshSurfaceQuery, VehicleSurface, createAuraApp, createGame, createGameApp,
  createGameAppRuntime, game, games, physics, preloadPhysics, scene, sceneKits
} from "@aura3d/engine/v5";
import type { createGame as createPlayableGame } from "@aura3d/engine/v5/game";

export type V5DeclarationConsumer = [
  AnimationClip, ArcadeKartGameKitOptions, AuraApp, AuraAssetBudget, AuraBodyHandle, AuraCameraPose,
  AuraClipPlane, AuraColor, AuraComputeBuffer, AuraCrowd, AuraDiagnosticsOverlay, AuraPhysicsRuntime, AuraTextureRef,
  AuraTimeController, AuraXRSessionInit, CombatFrameData, CreateGameOptions<string, string>, FontLoadOptions,
  FrameLoopOptions, GameAudioOptions<"hit">, GameSession,
  MeshSurfaceQuery, VehicleSurface, typeof createAuraApp, typeof createGame,
  typeof createGameApp, typeof createGameAppRuntime, typeof game, typeof games,
  typeof physics, typeof preloadPhysics, typeof scene, typeof sceneKits, typeof createPlayableGame
];
