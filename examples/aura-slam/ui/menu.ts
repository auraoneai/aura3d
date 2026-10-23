import type { MatchEngineOptions, MenuPort } from "../contract";
import { byId, maybeById, setInert, setVisible } from "./dom";
import { reducedMotion } from "./format";
import { createMenuMachine, type MenuDebug, type MenuMachine, type MenuMode, type MenuScreen } from "./menuMachine";
import type { MenuSettings, ScoreboardNames } from "./types";
import { MENU_COURTS, themeFor } from "./venues";

const REGULAR_VENUES = new Set(MENU_COURTS.filter((court) => !court.destination).map((court) => court.venue));
const PLAYER_NAME_KEY = "baseline.playerName";

export interface MenuDeps {
  /** Begin the match with the chosen options (shell `resetMatch`). */
  startMatch(options: MatchEngineOptions & { practice: boolean }): void;
  /** Called whenever the venue or difficulty buttons change the settings. */
  settingsChanged(settings: MenuSettings): void;
  /** Clear held input and put the sim back on the menu before a setup or intro screen (`TennisLocal.prepareIntro`). */
  prepareIntro(): void;
  /** Inform the shell that the settings overlay (controls) was requested from the menu footer. */
  openControlSettings?(): void;
  refreshLabels?(): void;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface Menu extends MenuPort {
  readonly machine: MenuMachine;
  /** Offline names for the scoreboard and intro (`TennisLocal.names`). */
  names(): ScoreboardNames;
  validatePlayerName(): boolean;
  settings(): MenuSettings;
  selectVenue(id: string): void;
  selectDifficulty(id: string): void;
  launch(): void;
  replay(): void;
  home(restoreFocus?: boolean): void;
  setup(mode: MenuMode, step?: "player" | "court"): void;
  /** One simulation tick: advances the intro countdown and starts the match when it ends. */
  tick(dt: number): void;
  complete(won: boolean): void;
  started(): void;
  /** Menu key handling (menu-flow.js `handleKey`); returns true when the key was consumed. */
  handleKey(event: KeyboardEvent): boolean;
  hide(): void;
  debug(): MenuDebug;
  /** Local (offline) practice flag for the engine options. */
  practice(): boolean;
  /** Skip setup and intro and start a match now (the live toolbar's Quick Match and Smash Lab). */
  quickStart(mode: MenuMode, settings?: Partial<MenuSettings>): void;
}

export function createMenu(deps: MenuDeps): Menu {
  const machine = createMenuMachine({ reducedMotion });
  const storage = deps.storage ?? (() => { try { return window.localStorage; } catch { return undefined; } })();
  const startHandlers: Array<Parameters<MenuPort["onStart"]>[0]> = [];
  const settingsHandlers: Array<Parameters<MenuPort["onSettingsChange"]>[0]> = [];
  let selected: MenuSettings = { venue: "hard", difficulty: "beginner" };
  let playerName = "";
  try { playerName = (storage?.getItem(PLAYER_NAME_KEY) || "").trim().slice(0, 20); } catch { /* storage unavailable */ }
  const nameInput = byId<HTMLInputElement>("player-name");
  nameInput.value = playerName;

  const focus = (id: string): void => { maybeById(id)?.focus({ preventScroll: true }); };
  const practice = (): boolean => machine.mode === "practice";

  function names(): ScoreboardNames {
    return { player: playerName || "PLAYER", ai: practice() ? "COACH" : "CPU" };
  }

  function validatePlayerName(): boolean {
    const name = nameInput.value.trim().replace(/\s+/g, " ").slice(0, 20);
    nameInput.setCustomValidity(name ? "" : "Enter your name to play.");
    if (!nameInput.reportValidity()) { nameInput.focus(); return false; }
    playerName = name;
    nameInput.value = name;
    try { storage?.setItem(PLAYER_NAME_KEY, name); } catch { /* storage unavailable */ }
    return true;
  }

  function applySettings(next: MenuSettings): void {
    selected = { ...next };
    const theme = themeFor(selected.venue);
    document.documentElement.style.setProperty("--venue-accent", theme.accent);
    byId("venue-eyebrow").textContent = `${theme.name} · ${theme.surface}`;
    document.querySelectorAll<HTMLButtonElement>(".venue-btn").forEach((button) => {
      const on = button.dataset.venue === selected.venue;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    document.querySelectorAll<HTMLButtonElement>(".difficulty-btn").forEach((button) => {
      const on = button.dataset.difficulty === selected.difficulty;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    const hint = byId("pro-hint");
    const strategic = selected.difficulty === "pro" || selected.difficulty === "legend";
    hint.hidden = !strategic;
    hint.textContent = selected.difficulty === "legend" ? "Elite opponents close openings faster and punish repeated patterns." : "Use depth and angles to create an opening.";
  }

  function allowsVenue(id: string): boolean {
    return MENU_COURTS.some((court) => court.venue === id) && (REGULAR_VENUES.has(id) || machine.screen === "home" || machine.mode === "single" || machine.mode === "practice");
  }

  function selectVenue(id: string): void {
    if (!allowsVenue(id)) return;
    applySettings({ ...selected, venue: id });
    deps.settingsChanged(selected);
    for (const h of settingsHandlers) h({ venue: selected.venue, difficulty: selected.difficulty });
  }
  function selectDifficulty(id: string): void {
    applySettings({ ...selected, difficulty: id as MenuSettings["difficulty"] });
    deps.settingsChanged(selected);
    for (const h of settingsHandlers) h({ venue: selected.venue, difficulty: selected.difficulty });
  }

  function setScreen(next: MenuScreen): void {
    setVisible(byId("menu-home"), next === "home");
    setVisible(byId("menu-setup"), next === "setup");
    setVisible(byId("match-intro"), next === "intro");
    const onMenu = next === "home" || next === "setup";
    const menu = byId("menu");
    menu.classList.toggle("hidden", !onMenu);
    setInert(menu, !onMenu);
    menu.setAttribute("aria-hidden", String(!onMenu));
    menu.scrollTop = 0;
  }

  function setSingleStep(step: "player" | "court", restoreFocus = true): void {
    const player = step === "player";
    byId("menu-setup").dataset.singleStep = step;
    setVisible(byId("setup-personalize"), player);
    setVisible(byId("venue-block"), !player);
    setVisible(byId("setup-next"), player);
    setVisible(byId("start-btn"), !player);
    setVisible(byId("local-format"), !player);
    byId("setup-title").textContent = player ? "CHOOSE YOUR PLAYER." : "CHOOSE YOUR COURT.";
    byId("setup-description").textContent = player
      ? "Enter your name, then choose your opponent level." : "Find your favorite surface or take the match somewhere new.";
    byId("setup-back").textContent = player ? "All modes" : "Back to players";
    byId("start-btn").querySelector("span")!.textContent = "PLAY";
    byId("difficulty-block").querySelector(".option-label")!.textContent = "Choose your level";
    byId("court-option-label").textContent = "Choose your court";
    document.querySelectorAll<HTMLElement>("[data-single-step-label]").forEach((label) => {
      const active = label.dataset.singleStepLabel === step;
      label.classList.toggle("current-step", active);
      if (active) label.setAttribute("aria-current", "step"); else label.removeAttribute("aria-current");
    });
    byId("menu").scrollTop = 0;
    if (restoreFocus) focus("setup-title");
  }

  function rememberChoices(): void { machine.remember(selected); }

  function setup(mode: MenuMode, step: "player" | "court" = "player"): void {
    rememberChoices();
    closeHelp();
    machine.setup(mode, step);
    deps.prepareIntro();
    const result = byId("result");
    result.classList.add("hidden"); setInert(result, true); result.setAttribute("aria-hidden", "true");
    setScreen("setup");
    const single = mode === "single";
    setVisible(byId("setup-personalize"), true);
    setVisible(byId("setup-next"), false);
    setVisible(byId("start-btn"), true);
    setVisible(byId("local-format"), true);
    setVisible(byId("single-setup-progress"), single);
    setVisible(byId("standard-setup-progress"), !single);
    delete byId("menu-setup").dataset.singleStep;
    byId("difficulty-block").querySelector(".option-label")!.textContent = "01 / Choose your challenge";
    byId("setup-kicker").textContent = single ? "SINGLE GAME" : "PRACTICE / SMASH LAB";
    byId("setup-title").textContent = single ? "MAKE IT YOUR GAME." : "OWN THE OVERHEAD.";
    byId("setup-description").textContent = single
      ? "Enter your name, then pick your opponent level and court."
      : "Choose your court. A coach feeds varied high lobs so you can train movement, timing and power.";
    byId("menu").dataset.selectedMode = mode;
    setVisible(byId("player-entry"), true);
    setVisible(byId("difficulty-block"), single);
    setVisible(byId("venue-block"), true);
    setVisible(byId("destination-arenas"), true);
    document.querySelectorAll<HTMLButtonElement>("#destination-arenas .venue-btn").forEach((button) => { button.disabled = false; });
    setVisible(byId("regular-courts-label"), true);
    setVisible(byId("local-start"), true);
    byId("court-option-label").textContent = "02 / Choose your court";
    byId("start-btn").querySelector("span")!.textContent = single ? "STEP ON COURT" : "START SMASH DRILL";
    byId("local-format").textContent = single
      ? "First to 3 games · win by 2 · tiebreak at 3–3" : "Endless high lobs · manual movement and timing · pause to exit";
    const choices = machine.settingsFor(mode);
    applySettings(choices);
    deps.settingsChanged(selected);
    byId("setup-back").textContent = "All modes";
    if (single) setSingleStep(step, false);
    focus(!nameInput.value.trim() ? "player-name" : "setup-title");
  }

  function home(restoreFocus = true): void {
    rememberChoices();
    closeHelp();
    machine.home();
    deps.prepareIntro();
    setScreen("home");
    const single = machine.settingsFor("single");
    applySettings(single);
    deps.settingsChanged(selected);
    if (restoreFocus) focus(`mode-${machine.mode}`);
  }

  function introduce(): void {
    closeHelp();
    const court = MENU_COURTS.find((c) => c.venue === selected.venue) ?? MENU_COURTS[0]!;
    const intro = byId("match-intro");
    intro.dataset.arena = court.venue;
    intro.dataset.destination = String(Boolean(court.destination));
    byId("intro-round").textContent = practice() ? "PRACTICE / SMASH LAB" : "SINGLE GAME / YOUR COURT AWAITS";
    byId("intro-title").textContent = court.city;
    byId("intro-surface").textContent = court.surface;
    intro.querySelector(".intro-topline>span")!.textContent = "AURA SLAM";
    const n = names();
    byId("intro-player").textContent = n.player;
    byId("intro-opponent").textContent = n.ai;
    byId("intro-stakes").textContent = practice()
      ? "Endless high lobs. Move under the ball and press hit before contact." : "First to 3 games, win by 2. Tiebreak at 3–3.";
    machine.introduce();
    byId("intro-progress-fill").style.transform = "scaleX(0)";
    const result = byId("result");
    result.classList.add("hidden"); setInert(result, true); result.setAttribute("aria-hidden", "true");
    deps.prepareIntro();
    setScreen("intro");
    focus("intro-skip");
  }

  function play(): void {
    if (!machine.play()) return;
    setScreen("playing");
    const options = { difficulty: selected.difficulty, venue: selected.venue, practice: practice(), online: false as const };
    for (const h of startHandlers) h(options);
    deps.startMatch(options);
  }

  function launch(): void {
    if (machine.screen === "home") { setup("single"); return; }
    if (machine.screen === "intro") { play(); return; }
    if (machine.screen !== "setup") return;
    if (machine.mode === "single" && machine.singleStep === "player") { nextSingleStep(); return; }
    if (!validatePlayerName()) return;
    rememberChoices();
    introduce();
  }

  function nextSingleStep(): void {
    if (machine.screen !== "setup" || machine.mode !== "single" || machine.singleStep !== "player") return;
    if (!validatePlayerName()) return;
    rememberChoices();
    machine.nextSingleStep();
    setSingleStep("court");
  }
  function backFromSetup(): void {
    if (machine.mode === "single" && machine.singleStep === "court") { machine.backFromSetup(); setSingleStep("player"); }
    else home();
  }
  function returnToSetup(): void { setup(machine.mode, machine.mode === "single" ? "court" : "player"); }

  function tick(dt: number): void {
    if (machine.screen !== "intro") return;
    const finished = machine.tick(dt, document.hidden);
    byId("intro-progress-fill").style.transform = `scaleX(${1 - machine.introRemaining / machine.introDuration})`;
    if (finished) {
      setScreen("playing");
      const options = { difficulty: selected.difficulty, venue: selected.venue, practice: practice(), online: false as const };
      for (const h of startHandlers) h(options);
      deps.startMatch(options);
    }
  }

  function complete(_won: boolean): void {
    machine.complete();
    byId("result").querySelector(".eyebrow")!.textContent = "MATCH COMPLETE";
    byId("rematch-btn").querySelector("b")!.textContent = "R";
    byId("result-menu-btn").textContent = "Back to all modes";
    byId("rematch-btn").querySelector("span")!.textContent = "PLAY AGAIN";
  }

  function replay(): void {
    if (machine.screen !== "result") return;
    introduce();
  }

  function hide(): void {
    machine.closeHelp();
    setVisible(byId("match-intro"), false);
  }

  function closeHelp(): void {
    if (!machine.helpOpen) return;
    machine.closeHelp();
    setVisible(byId("how-to-play"), false);
    byId("how-to-play-toggle").setAttribute("aria-expanded", "false");
    for (const id of ["menu-home", "menu-setup"]) setInert(byId(id), byId(id).hidden);
    helpFocus?.focus({ preventScroll: true });
  }
  let helpFocus: HTMLElement | null = null;
  function openHelp(): void {
    deps.refreshLabels?.();
    helpFocus = document.activeElement as HTMLElement | null;
    machine.openHelp();
    setVisible(byId("how-to-play"), true);
    byId("how-to-play-toggle").setAttribute("aria-expanded", "true");
    setInert(byId("menu-home"), true); setInert(byId("menu-setup"), true);
    focus("controls-close");
  }

  function handleKey(event: KeyboardEvent): boolean {
    if (!["home", "setup", "intro"].includes(machine.screen)) return false;
    if (machine.helpOpen) {
      if (event.code === "Escape") { event.preventDefault(); closeHelp(); }
      if (event.code === "Tab") { event.preventDefault(); focus("controls-close"); }
      return true;
    }
    if (event.code === "Escape") {
      event.preventDefault();
      if (machine.screen === "intro") returnToSetup();
      else if (machine.screen === "setup") backFromSetup();
      return true;
    }
    const native = (event.target as Element | null)?.closest?.("button,input,a,summary");
    if (event.code === "Space" && !native) {
      event.preventDefault();
      if (!event.repeat) launch();
      return true;
    }
    if (event.code === "KeyF") return false;
    return true;
  }

  document.querySelectorAll<HTMLButtonElement>(".mode-choice").forEach((button) => {
    if (button.disabled) return;
    button.addEventListener("click", () => setup(button.dataset.mode as MenuMode));
  });
  byId("setup-back").addEventListener("click", backFromSetup);
  byId("setup-next").addEventListener("click", nextSingleStep);
  byId("intro-skip").addEventListener("click", play);
  byId("intro-back").addEventListener("click", returnToSetup);
  byId("how-to-play-toggle").addEventListener("click", openHelp);
  byId("controls-close").addEventListener("click", closeHelp);
  document.querySelectorAll<HTMLButtonElement>(".difficulty-btn").forEach((button) =>
    button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty as string)));
  document.querySelectorAll<HTMLButtonElement>(".venue-btn").forEach((button) =>
    button.addEventListener("click", () => selectVenue(button.dataset.venue as string)));
  nameInput.addEventListener("input", () => {
    nameInput.setCustomValidity("");
    try { storage?.setItem(PLAYER_NAME_KEY, nameInput.value.trim().replace(/\s+/g, " ").slice(0, 20)); } catch { /* storage unavailable */ }
  });
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); launch(); }
  });
  byId("start-btn").addEventListener("click", launch);
  byId("rematch-btn").addEventListener("click", replay);
  byId("result-menu-btn").addEventListener("click", () => home());
  document.querySelectorAll<HTMLElement>("[data-control-settings]").forEach((button) =>
    button.addEventListener("click", () => deps.openControlSettings?.()));

  applySettings(selected);
  home(false);
  const linked = new URLSearchParams(window.location.search).get("mode");
  if (linked === "single" || linked === "practice") setup(linked);

  function quickStart(mode: MenuMode, settings: Partial<MenuSettings> = {}): void {
    const next = { ...machine.settingsFor(mode), ...settings };
    machine.setup(mode);
    machine.started();
    setScreen("playing");
    applySettings(next);
    deps.settingsChanged(selected);
    const options = { difficulty: selected.difficulty, venue: selected.venue, practice: practice(), online: false as const };
    for (const h of startHandlers) h(options);
    deps.startMatch(options);
  }

  const menu: Menu = {
    machine, names, validatePlayerName, settings: () => ({ ...selected }), selectVenue, selectDifficulty, launch, replay, home, setup, tick, complete,
    started: () => { machine.started(); setScreen("playing"); },
    handleKey, hide, practice, quickStart, debug: () => machine.debug(),
    onStart(handler) { startHandlers.push(handler); },
    onSettingsChange(handler) { settingsHandlers.push(handler); }
  };
  return menu;
}
