import type { QaHookApp } from "@aura3d/engine";
import type { AudioPort, InputFrame, PhysicsKit, SceneRenderer, ShotPreset, SimEvent, StrokeModel } from "../contract";
import { DIFFICULTY_LEVELS, FIXED_DT } from "../contract";
import type { DeviceInputMapper } from "../input/mapper";
import { createControlSettings, type ControlSettings } from "../ui/controlSettings";
import type { ControlsPort } from "../ui/controls";
import { controlsHintText, SWING_ALIAS_KEYS, type SwingAliasKey } from "../ui/controlsHint";
import { byId, cachedMediaQuery, maybeById } from "../ui/dom";
import { createCoach } from "../ui/coach";
import { controlText, movementLabel } from "../ui/format";
import { createHud, type Hud } from "../ui/hud";
import { createMenu, type Menu } from "../ui/menu";
import { createPauseUi } from "../ui/pause";
import { createQuickBar } from "../ui/quickBar";
import { readMatchResults } from "../ui/results";
import { createSwipeOverlay, type SwipeOverlay, type SwipePort } from "../ui/swipeOverlay";
import { createTouchControls, type TouchControls } from "../ui/touch";
import { SHOT_DEFAULTS, type CreateSlamEngine, type HudState, type ServeFeedback, type SlamEngine } from "../ui/types";
import { themeFor } from "../ui/venues";
import { createAdapterController, type AdapterController } from "./controller";
import { createController } from "./gamepad";
import { playerFrame, type PlayerFrameContext } from "./inputFrame";
import { applyCharacterIds, matchResetOptions } from "./matchSetup";
import { createMatchLoop, type MatchLoop } from "./loop";
import { createMatchPresenter, viewOf } from "./presentation";
import { installSlamQa } from "./qa";
import { renderGameToText } from "./qaText";

/** The renderer the shell needs: the contract's `SceneRenderer` plus court projection, optional feedback and debug info. */
export interface SlamRenderer extends Omit<SceneRenderer, "render"> {
  render(state: Readonly<HudState>, dt: number, feedback?: ServeFeedback | null): void;
  projectCourt?(x: number, y: number, z?: number): { x: number; y: number; visible: boolean };
  debug?(): unknown;
}

/** Saved sound toggle (C14). */
export const SOUND_STORAGE_KEY = "aura-slam.sound.v1";
/** Set once the first-visit coach card was shown (C17). */
export const ONBOARDED_STORAGE_KEY = "aura-slam.onboarded.v1";

function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

export interface AuraSlamDeps {
  createEngine: CreateSlamEngine;
  renderer: SlamRenderer;
  /** M-INPUT: bindings store, keyboard, gamepad poller, touch stick and swipe preferences. */
  input: DeviceInputMapper;
  audio: AudioPort;
  physics: Pick<PhysicsKit, "sample" | "solveShot" | "timeToGround">;
  strokes: Pick<StrokeModel, "select">;
  /** Swipe gameplay is switched off in the original; enable with `swipeEnabled`. */
  swipeEnabled?: boolean;
  autoplay?: boolean;
  app?: () => QaHookApp | null | undefined;
  routeHealth?: () => unknown;
  nodeCount?: () => number;
  /** Test seams. */
  now?: () => number;
  schedule?: (callback: (nowMs: number) => void) => unknown;
  cancel?: (handle: unknown) => void;
  startLoop?: boolean;
}

export interface AuraSlamHandle {
  engine: SlamEngine;
  readonly state: HudState;
  menu: Menu;
  hud: Hud;
  loop: MatchLoop;
  controlSettings: ControlSettings;
  /** The live page's adapter-side controller (Auto demo player, serve-phase movement and the toss-apex assist swing). */
  autopilot: AdapterController;
  startMatch(practice?: boolean): void;
  togglePause(): void;
  dispose(): void;
}

export async function bootAuraSlam(deps: AuraSlamDeps): Promise<AuraSlamHandle> {
  const canvas = byId<HTMLCanvasElement>("game");
  const shell = document.querySelector<HTMLElement>(".game-shell")!;
  const { renderer, audio } = deps;
  const controls = deps.input.bindings as unknown as ControlsPort;
  const swipePort = deps.input.swipePreferences as unknown as SwipePort;
  const swipeEnabled = Boolean(deps.swipeEnabled);
  const params = new URLSearchParams(window.location.search);

  /* ---- renderer ---- */
  try { await renderer.mount(canvas); }
  catch (error) { byId("render-error").hidden = false; console.error(error); throw error; }

  /* ---- engine and shared state ---- */
  let selectedShot: ShotPreset = "neutral";
  // C14: the sound toggle is saved; embeds start muted unless the player turned sound on there before.
  const savedSound = readStorage(SOUND_STORAGE_KEY);
  let soundEnabled = savedSound === "on" ? true : savedSound === "off" ? false : document.documentElement.dataset.embed !== "true";
  if (!soundEnabled) audio.setEnabled(false);
  const keys: Record<string, boolean> = Object.create(null);
  const autopilot = createAdapterController({
    engine: () => engine, state: () => getState() as never,
    autoplay: deps.autoplay ?? (params.get("autoplay") === "1" || params.get("demo") === "1"),
    // C6: serve-setup movement follows the binding store, so rebinds apply (the shell's `keys` also honours blocked keys).
    moveAxes: () => ({
      mx: (controls.isDown("right", keys) ? 1 : 0) - (controls.isDown("left", keys) ? 1 : 0),
      my: (controls.isDown("down", keys) ? 1 : 0) - (controls.isDown("up", keys) ? 1 : 0)
    })
  });
  // C12: media queries are evaluated once and kept current by `change` listeners, not per frame.
  const coarseQuery = cachedMediaQuery("(pointer: coarse), (max-width: 760px)");
  const anyCoarseQuery = cachedMediaQuery("(any-pointer: coarse)");
  // The menu and quick bar fire callbacks while they are being constructed; those wait until everything is wired.
  let booted = false;

  const physicalKeys = new Set<string>();
  const blockedKeys = new Set<string>();

  const engine = deps.createEngine({
    allowSwipe: swipeEnabled,
    readInput: (side) => (side === "player" ? readPlayerInput() : undefined),
    onEvent: (event) => onSimEvent(event)
  });
  const getState = (): HudState => engine.state as HudState;
  (getState() as { mode: string }).mode = "menu";
  (getState() as { phase: string }).phase = "menu";

  const controlSettingsRef: { current: ControlSettings | null } = { current: null };
  const inputOverlayOpen = (): boolean => Boolean(controlSettingsRef.current?.isOpen());
  const touchPlayEnabled = (): boolean => getState().mode === "playing" && !getState().paused && !inputOverlayOpen();
  const modernServe = (): boolean => Boolean(engine.capabilities?.serveTargeting);
  const intentionalLobAllLevels = (): boolean => Boolean(engine.capabilities?.intentionalLobAllLevels);
  const strategic = (state: HudState = getState()): boolean => state.difficulty === "pro" || state.difficulty === "legend";
  const mobileTouchAvailable = (): boolean => (navigator.maxTouchPoints || 0) > 0 || anyCoarseQuery.matches();
  const swipeState = (): { effectiveStyle?: string; pendingStyle?: "classic" | "swipe" | null } & Record<string, unknown> =>
    (engine.getSwipeState?.() ?? {}) as { effectiveStyle?: string };
  const swipeActive = (): boolean => swipeEnabled && getState().mode === "playing" && swipeState().effectiveStyle === "swipe";
  const intentionalLobEnabled = (): boolean => {
    const s = getState();
    return s.mode === "playing" && !swipeActive() && !s.practice && (intentionalLobAllLevels() || strategic(s));
  };

  /* ---- input ---- */
  const touchRef: { current: TouchControls | null } = { current: null };
  const frameContext = (): PlayerFrameContext => ({
    keys, stick: touchRef.current?.stick ?? { x: 0, y: 0 }, inputBlocked: swipeActive() || inputOverlayOpen(),
    modernServe: modernServe(), strategic: strategic(), state: getState() as PlayerFrameContext["state"]
  });
  function readPlayerInput(): InputFrame | undefined {
    return playerFrame(deps.input, frameContext());
  }
  const hitKeyLabel = (): string => {
    const coarse = document.documentElement.dataset.embed === "true" || coarseQuery.matches();
    return pad.state.index !== null ? pad.state.hitLabel : coarse ? "HIT" : controls.labelFor("hit", "keyboard").toUpperCase();
  };

  /* ---- audio ---- */
  const initAudio = (): void => { if (soundEnabled) audio.unlock(); };
  function onSimEvent(event: SimEvent): void {
    if (event.type === "tone" || event.type === "hit" || event.type === "bounce" || event.type === "pointSound" || event.type === "point" || event.type === "serve") audio.handle(event);
    if (event.type === "point") coach.pointPlayed();
    if (event.type === "selection" && (event as { side?: string }).side === "player") selectShotUI((event as unknown as { shot: ShotPreset }).shot);
    if (event.type === "complete") finishMatch();
  }

  /* ---- loop ---- */
  const presenter = createMatchPresenter(() => getState() as never);
  const loop = createMatchLoop({
    // C4: the adapter controller (serve-setup movement, the Auto player, the toss-apex assist) runs once per fixed 1/60 s step,
    // not once per rendered frame, so it no longer speeds up on 120 Hz displays or on resize/settings re-renders.
    step: (dt) => { update(dt); autopilot.step(getState() as never, dt); presenter.afterStep(); },
    render: (frameSeconds) => render(frameSeconds, !loop.manual && getState().mode === "playing" && !getState().paused),
    beforeFrame: () => { if (!loop.manual) pad.poll(); },
    isActive: () => true,
    manual: false,
    now: deps.now, schedule: deps.schedule, cancel: deps.cancel
  });

  function update(dt: number): void {
    menu.tick(dt);
    engine.step(dt);
    syncSwipeBoundary();
  }

  function requestSwing(event?: Event, forcePower = false): void {
    if (inputOverlayOpen() || swipeActive()) return;
    const s = getState();
    const eventTime = loop.timeIntoFrame((event as { timeStamp?: number } | undefined)?.timeStamp, s.time);
    if (s.mode === "menu") menu.launch();
    else if (s.mode === "gameover") menu.replay();
    else engine.requestSwing("player", eventTime, forcePower);
  }
  function requestLobSwing(event?: Event): void {
    const s = getState();
    if (!touchPlayEnabled() || !intentionalLobEnabled() || s.phase !== "rally" || s.player.swing > 0 || s.player.swingCooldown > 0) return;
    selectShot("lob"); requestSwing(event);
  }
  function selectShotUI(shot: ShotPreset): void {
    selectedShot = shot;
    document.querySelectorAll<HTMLElement>("[data-shot]").forEach((button) => {
      button.classList.toggle("active", button.dataset.shot === shot);
      button.setAttribute("aria-pressed", String(button.dataset.shot === shot));
    });
  }
  function selectShot(shot: ShotPreset): void {
    if (swipeActive() || inputOverlayOpen() || (shot === "lob" && (!intentionalLobEnabled() || getState().paused))) return;
    selectShotUI(shot);
    engine.selectShot(shot);
  }
  const toggleShot = (shot: "short" | "deep" | "lob"): void => selectShot(selectedShot === shot ? "neutral" : shot);

  function clearInputs(): void {
    const keepSwing = swipeActive() && Boolean(swipeState().committed);
    pad.block();
    for (const code of physicalKeys) blockedKeys.add(code);
    for (const code of Object.keys(keys)) if (keys[code]) blockedKeys.add(code);
    Object.keys(keys).forEach((key) => { keys[key] = false; });
    touchRef.current?.clearAll();
    swipeOverlay?.clear(false);
    if (!keepSwing) {
      engine.captureAim?.();
      const p = getState().player as { strokeConnected: boolean; swing: number; swingCooldown: number };
      if (!p.strokeConnected) { p.swing = 0; p.swingCooldown = 0; }
    }
  }

  /* ---- smash availability (for the call banner) ---- */
  function smashAvailable(state: HudState): boolean {
    const b = state.ball, p = state.player;
    if (state.phase !== "rally" || state.paused || !b.active || b.lastHit !== "ai" || b.isServe || p.swingCooldown > 0) return false;
    const incoming = deps.physics.sample(b, 0.28);
    const stroke = deps.strokes.select(p, { ...b, ...incoming } as never);
    const reach = engine.level?.()?.humanReach ?? DIFFICULTY_LEVELS[state.difficulty].humanReach;
    return incoming.y > 0.015 && incoming.vz < 0 && stroke.kind === "smash" && stroke.reachable &&
      Math.hypot((incoming.x - p.x) * 1.05, incoming.y - p.y) <= reach * stroke.reachScale;
  }

  /* ---- ui modules ---- */
  const hud = createHud({
    names: () => menu.names(), controls, hitKeyLabel, modernServe, serveFeedback: () => serveFeedback(),
    smashAvailable, strategicDifficulty: (s) => strategic(s), intentionalLobAllLevels, swipeActive, shot: engine.SHOT ?? SHOT_DEFAULTS
  });

  const pause = createPauseUi({
    togglePause: () => togglePause(),
    returnToMenu: () => returnToMenu(),
    toggleSound: () => {
      soundEnabled = !soundEnabled; audio.setEnabled(soundEnabled); if (soundEnabled) initAudio();
      writeStorage(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off");
      return soundEnabled;
    },
    toggleFullscreen: () => toggleFullscreen()
  });
  pause.setSound(soundEnabled);

  const menu: Menu = createMenu({
    startMatch: (options) => resetMatch(options),
    settingsChanged: (settings) => {
      const s = getState() as { venue: string; difficulty: string };
      s.difficulty = settings.difficulty;
      if (s.venue !== settings.venue) { s.venue = settings.venue; audio.setVenue?.(settings.venue); if (booted) renderer.setVenue(settings.venue); }
      if (!booted) return;
      quickBar.setVenue(settings.venue);
      render();
    },
    prepareIntro: () => {
      if (!booted) return;
      const s = getState() as { mode: string; phase: string; paused: boolean };
      clearInputs(); s.mode = "menu"; s.phase = "menu"; s.paused = false; pause.sync(false);
      byId("pause-btn").classList.add("hidden");
    },
    openControlSettings: () => controlSettingsRef.current?.open(),
    refreshLabels: () => controlSettingsRef.current?.refreshLabels()
  });

  const controlSettings = createControlSettings({
    controls,
    mobile: swipeEnabled ? {
      state: () => mobileControls(),
      set: (style) => swipePort.setPreference(style)
    } : undefined,
    beforeOpen: () => {
      if (inputOverlayOpen()) return false;
      if (getState().mode === "playing" && !getState().paused) togglePause(); else clearInputs();
      return true;
    },
    clearInput: clearInputs,
    shellMode: () => shell.dataset.mode ?? ""
  });
  controlSettingsRef.current = controlSettings;
  const pad = createController({
    poller: deps.input.gamepad, onPad: (p) => controlSettings.pollController(p),
    overlayOpen: inputOverlayOpen,
    playActive: () => getState().mode === "playing" && !getState().paused,
    touchPlayEnabled, swipeActive, togglePause, clearInputs, selectShot: toggleShot, intentionalLobEnabled,
    swing: (forcePower) => requestSwing(undefined, forcePower), initAudio,
    setStatus: (text) => { const el = maybeById("controller-status"); if (el && el.textContent !== text) el.textContent = text; }
  });

  const touch = createTouchControls({
    canvas, touchPlayEnabled, swipeActive, inputOverlayOpen, matchMode: () => getState().mode,
    requestSwing, requestLobSwing, intentionalLobEnabled, modernServe, initAudio
  });
  touchRef.current = touch;

  let swipeOverlay: SwipeOverlay | null = null;
  const projectCourt = (x: number, y: number, z?: number): { x: number; y: number; visible: boolean } =>
    renderer.projectCourt?.(x, y, z) ?? { x: 0, y: 0, visible: false };
  if (swipeEnabled) {
    swipeOverlay = createSwipeOverlay({
      canvas, swipe: swipePort, engine: () => engine, state: getState, physics: deps.physics, projectCourt, swipeActive, touchPlayEnabled, initAudio,
      energyCost: (engine.SHOT ?? SHOT_DEFAULTS).powerCost, rerender: () => render(), syncBoundary: syncSwipeBoundary,
      text: (id, value) => { byId(id).textContent = String(value); }
    });
  }

  const quickBar = createQuickBar({
    autoplay: autopilot.enabled,
    setAutoplay: (on) => { autopilot.enabled = on; if (on) coach.dispose(); },
    quickMatch: () => menu.quickStart("single"),
    smashLab: () => menu.quickStart("practice"),
    openModes: () => menu.home(),
    selectVenue: (id) => menu.selectVenue(id)
  });

  const coach = createCoach({
    host: shell,
    hitKey: hitKeyLabel,
    moveKeys: () => movementLabel(controls),
    presetKeys: () => [controls.labelFor("short", "keyboard").toUpperCase(), controls.labelFor("deep", "keyboard").toUpperCase()],
    touch: () => coarseQuery.matches() && (navigator.maxTouchPoints || 0) > 0,
    allowed: () => document.documentElement.dataset.embed !== "true" && !autopilot.enabled && params.get("coach") !== "0",
    storage: { get: () => readStorage(ONBOARDED_STORAGE_KEY), set: (value) => writeStorage(ONBOARDED_STORAGE_KEY, value) }
  });

  function syncSwipeBoundary(): void {
    if (!swipeOverlay) return;
    const swipe = swipeState();
    const s = getState();
    const key = [swipe.effectiveStyle, swipe.pointEpoch, swipe.attemptKey, s.rallyHits, s.mode].join(":");
    if (key !== swipeOverlay.boundaryKey()) { swipeOverlay.clear(false); swipeOverlay.setBoundaryKey(key); }
  }

  function mobileControls(): ReturnType<NonNullable<Parameters<typeof createControlSettings>[0]["mobile"]>["state"]> {
    const available = swipeEnabled && mobileTouchAvailable();
    const current = swipeState();
    return {
      enabled: swipeEnabled, preferred: swipeEnabled ? swipePort.getPreference() ?? "classic" : "classic",
      effective: available && current.effectiveStyle === "swipe" ? "swipe" : "classic",
      pending: available ? (current.pendingStyle ?? null) : null, available,
      reason: !swipeEnabled ? "Swipe controls are currently disabled. Use Classic controls." : !mobileTouchAvailable() ? "Swipe gameplay needs a touch screen." : ""
    };
  }

  const serveFeedback = (): ServeFeedback | null => {
    if (!modernServe()) return null;
    const lookahead = loop.manual ? 0 : Math.min(0.05, loop.loop.accumulator + FIXED_DT);
    const feedback = engine.getServeFeedback(lookahead);
    return feedback && swipeActive() ? { ...feedback, showPressCue: false, swipe: true } : feedback;
  };

  /* ---- render ---- */
  /** `live` draws the ball and both athletes between the last two steps (smooth on 120 and 144 Hz displays); manual and QA frames draw the exact latest step. */
  function render(frameSeconds: number = FIXED_DT, live = false): void {
    const s = getState();
    const feedback = serveFeedback();
    renderer.render(live ? (viewOf(s as never, presenter.present(loop.loop, true)) as never) : s, frameSeconds, feedback);
    if (!canvas.dataset.ready) canvas.dataset.ready = "true";
    shell.dataset.mode = s.mode;
    hud.render(s);
    const coarse = document.documentElement.dataset.embed === "true" || coarseQuery.matches();
    const touchEnabled = touchPlayEnabled();
    touch.render({ phase: s.phase, server: s.server, touchEnabled, coarse });
    swipeOverlay?.render(touchEnabled);
  }

  /* ---- match flow ---- */
  function resetMatch(options: { difficulty?: string; venue?: string; practice: boolean }): void {
    clearInputs();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    engine.resetMatch(matchResetOptions({
      difficulty: (options.difficulty ?? "beginner") as never, venue: options.venue ?? "hard", practice: options.practice,
      allowSwipe: swipeEnabled && mobileTouchAvailable(), controlStyle: swipeEnabled ? swipePort.getPreference() ?? "classic" : "classic"
    }));
    applyCharacterIds(getState() as never, options.practice);
    presenter.reset();
    swipeOverlay?.setBoundaryKey(""); syncSwipeBoundary();
    const s = getState() as { paused: boolean; venue: string; player: { selectedShot?: ShotPreset } };
    s.paused = false;
    renderer.setVenue(s.venue);
    audio.setVenue?.(s.venue);
    selectShotUI(s.player.selectedShot || "neutral");
    menu.started();
    const menuEl = byId("menu");
    menuEl.classList.add("hidden"); menuEl.setAttribute("aria-hidden", "true"); (menuEl as HTMLElement & { inert: boolean }).inert = true;
    hud.hideResults();
    byId("pause-btn").classList.remove("hidden");
    pause.sync(false);
    initAudio();
    audio.handle({ type: "tone", args: [310, 0.06, "sine", 0.05] });
  }

  function finishMatch(): void {
    clearInputs();
    const s = getState() as { mode: string; phase: string; winner?: string };
    s.mode = "gameover"; s.phase = "complete";
    hud.showResults(s as unknown as HudState);
    menu.complete(s.winner === "player");
  }

  function togglePause(): void {
    if (inputOverlayOpen()) return;
    initAudio();
    const s = getState() as { mode: string; paused: boolean };
    if (s.mode !== "playing") return;
    s.paused = !s.paused;
    clearInputs();
    pause.sync(s.paused);
  }

  function returnToMenu(): void {
    clearInputs();
    const settings = menu.settings();
    engine.resetMatch({ difficulty: settings.difficulty, venue: settings.venue, practice: false });
    const s = getState() as { mode: string; phase: string; paused: boolean; outFeedback: unknown };
    s.mode = "menu"; s.phase = "menu"; s.paused = false; s.outFeedback = null;
    delete (s as { practice?: unknown }).practice;
    hud.hideResults();
    const menuEl = byId("menu");
    menuEl.classList.remove("hidden"); menuEl.setAttribute("aria-hidden", "false"); (menuEl as HTMLElement & { inert: boolean }).inert = false;
    byId("pause-btn").classList.add("hidden");
    pause.sync(false);
    menu.home();
    render();
  }

  function toggleFullscreen(): void {
    const request = !document.fullscreenElement ? shell.requestFullscreen?.() : document.exitFullscreen?.();
    if (getState().mode === "playing" && !getState().paused && document.activeElement === byId("fullscreen-btn")) canvas.focus({ preventScroll: true });
    request?.catch(() => { const s = getState() as { message: string; messageTimer: number }; s.message = "Fullscreen unavailable in this browser"; s.messageTimer = 2; });
  }

  /* ---- keyboard ---- */
  function trackPhysicalKeyDown(event: KeyboardEvent): void {
    physicalKeys.add(event.code);
    // Observe releases even when a dialog consumes the bubbling event.
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) for (const code of physicalKeys) { blockedKeys.add(code); keys[code] = false; }
  }
  function trackPhysicalKeyUp(event: KeyboardEvent): void { physicalKeys.delete(event.code); blockedKeys.delete(event.code); keys[event.code] = false; }

  function handleKeyDown(event: KeyboardEvent): void {
    trackPhysicalKeyDown(event);
    if (inputOverlayOpen() || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const target = event.target as HTMLElement | null;
    if (blockedKeys.has(event.code)) {
      if (touchPlayEnabled() && controls.actionForKey(event.code) && !["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A", "SUMMARY"].includes(target?.tagName ?? "") && !target?.isContentEditable) event.preventDefault();
      return;
    }
    // Native controls and external forms keep their own input semantics.
    if (target?.closest && target !== document.body && !target.closest(".game-shell")) return;
    if (menu.handleKey(event)) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName ?? "") || target?.isContentEditable) return;
    if (event.code === "Space" && ["BUTTON", "A", "SUMMARY"].includes(target?.tagName ?? "")) return;
    const action = controls.actionForKey(event.code);
    if (action && touchPlayEnabled()) event.preventDefault();
    const actionWasDown = action && controls.isDown(action, keys);
    if (event.repeat || keys[event.code]) return;
    if (document.hidden || (document.hasFocus && !document.hasFocus())) return;
    initAudio();
    keys[event.code] = true;
    if (event.code === "KeyP" || (event.code === "Escape" && !document.fullscreenElement)) { togglePause(); return; }
    if (event.code === "KeyF") { toggleFullscreen(); return; }
    const s = getState();
    // Replay and menu activation is a fixed UI context, separate from gameplay R.
    if (s.mode === "gameover" || s.mode === "menu") {
      if (event.code === "Space" || (event.code === "KeyR" && s.mode === "gameover")) { event.preventDefault(); requestSwing(event); }
      return;
    }
    // C6: J short, K deep with power and L lob are the live page's swing aliases. They now pass the same gates as the bound keys
    // (overlay, swipe, pause, the lob difficulty gate) and only work while no action is bound to the key.
    const alias = !action ? SWING_ALIAS_KEYS[event.code as SwingAliasKey] : undefined;
    if (alias) {
      if (!touchPlayEnabled() || swipeActive()) return;
      event.preventDefault();
      coach.swung();
      if (alias === "lob") { requestLobSwing(event); return; }
      selectShot(alias);
      requestSwing(event, alias === "deep");
      return;
    }
    if (!touchPlayEnabled() || swipeActive() || !action) return;
    event.preventDefault();
    // Alternate keys are one logical button: release both before a second hit.
    if (actionWasDown) return;
    if (action === "hit") { coach.swung(); requestSwing(event); }
    if (action === "lob") requestLobSwing(event);
    if (action === "short") toggleShot("short");
    if (action === "deep") toggleShot("deep");
  }

  const uninstallController = autopilot.install();

  /* ---- controls hint (C3): built from the live bindings, refreshed on every rebind ---- */
  const hintEl = maybeById("aura-controls-hint");
  const refreshHint = (): void => { if (hintEl) hintEl.textContent = controlsHintText(controls, { lobAllLevels: intentionalLobAllLevels() }); };
  refreshHint();

  /* ---- graphics reset (C8): the engine keeps the context (preventDefault) and rebuilds GPU objects on restore ---- */
  const resetEl = maybeById("graphics-reset");
  let contextLost = false;
  let pausedForReset = false;
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    clearInputs();
    const s = getState();
    if (s.mode === "playing" && !s.paused) { togglePause(); pausedForReset = true; }
    if (resetEl) { resetEl.textContent = "Graphics reset. Waiting for the graphics card…"; resetEl.hidden = false; }
  };
  const onContextRestored = (): void => {
    contextLost = false;
    if (resetEl) resetEl.textContent = "Graphics reset. Tap to resume.";
    render();
  };
  const resumeAfterReset = (): void => {
    if (contextLost || !resetEl || resetEl.hidden) return;
    resetEl.hidden = true;
    if (pausedForReset && getState().paused) togglePause();
    pausedForReset = false;
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  resetEl?.addEventListener("click", resumeAfterReset);
  canvas.addEventListener("pointerdown", resumeAfterReset);

  window.addEventListener("keydown", trackPhysicalKeyDown, true);
  window.addEventListener("keyup", trackPhysicalKeyUp, true);
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", trackPhysicalKeyUp);
  const onResize = (): void => {
    touch.clearAll(); swipeOverlay?.clear(false);
    const box = canvas.getBoundingClientRect();
    renderer.resize(box.width, box.height, window.devicePixelRatio || 1);
    render();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("blur", clearInputs);
  document.addEventListener("pointerdown", initAudio, { passive: true });
  const onVisibility = (): void => {
    if (document.hidden) clearInputs();
    if (document.hidden && getState().mode === "playing" && !getState().paused) togglePause();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const unsubscribeControls = controls.subscribe(() => { clearInputs(); controlSettings.refreshLabels(); refreshHint(); render(); });
  const unsubscribeSwipe = swipePort.subscribe(() => { clearInputs(); if (getState().mode === "playing" && mobileControls().available) engine.setControlStyle?.(swipePort.getPreference()); render(); });

  /* ---- start state ---- */
  booted = true;
  renderer.setVenue(getState().venue);
  onResize();

  const startMatch = (practice = false): void => menu.quickStart(practice ? "practice" : "single");

  const text = (): string => renderGameToText({
    state: getState(), names: menu.names(), menu: menu.debug(),
    shownResults: byId("result").classList.contains("hidden") ? null : readMatchResults(byId("match-stats")),
    selectedShot, strategic: strategic(), modernServe: modernServe(), swipeActive: swipeActive(), mobileControls: mobileControls(),
    swipeState: engine.getSwipeState?.() ?? {}, swipeGesture: swipeOverlay?.gesture(), swipeVisual: swipeOverlay?.visual(),
    bindings: { keyboard: controls.getBindings("keyboard"), controller: controls.getBindings("controller"), settingsOpen: inputOverlayOpen() },
    touch: { active: touch.stick.pointerId !== null, dragging: touch.stick.dragged, x: touch.stick.x, y: touch.stick.y },
    placementDown: controls.isDown("placement", keys), smashAvailable: smashAvailable(getState()), graphics: renderer.debug?.(),
    engine, serveFeedback: serveFeedback(),
    controlsHelp: swipeActive()
      ? "Swipe: automatic movement. Swipe toward the target from your player’s lane; forward length sets depth, speed adds power. Release locks the target and shows the flight arc. One swipe serves. Swipe once per return; no swipe means no hit. Settings changes apply next point or Practice feed."
      : controlText("Mobile: slide and hold anywhere to move; return to the starting point to stop. Tap anywhere to hit, including a second finger while moving; double tap for power. Arrows/WASD move. Space starts one swing immediately: during its brief planted wind-up arrows aim, including diagonals (left/right placement, up deep, down short). Movement resumes at contact or after 180ms. Stroke adapts to contact: left-side backhand, unbounced volley, high overhead smash within reach. No automatic movement or swing. Quick double Space before contact adds power (38 energy); energy recovers at 6/s after 1s. Q/E retain short/deep presets; Shift+Space uses the same power budget. " +
        (modernServe() ? "Serve: arrows/WASD or drag move the target; Space/HIT tosses, then starts a 240 ms swing and locks aim. Double strike within 220 ms, or POWER HIT, adds power and 0.5 m depth without energy cost. Press as the rising ball reaches the overhead circle; the circle disappears when the swing starts. The hollow aiming ring disappears at contact."
          : "Classic serve: Space toss, Space strike at apex; return only after bounce.") + " P pauses, F fullscreen." +
        (strategic() ? " Ace / Legend: hold C while aiming a normal or deep drive for safer placement inside the lines, especially with power. Release C for the full angle. Movement speed, drops, lobs and analog touch keep their usual range." : "") +
        (intentionalLobEnabled() ? " R starts one lob swing immediately; hold left/right to aim. Mobile: press LOB once to swing immediately; hold left/right to aim. Vertical input retains the lob, and power is ignored." + (intentionalLobAllLevels() ? " Its high arc lands near the opposite baseline and cannot be smashed." : "") : ""), controls)
  });

  const qa = installSlamQa({
    ready: () => true,
    state: () => getState() as never,
    stepFrames: (n, input) => { loop.manual = true; loop.loop.advance(n, (i) => { if (i === 0 && input) engine.applyInput((input.side as "player" | "ai" | undefined) ?? "player", input as InputFrame); }); },
    reset: () => { const s = menu.settings(); engine.resetMatch(matchResetOptions({ difficulty: s.difficulty as never, venue: s.venue, practice: false })); },
    begin: () => menu.quickStart("single"),
    app: () => deps.app?.(),
    renderText: text,
    advanceTime: (ms) => { pad.poll(); loop.advanceTime(ms); },
    togglePause, startOffline: (settings) => menu.quickStart(menu.practice() ? "practice" : "single", settings), getEngine: () => engine,
    routeHealth: deps.routeHealth, nodeCount: deps.nodeCount,
    traceRow: () => { const s = getState(); return [s.tick, s.ball.x, s.ball.y, s.ball.z, s.player.x, s.player.y, s.ai.x, s.ai.y, s.score.playerPoints, s.score.aiPoints]; }
  });

  // Unless ?menu=1 or ?mode= is requested the live page starts on court so keys work immediately; the native page does the same.
  const requestedVenue = params.get("venue");
  const venueOk = Boolean(requestedVenue && themeFor(requestedVenue).id === requestedVenue);
  if (venueOk) menu.selectVenue(requestedVenue!);
  // quickStart reads the per-mode remembered settings, so the requested venue is passed through (it was dropped before).
  const startSettings = venueOk ? { venue: requestedVenue! } : {};
  if (params.get("menu") !== "1" && !params.get("mode")) { menu.quickStart("single", startSettings); quickBar.setActiveMode("play"); coach.maybeShow(); }
  else if (params.get("mode") === "practice") { menu.quickStart("practice", startSettings); quickBar.setActiveMode("practice"); }
  else quickBar.setActiveMode("menu");

  render();
  if (deps.startLoop !== false) loop.start();
  document.getElementById("boot")?.classList.add("done");
  document.body.dataset.auraSlamReady = "true";

  const handle: AuraSlamHandle = {
    engine, get state() { return getState(); }, menu, hud, loop, controlSettings, autopilot, startMatch, togglePause,
    dispose() {
      loop.loop.stop();
      uninstallController();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", trackPhysicalKeyUp);
      window.removeEventListener("keydown", trackPhysicalKeyDown, true);
      window.removeEventListener("keyup", trackPhysicalKeyUp, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", clearInputs);
      document.removeEventListener("pointerdown", initAudio);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      canvas.removeEventListener("pointerdown", resumeAfterReset);
      resetEl?.removeEventListener("click", resumeAfterReset);
      unsubscribeControls();
      unsubscribeSwipe();
      coarseQuery.dispose();
      anyCoarseQuery.dispose();
      coach.dispose();
      qa.uninstall();
      renderer.dispose();
    }
  };
  return handle;
}
