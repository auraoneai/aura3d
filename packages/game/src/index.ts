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
