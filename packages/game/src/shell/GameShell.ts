/**
 * §6.2/§7.2 GameShell — DOM layers, session state machine, and menus.
 * Layers: `.a3g-canvas` (route-owned), `.a3g-overlay`, `.a3g-hud`,
 * `.a3g-touch`, `.a3g-menus`, `.a3g-toasts`, `.a3g-dev`.
 *
 * State machine: booting → loading → title → playing ⇄ paused → results,
 * plus `transitioning` and `context-lost`; `data-state` on the root drives
 * menu visibility, and `window.__AURA3D_GAME__.state` exposes it (§6.5).
 */
import type { HudDocument, HudElement, HudScheduler } from "../hud/dom.js";
import { rafScheduler } from "../hud/dom.js";
import { createLoadingScreen } from "./screens/Loading.js";
import { createTitleScreen } from "./screens/Title.js";
import { createPauseMenu, type PauseMenuItem } from "./screens/Pause.js";
import { createSettingsMenu, type SettingsActions, type SettingsStorage } from "./screens/Settings.js";
import { createResultsMenu, type ResultsSpec } from "./screens/Results.js";
import { createAboutMenu } from "./screens/About.js";
import { createContextLostScreen } from "./screens/ContextLost.js";
import { runTransition, type TransitionSpec, type TransitionDriver } from "./transition.js";
import type { MenuKeyEvent } from "./screens/menu.js";

export type GameSessionState =
  | "booting" | "loading" | "title" | "playing" | "paused" | "results"
  | "transitioning" | "context-lost" | "disposed";

export interface GameShellOptions {
  readonly layout?: "full-bleed" | "letterbox-16x9" | "letterbox-4x3";
  readonly loading?: { readonly tips?: readonly string[]; readonly minMs?: number; readonly art?: string } | false;
  readonly title?: {
    readonly art?: string;
    readonly subtitle?: string;
    readonly prompt?: string;
    readonly attractCameraPose?: string;
  } | false;
  readonly pause?: {
    readonly keys?: readonly string[];
    readonly autoOnHidden?: boolean;
    readonly autoOnBlur?: boolean;
    readonly items?: readonly PauseMenuItem[];
  };
  readonly results?: ResultsSpec | false;
  readonly settings?: { audio?: boolean; accessibility?: boolean; controls?: boolean; quality?: boolean };
  readonly about?: { readonly html: string } | false;
  readonly strings?: Partial<Record<ShellStringKey, string>>;
}

export type ShellStringKey =
  | "loading" | "titlePrompt" | "paused" | "resume" | "restart" | "settings"
  | "about" | "quitToTitle" | "results" | "retry" | "next" | "contextLost";

export interface PauseMenuItemLike extends PauseMenuItem {}

export interface GameShellDeps {
  readonly root: HudElement;           // `.a3g-root` element
  readonly doc: HudDocument;
  readonly gameId: string;
  readonly options?: GameShellOptions;
  readonly title: string;
  /** Called when the title gesture fires — unlock audio, then start play. */
  readonly onStart: () => void | Promise<void>;
  readonly onRestart?: () => void;
  readonly onQuitToTitle?: () => void;
  readonly firstPresentedFrame?: () => Promise<void>;
  readonly transitionDriver?: TransitionDriver;
  readonly settings?: SettingsActions;
  readonly storage?: SettingsStorage;
  readonly pauseKeys?: readonly string[];
  readonly schedule?: HudScheduler;
  readonly now?: () => number;
  readonly setTimer?: (cb: () => void, ms: number) => { cancel(): void };
}

export interface GameShell {
  readonly state: GameSessionState;
  showResults(values: Readonly<Record<string, number>>): Promise<"retry" | "title" | "next">;
  transition<T>(run: () => T | Promise<T>, spec?: TransitionSpec): Promise<T>;
  openMenu(id: "pause" | "settings" | "about"): void;
  closeMenus(): void;
  setLoadingProgress(fraction: number, label?: string): void;
  track(promise: Promise<unknown>, weight: number): void;
  keydown(ev: MenuKeyEvent): boolean;
  /** Called by wiring on device lost/restored. */
  deviceLost(): void;
  deviceRestored(): void;
  /** session 'context-lost' menu element (for `wireContextLoss`). */
  readonly contextLostScreen: ReturnType<typeof createContextLostScreen>;
  beginLoading(): void;
  finishLoading(): Promise<void>;
  dispose(): void;
}

interface Tracked { promise: Promise<unknown>; weight: number; settled: boolean }

export function createGameShell(deps: GameShellDeps): GameShell {
  const { doc, root } = deps;
  const opts = deps.options ?? {};
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((cb: () => void, ms: number) => {
    const id = setTimeout(cb, ms);
    return { cancel: () => clearTimeout(id) };
  });

  let state: GameSessionState = "booting";
  let signalDisposed!: () => void;
  const disposedSignal = new Promise<void>((resolve) => { signalDisposed = resolve; });
  const disposedError = () => new Error("GAME_SHELL_DISPOSED: The game shell is disposed.");
  const waitWhileOpen = <T>(pending: Promise<T>): Promise<T> => {
    if (state === "disposed") return Promise.reject(disposedError());
    return Promise.race([pending, disposedSignal.then(() => { throw disposedError(); })]);
  };
  const setState = (s: GameSessionState) => {
    if (state === "disposed") return;
    state = s;
    root.dataset.state = s;
  };

  // ---- menus layer ------------------------------------------------------
  const menusHost = doc.createElement("div");
  menusHost.className = "a3g-menus";
  root.appendChild(menusHost);

  const toasts = doc.createElement("div");
  toasts.className = "a3g-toasts";
  root.appendChild(toasts);

  const loading = createLoadingScreen(doc, opts.loading);
  menusHost.appendChild(loading.el);

  const openMenuSet = new Set<"pause" | "settings" | "about">();

  const pauseMenu = createPauseMenu(doc, {
    items: opts.pause?.items,
    onAction: (id) => {
      switch (id) {
        case "resume": shell.closeMenus(); break;
        case "restart": deps.onRestart?.(); break;
        case "settings": shell.openMenu("settings"); break;
        case "about": shell.openMenu("about"); break;
        case "quit-to-title": deps.onQuitToTitle?.(); break;
      }
    }
  });
  pauseMenu.onClose = () => shell.closeMenus();
  menusHost.appendChild(pauseMenu.el);

  const settingsMenu = createSettingsMenu(doc, {
    gameId: deps.gameId,
    storage: deps.storage,
    actions: deps.settings ?? {},
    sections: opts.settings,
    onClose: () => shell.closeMenus()
  });
  menusHost.appendChild(settingsMenu.el);

  const aboutMenu = opts.about
    ? createAboutMenu(doc, { html: opts.about.html, onClose: () => shell.closeMenus() })
    : null;
  if (aboutMenu) menusHost.appendChild(aboutMenu.el);

  const contextLostScreen = createContextLostScreen(doc, {
    onReload: () => deps.onRestart?.(),
    now,
    setTimer
  });
  menusHost.appendChild(contextLostScreen.el);

  // Title doubles as the audio-unlock surface: the start gesture resolves
  // `onStart` (routes wire it to audio.unlock() + session start).
  const title = opts.title === false
    ? null
    : createTitleScreen(doc, {
        title: deps.title,
        subtitle: opts.title?.subtitle,
        prompt: opts.title?.prompt,
        art: opts.title?.art,
        onStart: () => {
          if (state === "disposed") return;
          void deps.onStart();
          title?.hide();
          setState("playing"); // §6.2 title → playing on the start gesture
        }
      });
  if (title) menusHost.appendChild(title.el);

  let resultsResolve: ((a: "retry" | "title" | "next") => void) | null = null;
  let resultsReject: ((error: Error) => void) | null = null;
  let resultsPending: Promise<"retry" | "title" | "next"> | null = null;
  const resultsMenu: ReturnType<typeof createResultsMenu> | null = opts.results
    ? createResultsMenu(doc, {
        spec: opts.results,
        storage: deps.storage,
        bestKey: `a3g:${deps.gameId}:best:v1`,
        onAction: (action) => {
          const resolve = resultsResolve;
          if (!resolve) return;
          resultsResolve = null;
          resultsReject = null;
          resultsPending = null;
          resultsMenu?.hide();
          resolve(action);
        }
      })
    : null;
  if (resultsMenu) menusHost.appendChild(resultsMenu.el);

  // ---- loading progress --------------------------------------------------
  const tracked: Tracked[] = [];
  let manualFraction: number | null = null;
  const progress = () => {
    const total = tracked.reduce((s, t) => s + t.weight, 0);
    const settled = tracked.reduce((s, t) => s + (t.settled ? t.weight : 0), 0);
    return total > 0 ? Math.min(1, Math.max(manualFraction ?? 0, settled / total)) : (manualFraction ?? 0);
  };
  const repaintProgress = (label?: string) => {
    if (state !== "disposed") loading.setProgress(progress(), label);
  };

  const shell: GameShell = {
    get state() { return state; },
    contextLostScreen,

    beginLoading() {
      if (state === "disposed") return;
      setState("loading");
      if (opts.loading !== false) loading.show();
    },

    async finishLoading() {
      if (state === "disposed") throw disposedError();
      const minMs = opts.loading === false ? 0 : (opts.loading?.minMs ?? 400);
      let timer: { cancel(): void } | undefined;
      let timerFinished = false;
      try {
        if (minMs > 0) {
          await waitWhileOpen(new Promise<void>((resolve) => {
            timer = setTimer(() => { timerFinished = true; resolve(); }, minMs);
          }));
        }
      } finally {
        if (!timerFinished) timer?.cancel();
      }
      // Wait for every currently-tracked promise (settle is recorded via .then).
      await waitWhileOpen(Promise.all(tracked.map((t) => t.promise.catch(() => {}))));
      repaintProgress("Ready");
      // Fade out only after the first presented frame of the play scene (§6.2).
      await waitWhileOpen(deps.firstPresentedFrame?.() ?? Promise.resolve());
      loading.hide();
      if (title) {
        title.show();
        setState("title");
      } else {
        setState("playing");
      }
    },

    showResults(values) {
      if (state === "disposed") return Promise.reject(disposedError());
      if (!resultsMenu || resultsMenu.items.length === 0) return Promise.reject(new Error("GAME_RESULTS_UNAVAILABLE: Configure a results screen with an action before showing results."));
      if (resultsPending) return resultsPending;
      resultsMenu.setResults(values);
      setState("results");
      const pending = new Promise<"retry" | "title" | "next">((resolve, reject) => {
        resultsResolve = resolve;
        resultsReject = reject;
      });
      resultsPending = pending;
      resultsMenu.show();
      return pending;
    },

    async transition(run, spec) {
      if (state === "disposed") throw disposedError();
      const prev = state;
      setState("transitioning");
      const driver = deps.transitionDriver;
      try {
        if (!driver) return await run();
        return await runTransition(driver, run, spec);
      } finally {
        setState(prev);
      }
    },

    openMenu(id) {
      if (state === "disposed") return;
      openMenuSet.add(id);
      if (state === "playing") setState("paused");
      if (id === "pause") { settingsMenu.hide(); aboutMenu?.hide(); pauseMenu.show(); }
      if (id === "settings") { pauseMenu.hide(); aboutMenu?.hide(); settingsMenu.show(); }
      if (id === "about" && aboutMenu) { pauseMenu.hide(); settingsMenu.hide(); aboutMenu.show(); }
    },

    closeMenus() {
      if (state === "disposed") return;
      openMenuSet.clear();
      pauseMenu.hide();
      settingsMenu.hide();
      aboutMenu?.hide();
      if (state === "paused" || state === "transitioning") setState("playing");
      if (state === "context-lost") return; // stays paused per §6.2
    },

    setLoadingProgress(fraction, label) {
      manualFraction = Math.min(1, Math.max(0, fraction));
      repaintProgress(label);
    },

    track(promise, weight) {
      const t: Tracked = { promise, weight, settled: false };
      tracked.push(t);
      promise.then(() => { t.settled = true; repaintProgress(); }, () => { t.settled = true; repaintProgress(); });
      repaintProgress();
    },

    keydown(ev) {
      if (state === "disposed") return false;
      if (contextLostScreen.visible) return ev.key === "Escape";
      if (title?.visible && title.keydown()) return true;
      for (const m of [resultsMenu, settingsMenu, aboutMenu, pauseMenu]) {
        if (m && m.visible && m.keydown(ev)) return true;
      }
      const pauseKeys = deps.pauseKeys ?? opts.pause?.keys ?? ["Escape", "KeyP"];
      if (state === "playing" && pauseKeys.includes(ev.key)) {
        ev.preventDefault();
        shell.openMenu("pause");
        return true;
      }
      return false;
    },

    deviceLost() {
      setState("context-lost");
    },

    deviceRestored() {
      setState("paused"); // player resumes explicitly
    },

    dispose() {
      if (state === "disposed") return;
      setState("disposed");
      signalDisposed();
      resultsReject?.(disposedError());
      resultsResolve = null;
      resultsReject = null;
      resultsPending = null;
      loading.dispose();
      title?.dispose();
      resultsMenu?.dispose();
      pauseMenu.dispose();
      settingsMenu.dispose();
      aboutMenu?.dispose();
      contextLostScreen.dispose();
      menusHost.remove();
      toasts.remove();
    }
  };
  return shell;
}
