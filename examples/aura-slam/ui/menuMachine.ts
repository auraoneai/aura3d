import type { MenuSettings } from "./types";

/**
 * The menu flow of menu-flow.js as a pure state machine (home, setup, intro, playing, result). Phase 1 covers the
 * two offline modes; tournament and online stay deferred (docs/aura-slam/ARCHITECTURE.md section 2).
 */
export type MenuScreen = "home" | "setup" | "intro" | "playing" | "result";
export type MenuMode = "single" | "practice";
export type SingleStep = "player" | "court";

export const INTRO_SECONDS = 2.6;
export const INTRO_SECONDS_REDUCED = 1;

export interface MenuDebug { screen: MenuScreen; mode: MenuMode; setupStep: SingleStep | null; tournament: null; introRemaining: number }

export interface MenuMachine {
  readonly screen: MenuScreen;
  readonly mode: MenuMode;
  readonly singleStep: SingleStep;
  readonly introRemaining: number;
  readonly introDuration: number;
  readonly helpOpen: boolean;
  settingsFor(mode: MenuMode): MenuSettings;
  /** Remember the settings chosen in the current setup screen (menu-flow.js `rememberChoices`). */
  remember(settings: MenuSettings): void;
  setup(mode: MenuMode, step?: SingleStep): void;
  home(): void;
  /** Single game, player step: advance to the court step; returns false when already there. */
  nextSingleStep(): boolean;
  backFromSetup(): void;
  returnToSetup(): void;
  introduce(): void;
  /** Leave the intro and start the match. Returns false when the intro is not showing. */
  play(): boolean;
  /** Advance the intro by `dt` simulation seconds; returns true on the step the intro completes. */
  tick(dt: number, hidden?: boolean): boolean;
  started(): void;
  complete(): void;
  openHelp(): void;
  closeHelp(): void;
  debug(): MenuDebug;
}

export function createMenuMachine(options: { reducedMotion?: () => boolean; initial?: Partial<Record<MenuMode, MenuSettings>> } = {}): MenuMachine {
  let screen: MenuScreen = "home";
  let mode: MenuMode = "single";
  let singleStep: SingleStep = "player";
  let introRemaining = 0;
  let introDuration = INTRO_SECONDS;
  let helpOpen = false;
  const choices: Record<MenuMode, MenuSettings> = {
    single: { venue: "hard", difficulty: "beginner", ...options.initial?.single },
    practice: { venue: "hard", difficulty: "beginner", ...options.initial?.practice }
  };

  const m: MenuMachine = {
    get screen() { return screen; },
    get mode() { return mode; },
    get singleStep() { return singleStep; },
    get introRemaining() { return introRemaining; },
    get introDuration() { return introDuration; },
    get helpOpen() { return helpOpen; },
    settingsFor: (target) => ({ ...choices[target] }),
    remember(settings) {
      // The home background previews the last single court and must never overwrite another mode's saved choices.
      if (screen === "home") return;
      choices[mode] = { ...settings };
    },
    setup(next, step = "player") {
      helpOpen = false;
      introRemaining = 0;
      mode = next;
      screen = "setup";
      singleStep = next === "single" ? step : "player";
    },
    home() {
      helpOpen = false;
      introRemaining = 0;
      screen = "home";
    },
    nextSingleStep() {
      if (screen !== "setup" || mode !== "single" || singleStep !== "player") return false;
      singleStep = "court";
      return true;
    },
    backFromSetup() {
      if (mode === "single" && singleStep === "court") singleStep = "player";
      else m.home();
    },
    returnToSetup() { m.setup(mode, mode === "single" ? "court" : "player"); },
    introduce() {
      helpOpen = false;
      introDuration = options.reducedMotion?.() ? INTRO_SECONDS_REDUCED : INTRO_SECONDS;
      introRemaining = introDuration;
      screen = "intro";
    },
    play() {
      if (screen !== "intro") return false;
      introRemaining = 0;
      screen = "playing";
      return true;
    },
    tick(dt, hidden = false) {
      if (screen !== "intro" || hidden) return false;
      introRemaining = Math.max(0, introRemaining - dt);
      if (introRemaining <= 1e-9) return m.play();
      return false;
    },
    started() { introRemaining = 0; screen = "playing"; },
    complete() { screen = "result"; },
    openHelp() { helpOpen = true; },
    closeHelp() { helpOpen = false; },
    debug: () => ({ screen, mode, setupStep: screen === "setup" && mode === "single" ? singleStep : null, tournament: null, introRemaining: +introRemaining.toFixed(2) })
  };
  return m;
}
