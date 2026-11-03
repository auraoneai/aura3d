/**
 * components.ts — interim C-24 shell/HUD/FX members.
 *
 * The shell uses the existing loading and results screens. The interim HUD
 * keeps its values inspectable via snapshot(), and the interim FX layer
 * carries the "primitive-pool" backend label.
 */

import type {
  GameShell,
  Hud,
  GameFxLayer,
  TransitionSpec
} from "@aura3d/engine";
import type { AuraVec3 } from "@aura3d/engine";
import type { HudDocument, HudElement } from "./hud/dom";
import type { GameSessionImpl } from "./session/GameSession";
import { createLoadingScreen } from "./shell/screens/Loading";
import { createResultsMenu } from "./shell/screens/Results";
import { runTransition, type TransitionDriver } from "./shell/transition";

interface LoadingRegion {
  readonly element: HudElement;
  users: number;
}

// Keep the existing fallback indicators distinct and stacked rather than
// attaching one game's progress to another game's target.
const loadingRegions = new WeakMap<HudDocument, LoadingRegion>();

function acquireLoadingRegion(doc: HudDocument): { host: HudElement; release(): void } {
  let region = loadingRegions.get(doc);
  if (!region) {
    const element = doc.createElement("div");
    element.className = "a3g-loading-region";
    element.style.position = "fixed";
    element.style.right = "12px";
    element.style.bottom = "12px";
    element.style.zIndex = "50";
    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.style.gap = "8px";
    element.style.width = "min(18rem, calc(100vw - 24px))";
    element.style.pointerEvents = "none";
    element.style.fontFamily = "var(--a3g-font)";
    doc.body.appendChild(element);
    region = { element, users: 0 };
    loadingRegions.set(doc, region);
  }
  region.users += 1;
  const owned = region;
  let released = false;
  return {
    host: owned.element,
    release() {
      if (released) return;
      released = true;
      owned.users -= 1;
      if (owned.users === 0) {
        loadingRegions.delete(doc);
        owned.element.remove();
      }
    }
  };
}

interface LoadingProgressState {
  manualFraction: number | null;
  totalWeight: number;
  settledWeight: number;
  disposed: boolean;
  view?: {
    readonly screen: ReturnType<typeof createLoadingScreen>;
    readonly meter: HudElement;
    readonly unsubscribe: () => void;
    readonly release: () => void;
  };
}

function repaintLoading(state: LoadingProgressState, label?: string): void {
  const view = state.view;
  if (!view || state.disposed) return;
  const tracked = state.totalWeight > 0 ? state.settledWeight / state.totalWeight : 0;
  const fraction = Math.min(1, Math.max(state.manualFraction ?? 0, tracked));
  view.screen.setProgress(fraction, label);
  view.meter.setAttribute("value", String(fraction));
  view.meter.setAttribute("aria-label", view.screen.label.textContent || "Loading");
}

function disposeLoading(state: LoadingProgressState): void {
  state.disposed = true;
  const view = state.view;
  state.view = undefined;
  if (!view) return;
  try {
    view.unsubscribe();
  } finally {
    try {
      view.screen.dispose();
    } finally {
      view.release();
    }
  }
}

type ResultsAction = "retry" | "title" | "next";
type ResultsMenu = ReturnType<typeof createResultsMenu>;

interface ResultsMount {
  readonly doc: HudDocument;
  readonly root: HudElement | (() => HudElement | null);
  /** A canvas cannot contain visible DOM; size its sibling to its viewport rect. */
  readonly canvas?: HudElement;
}

type ResolvedResultsMount = Omit<ResultsMount, "root"> & { readonly root: HudElement };

interface PendingResults {
  cancel(reason: unknown): readonly unknown[];
}

function gameDisposedError(): Error {
  return new Error("GAME_DISPOSED_V1: This game has been disposed; create a new game to continue.");
}

function resultsUnavailableError(): Error {
  return new Error(
    "GAME_SHELL_RESULTS_UNAVAILABLE_V1: Results need a connected DOM game target. " +
    "Mount the game in a browser or handle results yourself in a headless host."
  );
}

function resultsInterruptedError(state: string): Error {
  return new Error(`GAME_SHELL_RESULTS_INTERRUPTED_V1: The session changed to "${state}" before a results action was chosen.`);
}

/** Give the existing menu a usable, themed fallback when a route has no shell CSS. */
function styleResultsMenu(menu: ResultsMenu): void {
  const wrap = menu.el;
  wrap.style.width = "min(100%, 24rem)";
  wrap.style.maxHeight = "100%";
  wrap.style.overflowY = "auto";
  const panel = wrap.children[0];
  panel.style.boxSizing = "border-box";
  panel.style.padding = "16px";
  panel.style.background = "var(--a3g-bg, #0b0d12)";
  panel.style.color = "var(--a3g-fg, #f4f6fb)";
  panel.style.border = "1px solid var(--a3g-edge, #526070)";
  panel.style.borderRadius = "var(--a3g-radius, 8px)";
  panel.style.display = "grid";
  panel.style.gap = "12px";
  for (const child of Array.from(panel.children)) {
    if (child.tagName.toLowerCase() === "h2") {
      child.style.margin = "0";
      child.style.fontSize = "20px";
      child.style.lineHeight = "1.2";
      child.style.fontWeight = "500";
    }
    if (String(child.className).includes("a3g-results")) {
      child.style.margin = "0";
      child.style.padding = "0";
      child.style.listStyle = "none";
      child.style.display = "grid";
      child.style.gap = "4px";
      for (const row of Array.from(child.children)) {
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.gap = "16px";
        row.style.overflowWrap = "anywhere";
        const value = row.children[1];
        if (value) {
          value.style.textAlign = "right";
          value.style.fontVariantNumeric = "tabular-nums";
        }
      }
    }
    if (String(child.className).includes("a3g-menu-items")) {
      child.style.margin = "0";
      child.style.padding = "0";
      child.style.listStyle = "none";
      child.style.display = "flex";
      child.style.flexWrap = "wrap";
      child.style.gap = "8px";
    }
  }
  for (const button of menu.items) {
    button.setAttribute("type", "button");
    button.style.minHeight = "44px";
    button.style.padding = "8px 12px";
    button.style.border = "1px solid var(--a3g-edge, #526070)";
    button.style.borderRadius = "var(--a3g-radius, 8px)";
    button.style.background = "transparent";
    button.style.color = "inherit";
    button.style.fontFamily = "inherit";
    button.style.fontSize = "13px";
    button.style.fontWeight = "500";
    button.style.cursor = "pointer";
  }
}

/** Size an app-owned overlay without changing the target or its parent's styles. */
function sizeResultsHost(mount: ResolvedResultsMount, host: HudElement): () => void {
  const view = (mount.doc as unknown as { defaultView?: (Window & typeof globalThis) | null }).defaultView;
  let rootPosition: string | undefined;
  let rootContainsAbsolute = false;
  if (!mount.canvas && mount.root !== mount.doc.body) {
    const style = view?.getComputedStyle?.(mount.root as unknown as Element);
    rootPosition = style?.position;
    // A transform or containment can establish the containing block even when
    // the element's position is static; preserve its existing local overlay.
    rootContainsAbsolute = !!style && (
      [style.transform, style.perspective, style.filter, style.backdropFilter]
        .some((value) => !!value && value !== "none") ||
      /\b(layout|paint|strict|content)\b/.test(style.contain) ||
      /\b(transform|perspective|filter|backdrop-filter)\b/.test(style.willChange)
    );
  }
  // A static container without another containing-block property needs a
  // viewport-rect anchor, as for a canvas, without mutating shared styles.
  const anchor = mount.canvas ??
    (mount.root !== mount.doc.body && !rootContainsAbsolute && (!rootPosition || rootPosition === "static")
      ? mount.root
      : undefined);
  if (!anchor) {
    host.style.position = mount.root === mount.doc.body ? "fixed" : "absolute";
    host.style.inset = "0";
    return () => {};
  }
  host.style.position = "fixed";
  const update = () => {
    const rect = anchor.getBoundingClientRect();
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.width = `${rect.width}px`;
    host.style.height = `${rect.height}px`;
  };
  update();
  let observer: ResizeObserver | undefined;
  let listening = false;
  const cleanup = () => {
    try {
      observer?.disconnect();
    } finally {
      if (listening) {
        try {
          view?.removeEventListener("resize", update);
        } finally {
          view?.removeEventListener("scroll", update, true);
        }
      }
    }
  };
  try {
    if (view) {
      view.addEventListener("resize", update);
      listening = true;
      view.addEventListener("scroll", update, true);
      if (typeof view.ResizeObserver === "function") {
        observer = new view.ResizeObserver(update);
        observer.observe(anchor as unknown as Element);
      }
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}

export class GameShellImpl implements GameShell {
  private readonly loading: LoadingProgressState = {
    manualFraction: null,
    totalWeight: 0,
    settledWeight: 0,
    disposed: false
  };
  private pendingResults?: PendingResults;

  /**
   * `transitionDriver` (DOM `.a3g-overlay` fade, §6.2) makes `transition()`
   * cover the remount gap; without one (node/tests) it runs straight through.
   */
  public constructor(
    private readonly session: GameSessionImpl,
    private readonly transitionDriver?: TransitionDriver,
    private readonly resultsMount?: ResultsMount
  ) {}

  public get state() {
    return this.session.state;
  }

  /** The chosen action is a signal; the caller owns navigation, reset, and restart. */
  public showResults(values: Readonly<Record<string, number>>): Promise<ResultsAction> {
    if (this.loading.disposed || this.session.state === "disposed") return Promise.reject(gameDisposedError());
    if (this.pendingResults) {
      return Promise.reject(new Error("GAME_SHELL_RESULTS_IN_PROGRESS_V1: A results screen is already awaiting an action."));
    }
    const configuredMount = this.resultsMount;
    let root: HudElement | null | undefined;
    try {
      root = typeof configuredMount?.root === "function" ? configuredMount.root() : configuredMount?.root;
    } catch (error) {
      return Promise.reject(error);
    }
    const mount: ResolvedResultsMount | undefined = configuredMount && root
      ? { doc: configuredMount.doc, root, canvas: configuredMount.canvas }
      : undefined;
    if (!mount || (mount.root as HudElement & { isConnected?: boolean }).isConnected === false ||
      (mount.canvas as (HudElement & { isConnected?: boolean }) | undefined)?.isConnected === false) {
      return Promise.reject(resultsUnavailableError());
    }
    const initialState = this.session.state;
    if (initialState !== "playing" && initialState !== "results") {
      return Promise.reject(new Error(`GAME_SESSION_ILLEGAL_TRANSITION:${initialState}->results`));
    }

    let resolve!: (action: ResultsAction) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<ResultsAction>((yes, no) => { resolve = yes; reject = no; });
    const cleanups: Array<() => void> = [];
    let done = false;
    let attemptedTransition = false;
    let menu: ResultsMenu | undefined;
    let previousFocus: { focus?: () => void; isConnected?: boolean } | null | undefined;
    const focusDoc = mount.doc as HudDocument & {
      readonly activeElement?: ({ focus?: () => void; isConnected?: boolean } | null);
    };

    const finish = (
      outcome: { action: ResultsAction } | { error: unknown },
      rollback = false
    ): readonly unknown[] => {
      if (done) return [];
      done = true;
      let restoreFocus = false;
      try {
        const active = focusDoc.activeElement;
        const element = menu?.el as (HudElement & { contains?: (node: unknown) => boolean }) | undefined;
        restoreFocus = !!active && !!element &&
          (active === element || !!element.contains?.(active) || !!menu?.items.includes(active as HudElement));
      } catch { /* focus restoration is best effort */ }
      const failures: unknown[] = [];
      while (cleanups.length) {
        try { cleanups.pop()!(); } catch (error) { failures.push(error); }
      }
      if (rollback && attemptedTransition && initialState === "playing" && this.session.state === "results") {
        try { this.session.transition("playing"); } catch (error) { failures.push(error); }
      }
      if (restoreFocus && previousFocus?.isConnected !== false) {
        // A detached or no-longer-focusable opener must not prevent settlement.
        try { previousFocus?.focus?.(); } catch { /* best effort */ }
      }
      if (this.pendingResults === pending) this.pendingResults = undefined;
      if ("action" in outcome && failures.length === 0) resolve(outcome.action);
      else {
        const primary = "error" in outcome ? outcome.error : failures[0];
        reject(failures.length === 0 ? primary : new AggregateError(
          "error" in outcome ? [primary, ...failures] : failures,
          `Results cleanup failed${"error" in outcome ? `: ${String(primary)}` : "."}`,
          { cause: primary }
        ));
      }
      return failures;
    };
    const pending: PendingResults = { cancel: (reason) => finish({ error: reason }) };
    this.pendingResults = pending;

    try {
      const fields = Object.keys(values).map((id) => ({ id, label: id, format: (value: number) => String(value) }));
      if (done) return promise;
      const host = mount.doc.createElement("div");
      host.className = "a3g-menus a3g-results-host";
      cleanups.push(() => host.remove());
      host.style.boxSizing = "border-box";
      host.style.zIndex = "60";
      host.style.display = "grid";
      host.style.placeItems = "center";
      host.style.overflow = "auto";
      host.style.padding = "12px";
      host.style.background = "rgba(0, 0, 0, 0.68)";
      host.style.color = "var(--a3g-fg, #f4f6fb)";
      host.style.fontFamily = "var(--a3g-font, var(--font-ui))";
      host.style.fontSize = "13px";
      host.style.lineHeight = "1.4";
      host.style.fontSynthesis = "none";
      cleanups.push(sizeResultsHost(mount, host));
      // Do not send new presses from the overlay to the game's input handlers.
      // Releases still bubble so controls held before the modal can be cleared.
      const stopPress = (raw: unknown) => (raw as { stopPropagation?: () => void }).stopPropagation?.();
      for (const type of ["pointerdown", "touchstart", "click"]) {
        host.addEventListener(type, stopPress);
        cleanups.push(() => host.removeEventListener(type, stopPress));
      }
      let activatingClick: { stopPropagation?: () => void } | undefined;
      menu = createResultsMenu(mount.doc, {
        spec: { fields, actions: ["retry", "title", "next"] },
        onAction: (action) => {
          // Stop the actual click at the button after the shared menu has
          // received it, before synchronous teardown removes the host.
          activatingClick?.stopPropagation?.();
          activatingClick = undefined;
          finish({ action });
        }
      });
      const currentMenu = menu;
      cleanups.push(() => currentMenu.dispose());
      currentMenu.setResults(values);
      if (done) return promise;
      styleResultsMenu(currentMenu);
      const onKeydown = (raw: unknown) => {
        const ev = raw as KeyboardEvent;
        if (done || !currentMenu.visible) return;
        ev.stopPropagation();
        if (!ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.isComposing) currentMenu.keydown(ev);
      };
      currentMenu.el.addEventListener("keydown", onKeydown);
      cleanups.push(() => currentMenu.el.removeEventListener("keydown", onKeydown));

      // The shared menu tracks roving focus internally. Synchronize it when a
      // button is focused directly (mouse, assistive technology, or script).
      let syncingFocus = false;
      currentMenu.items.forEach((button, index) => {
        const onFocus = () => {
          if (done || syncingFocus || !currentMenu.visible || currentMenu.focusIndex() === index) return;
          syncingFocus = true;
          try {
            const count = currentMenu.items.length;
            const forward = (index - currentMenu.focusIndex() + count) % count;
            const backward = (currentMenu.focusIndex() - index + count) % count;
            const key = forward <= backward ? "ArrowDown" : "ArrowUp";
            for (let step = 0; step < Math.min(forward, backward) && !done; step += 1) {
              currentMenu.keydown({ key, preventDefault() {}, stopPropagation() {} });
            }
          } finally {
            syncingFocus = false;
          }
        };
        button.addEventListener("focus", onFocus);
        cleanups.push(() => button.removeEventListener("focus", onFocus));
        // Capture the event without stopping it: the shared menu's own click
        // handler must still run before onAction stops its propagation.
        const clickTarget = button as HudElement & {
          addEventListener(type: string, cb: (ev: unknown) => void, capture: boolean): void;
          removeEventListener(type: string, cb: (ev: unknown) => void, capture: boolean): void;
        };
        const captureClick = (raw: unknown) => {
          const event = raw as { stopPropagation?: () => void };
          activatingClick = event;
          queueMicrotask(() => { if (activatingClick === event) activatingClick = undefined; });
        };
        clickTarget.addEventListener("click", captureClick, true);
        cleanups.push(() => clickTarget.removeEventListener("click", captureClick, true));
      });
      host.appendChild(currentMenu.el);
      mount.root.appendChild(host);
      if (done) return promise;
      let enteredResults = initialState === "results";
      const unsubscribe = this.session.on("state", (next) => {
        if (next.state === "results") enteredResults = true;
        else if (enteredResults || next.state === "disposed") {
          finish({ error: next.state === "disposed" ? gameDisposedError() : resultsInterruptedError(next.state) });
        }
      });
      cleanups.push(unsubscribe);
      if (this.session.state !== initialState) {
        finish({ error: resultsInterruptedError(this.session.state) });
        return promise;
      }
      attemptedTransition = true;
      this.session.transition("results");
      if (done) return promise;
      if (this.session.state !== "results") {
        finish({ error: resultsInterruptedError(this.session.state) });
        return promise;
      }
      previousFocus = focusDoc.activeElement;
      currentMenu.show();
    } catch (error) {
      finish({ error }, true);
    }
    return promise;
  }

  public async transition<T>(run: () => T | Promise<T>, spec?: TransitionSpec): Promise<T> {
    const from = this.session.state;
    this.session.transition("transitioning");
    try {
      return this.transitionDriver ? await runTransition(this.transitionDriver, run, spec) : await run();
    } finally {
      this.session.transition(from === "transitioning" ? "playing" : from);
    }
  }

  public openMenu(_id: "pause" | "settings" | "about"): void {
    this.session.pause("menu");
  }

  public closeMenus(): void {
    this.session.releasePause("menu");
  }

  private ensureLoadingView(): void {
    const state = this.loading;
    if (state.disposed || this.session.state === "disposed") {
      throw new Error("GAME_DISPOSED_V1: This game has been disposed; create a new game to continue.");
    }
    if (state.view) return;
    if (typeof document === "undefined" || !document.body) {
      throw new Error(
        "GAME_SHELL_LOADING_UNAVAILABLE_V1: Loading progress needs a document body. " +
        "For a custom or headless host, use createGameShell with a document and root."
      );
    }

    const doc = document as unknown as HudDocument;
    const region = acquireLoadingRegion(doc);
    let screen: ReturnType<typeof createLoadingScreen> | undefined;
    let unsubscribe: (() => void) | undefined;
    try {
      screen = createLoadingScreen(doc, undefined);
      screen.el.style.background = "var(--a3g-bg, #0b0d12)";
      screen.el.style.color = "var(--a3g-fg, #f4f6fb)";
      screen.el.style.padding = "8px";
      // The existing screen's bar relies on route CSS; a native progress
      // element also provides a visible, accessible fallback without it.
      const meter = doc.createElement("progress");
      meter.className = "a3g-loading-progress";
      meter.style.width = "100%";
      meter.setAttribute("max", "1");
      screen.el.appendChild(meter);
      region.host.appendChild(screen.el);
      unsubscribe = this.session.on("state", (next) => {
        if (next.state === "disposed") disposeLoading(state);
        else if (next.state === "loading") state.view?.screen.show();
        else state.view?.screen.hide();
      });
      state.view = { screen, meter, unsubscribe, release: region.release };
      repaintLoading(state);
      if (this.session.state === "loading") screen.show();
    } catch (error) {
      state.view = undefined;
      unsubscribe?.();
      try {
        screen?.dispose();
      } finally {
        region.release();
      }
      throw error;
    }
  }

  public setLoadingProgress(fraction: number, label?: string): void {
    if (typeof fraction !== "number" || Number.isNaN(fraction)) {
      throw new RangeError("GAME_LOADING_FRACTION_INVALID_V1: Loading progress must be a number other than NaN.");
    }
    this.ensureLoadingView();
    this.loading.manualFraction = Math.min(1, Math.max(0, fraction));
    repaintLoading(this.loading, label);
  }

  public track(promise: Promise<unknown>, weight: number): void {
    const state = this.loading;
    if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(state.totalWeight + weight)) {
      throw new RangeError("GAME_LOADING_WEIGHT_INVALID_V1: Loading weights must be non-negative and have a finite total.");
    }
    this.ensureLoadingView();
    state.totalWeight += weight;
    repaintLoading(state);
    let settled = false;
    const settle = () => {
      if (settled || state.disposed) return;
      settled = true;
      state.settledWeight += weight;
      repaintLoading(state);
    };
    // Both outcomes count as settled, as in createGameShell; callers retain
    // the original promise and can still handle its rejection themselves.
    void Promise.resolve(promise).then(settle, settle);
  }

  /** Cancel any unanswered result and release all shell-owned DOM. */
  public dispose(): void {
    this.loading.disposed = true;
    const failures = [...(this.pendingResults?.cancel(gameDisposedError()) ?? [])];
    try { disposeLoading(this.loading); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Game shell disposal failed.", { cause: failures[0] });
  }
}

export class GameHudImpl implements Hud {
  private readonly values = new Map<string, unknown>();

  public set(id: string, value: unknown): void {
    this.values.set(id, value);
  }

  public async banner(_text: string, _o?: { holdMs?: number; style?: string }): Promise<void> {}

  public toast(_text: string, _o?: { ms?: number }): void {}

  public damageNumber(_value: number, _world: AuraVec3, _o?: { color?: string; crit?: boolean }): void {}

  public setVisible(_v: boolean): void {}

  public snapshot() {
    return {
      widgets: [...this.values.entries()].map(([id, value]) => ({ id, value, screenFraction: 0 }))
    };
  }

  public dispose(): void {
    this.values.clear();
  }
}

export class GameFxLayerImpl implements GameFxLayer {
  private live = 0;

  public burst(_kind: string, _position: AuraVec3, _o?: { count?: number; speed?: number; color?: string; normal?: AuraVec3; seed?: number }): void {
    this.live += 1;
  }

  public trail(_target: string, _o: { width: number; life: number; color?: string }): { stop(): void } {
    this.live += 1;
    return { stop: () => { this.live = Math.max(0, this.live - 1); } };
  }

  public get liveCount(): number {
    return this.live;
  }

  public get backend(): "primitive-pool" | "particle-pass" {
    return "primitive-pool";
  }
}
