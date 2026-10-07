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

// PRD-09 juice surface (§7.6): tween engine, Juice facade, overlay driver,
// fx pools (instanced backend A / particle-pass backend B), rumble adapter.
export { createJuice } from "./juice/Juice.js";
export type {
  Juice,
  JuiceDeps,
  JuiceEventMap,
  JuicePreset,
  JuiceCamera,
  JuiceCameraLayerEvidence,
  JuiceSession,
  JuiceOverlayDriver,
  JuiceRumble,
  JuiceSnapshot,
  JuiceSnapshotEvent,
  GameFxKind,
  GameFxLayerLike,
  Vec3Like
} from "./juice/Juice.js";
export { createTweenEngine, TWEEN_POOL_CAPACITY } from "./juice/tween.js";
export type {
  TweenEngine,
  TweenHandle,
  TweenOptions,
  TweenEase,
  TweenableNode
} from "./juice/tween.js";
export { createOverlayDriver } from "./juice/overlay.js";
export type { OverlayDriverDeps } from "./juice/overlay.js";
export { createRumbleDriver } from "./juice/rumble.js";
export type { RumbleDriverDeps } from "./juice/rumble.js";
export { createFxParticlePass } from "./juice/fxParticlePass.js";
export type { FxPassEffects, FxParticlePass } from "./juice/fxParticlePass.js";
export {
  FX_TIER_LIVE_CAP,
  FX_PRESETS,
  FxPrimitivePool,
  fxKindCapacity,
  fxPoolSceneNodes
} from "./juice/fx.js";
export type {
  FxQualityTier,
  FxPreset,
  FxShape,
  FxNodeSink,
  FxPrimitivePoolOptions
} from "./juice/fx.js";
export { ease } from "./util/ease.js";
export type { EaseName } from "./util/ease.js";

export { sfx, SFX_IDS } from "./sfx";
export type { SfxId, SfxPack } from "./sfx";

// PRD-09 Phase 4 — HUD surface (§7.7, §17).
export { mountHud } from "./hud/HudKit.js";
export { HUD_THEMES, HUD_FONT_FACES } from "./hud/themes.js";
export { screenFraction } from "./hud/screenFraction.js";
export type {
  Hud as GameHud,
  HudMountOptions as GameHudMountOptions,
  HudSnapshot,
  HudWidgetSnapshot,
  HudBannerOptions,
  HudKitDeps,
  Vec3Like
} from "./hud/HudKit.js";
export type { HudThemePreset, HudThemeVars } from "./hud/themes.js";
export type {
  HudAnchor,
  HudWidgetBase,
  HudWidgetSpec as GameHudWidgetSpec,
  HudWidgetInstance,
  HudValue
} from "./hud/widgets/index.js";
export { createWidget } from "./hud/widgets/index.js";
export type { HudDocument, HudElement, HudRect, HudScheduler, HudClassList } from "./hud/dom.js";

// PRD-09 Phase 4 — shell, transitions, context loss, touch (§6.2, §6.11, §7.2).
export { createGameShell } from "./shell/GameShell.js";
export type {
  GameShell as GameShellHandle,
  GameShellDeps,
  GameShellOptions,
  GameSessionState as ShellSessionState,
  ShellStringKey
} from "./shell/GameShell.js";
export { runTransition, domTransitionDriver } from "./shell/transition.js";
export type { TransitionSpec as ShellTransitionSpec, TransitionDriver } from "./shell/transition.js";
export { wireContextLoss } from "./shell/contextLoss.js";
export type { DeviceLossApp, ContextLossSink, ContextLossController } from "./shell/contextLoss.js";
export { createMenu } from "./shell/screens/menu.js";
export type { MenuHandle, MenuItemSpec, MenuKeyEvent, ShellScreen } from "./shell/screens/menu.js";
export { createLoadingScreen } from "./shell/screens/Loading.js";
export { createTitleScreen } from "./shell/screens/Title.js";
export { createPauseMenu, DEFAULT_PAUSE_ITEMS } from "./shell/screens/Pause.js";
export {
  createSettingsMenu,
  loadSettings,
  saveSettings,
  settingsKey,
  AUDIO_BUSES
} from "./shell/screens/Settings.js";
export type { GameSettings, SettingsActions, SettingsStorage, AudioBus } from "./shell/screens/Settings.js";
export { createResultsMenu } from "./shell/screens/Results.js";
export type { ResultsSpec as ShellResultsSpec, ResultsFieldSpec } from "./shell/screens/Results.js";
export { createAboutMenu } from "./shell/screens/About.js";
export { createContextLostScreen } from "./shell/screens/ContextLost.js";
export { mountTouchControls, TOUCH_PRESET_GENRE } from "./touch/TouchControls.js";
export type {
  TouchPreset,
  TouchControlsOptions,
  TouchControls as GameTouchControls,
  TouchInputSink,
  TouchControlsDeps
} from "./touch/TouchControls.js";
export { registerGameFonts } from "./fonts/register.js";
||||||| 5f5d6088
} from "@aura3d/engine-runtime/contracts";

// PRD-09 Phase 4 — HUD surface (§7.7, §17).
export { mountHud } from "./hud/HudKit.js";
export { HUD_THEMES, HUD_FONT_FACES } from "./hud/themes.js";
export { screenFraction } from "./hud/screenFraction.js";
export type {
  Hud as GameHud,
  HudMountOptions as GameHudMountOptions,
  HudSnapshot,
  HudWidgetSnapshot,
  HudBannerOptions,
  HudKitDeps,
  Vec3Like
} from "./hud/HudKit.js";
export type { HudThemePreset, HudThemeVars } from "./hud/themes.js";
export type {
  HudAnchor,
  HudWidgetBase,
  HudWidgetSpec as GameHudWidgetSpec,
  HudWidgetInstance,
  HudValue
} from "./hud/widgets/index.js";
export { createWidget } from "./hud/widgets/index.js";
export type { HudDocument, HudElement, HudRect, HudScheduler, HudClassList } from "./hud/dom.js";

// PRD-09 Phase 4 — shell, transitions, context loss, touch (§6.2, §6.11, §7.2).
export { createGameShell } from "./shell/GameShell.js";
export type {
  GameShell as GameShellHandle,
  GameShellDeps,
  GameShellOptions,
  GameSessionState as ShellSessionState,
  ShellStringKey
} from "./shell/GameShell.js";
export { runTransition, domTransitionDriver } from "./shell/transition.js";
export type { TransitionSpec as ShellTransitionSpec, TransitionDriver } from "./shell/transition.js";
export { wireContextLoss } from "./shell/contextLoss.js";
export type { DeviceLossApp, ContextLossSink, ContextLossController } from "./shell/contextLoss.js";
export { createMenu } from "./shell/screens/menu.js";
export type { MenuHandle, MenuItemSpec, MenuKeyEvent, ShellScreen } from "./shell/screens/menu.js";
export { createLoadingScreen } from "./shell/screens/Loading.js";
export { createTitleScreen } from "./shell/screens/Title.js";
export { createPauseMenu, DEFAULT_PAUSE_ITEMS } from "./shell/screens/Pause.js";
export {
  createSettingsMenu,
  loadSettings,
  saveSettings,
  settingsKey,
  AUDIO_BUSES
} from "./shell/screens/Settings.js";
export type { GameSettings, SettingsActions, SettingsStorage, AudioBus } from "./shell/screens/Settings.js";
export { createResultsMenu } from "./shell/screens/Results.js";
export type { ResultsSpec as ShellResultsSpec, ResultsFieldSpec } from "./shell/screens/Results.js";
export { createAboutMenu } from "./shell/screens/About.js";
export { createContextLostScreen } from "./shell/screens/ContextLost.js";
export { mountTouchControls, TOUCH_PRESET_GENRE } from "./touch/TouchControls.js";
export type {
  TouchPreset,
  TouchControlsOptions,
  TouchControls as GameTouchControls,
  TouchInputSink,
  TouchControlsDeps
} from "./touch/TouchControls.js";
export { registerGameFonts } from "./fonts/register.js";
