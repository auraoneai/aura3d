/**
 * Reusable touch/pointer bindings for on-screen game controls.
 *
 * ## Why this is in the reusable layer
 *
 * The replicability metric's repeated-cluster detector (added in defect 113) found this code duplicated
 * **byte-for-byte** between Skyline Runner and Turbo Drift Circuit: a `bindHoldControl` that translates
 * pointer press/release into synthetic keyboard events, plus a `pulseKey` for momentary buttons. Two routes
 * had independently authored the same 13 lines, and a third would have copied them again.
 *
 * That is precisely the duplication the brief asks the metric to surface and the reusable layer to absorb.
 * Every public game route needs on-screen controls -- the route-primary probe gates
 * `interactive-controls-outside-viewport` -- so this is genre-independent infrastructure, not art direction.
 *
 * ## Why synthetic keyboard events rather than a direct input API
 *
 * The routes already own a keyboard action map (`game.input({ actions: ... })`) that is the single source of
 * truth for what a key does. Dispatching real `KeyboardEvent`s means a touch press and a physical key press
 * travel the *same* path, so the gameplay proof that keyboard input changes state also covers the buttons.
 * A parallel input path would need its own proof and could drift from the keyboard behaviour.
 *
 * Bindings are additive and idempotent per element: re-binding the same id replaces its listeners rather than
 * stacking them, because a route that re-runs setup after a reset would otherwise fire one keydown per bind.
 */

/** A control that holds its key down while pressed, e.g. throttle or move-left. */
export interface HoldControlBinding {
  /** DOM id of the button element. Missing elements are skipped, not thrown on. */
  readonly elementId: string;
  /** `KeyboardEvent.code` to synthesise, e.g. `"KeyA"`. */
  readonly code: string;
}

/** A control that fires one press-and-release, e.g. jump or reset. */
export interface PulseControlBinding extends HoldControlBinding {
  /** Milliseconds the synthetic key stays down. Defaults to 40ms. */
  readonly holdMs?: number | undefined;
}

/**
 * Minimal DOM surface this module needs.
 *
 * Declared structurally so the module is testable without a DOM environment. This repository runs its unit
 * suite in plain Node with no `jsdom`, which is a deliberate convention: browser behaviour is proven in
 * Playwright against a real browser, not against a DOM emulator. Accepting an injectable host keeps the
 * *binding logic* -- press/release pairing, idempotence, teardown -- under fast unit coverage without
 * pretending a shim is a browser.
 */
export interface TouchControlHost {
  getElementById(id: string): TouchControlElement | null;
  dispatchKey(code: string, type: "keydown" | "keyup"): void;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

/** The element operations a control binding performs. */
export interface TouchControlElement {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface GameControlBindingSpec {
  readonly hold?: readonly HoldControlBinding[] | undefined;
  readonly pulse?: readonly PulseControlBinding[] | undefined;
  /**
   * Override the DOM/timer host. Defaults to `window`/`document`, so routes pass nothing.
   * Exists for unit coverage of the binding logic; see `TouchControlHost`.
   */
  readonly host?: TouchControlHost | undefined;
}

export interface GameControlBindingResult {
  /** Element ids that were found and bound. */
  readonly bound: readonly string[];
  /** Element ids named in the spec but absent from the DOM, so a typo is visible rather than silent. */
  readonly missing: readonly string[];
  /** Remove every listener this call attached. */
  dispose(): void;
}

/**
 * Genre presets for on-screen button bindings (I2).
 *
 * These mirror the button maps in the input package's `createTouchLayoutPreset`
 * (same element-id suffixes and `KeyboardEvent.code`s) so a route can bind the
 * buttons here and drive the analog stick there with one shared naming scheme.
 * The maps live in both places because this engine entry cannot depend on
 * the input package; if either map changes, update the other and the
 * `touch-layout-preset-parity` unit test will fail until they agree.
 */
export type GameTouchLayoutGenre = "fight" | "race" | "platform";

export interface GameTouchLayoutPresetSpec {
  readonly genre: GameTouchLayoutGenre;
  /** Prefix for button element ids, e.g. `touch-fight` binds `touch-fight:jump`. */
  readonly elementIdPrefix?: string;
  readonly host?: TouchControlHost | undefined;
  readonly holdMs?: number | undefined;
}

export interface GameTouchLayoutBindings {
  readonly genre: GameTouchLayoutGenre;
  readonly hold: readonly HoldControlBinding[];
  readonly pulse: readonly PulseControlBinding[];
}

export const GAME_TOUCH_LAYOUT_GENRES: readonly GameTouchLayoutGenre[] = ["fight", "race", "platform"];

export function touchLayoutBindingsForGenre(
  genre: GameTouchLayoutGenre,
  elementIdPrefix = `touch-${genre}`
): GameTouchLayoutBindings {
  const hold = (suffix: string, code: string): HoldControlBinding => ({ elementId: `${elementIdPrefix}:${suffix}`, code });
  const pulse = (suffix: string, code: string): PulseControlBinding => ({ elementId: `${elementIdPrefix}:${suffix}`, code });
  switch (genre) {
    case "fight":
      return {
        genre,
        hold: [hold("left", "ArrowLeft"), hold("right", "ArrowRight"), hold("block", "KeyS")],
        pulse: [pulse("light", "KeyJ"), pulse("heavy", "KeyK"), pulse("special", "KeyL"), pulse("jump", "Space")]
      };
    case "race":
      return {
        genre,
        hold: [hold("steer-left", "ArrowLeft"), hold("steer-right", "ArrowRight"), hold("throttle", "ArrowUp"), hold("brake", "ArrowDown")],
        pulse: [pulse("boost", "ShiftLeft"), pulse("reset", "KeyR")]
      };
    case "platform":
      return {
        genre,
        hold: [hold("left", "ArrowLeft"), hold("right", "ArrowRight"), hold("dash", "ShiftLeft")],
        pulse: [pulse("jump", "Space"), pulse("attack", "KeyJ")]
      };
  }
}

/**
 * Bind a genre's on-screen buttons through the same synthetic-keyboard path as
 * `bindGameTouchControls`. Analog sticks are *not* bound here — create them
 * from the input package's `createTouchLayoutPreset(genre)`, which uses the same
 * element-id prefix scheme for its buttons.
 */
export function bindGameTouchLayoutPreset(spec: GameTouchLayoutPresetSpec): GameControlBindingResult {
  const bindings = touchLayoutBindingsForGenre(spec.genre, spec.elementIdPrefix ?? `touch-${spec.genre}`);
  const pulse = spec.holdMs === undefined ? bindings.pulse : bindings.pulse.map((control) => ({ ...control, holdMs: spec.holdMs }));
  return bindGameTouchControls({ hold: bindings.hold, pulse, host: spec.host });
}

/** Tracks attached listeners per element id so a re-bind replaces rather than stacks. */
const attached = new Map<string, () => void>();

/** The real browser host: synthetic keyboard events on `window`, elements from `document`. */
function browserHost(): TouchControlHost {
  return {
    getElementById: (id) => (typeof document === "undefined" ? null : document.getElementById(id)),
    dispatchKey: (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })),
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
  };
}

/**
 * Bind on-screen controls to synthetic keyboard events.
 *
 * Returns which ids were bound and which were missing, so a route can assert its own control contract
 * instead of discovering a typo through a failing probe.
 */
export function bindGameTouchControls(spec: GameControlBindingSpec): GameControlBindingResult {
  const host = spec.host ?? browserHost();
  const bound: string[] = [];
  const missing: string[] = [];
  const teardown: (() => void)[] = [];

  const claim = (elementId: string): TouchControlElement | undefined => {
    const element = host.getElementById(elementId);
    if (!element) {
      missing.push(elementId);
      return undefined;
    }
    // Replace any previous binding for this id; see the note on idempotence above.
    attached.get(elementId)?.();
    bound.push(elementId);
    return element;
  };

  for (const control of spec.hold ?? []) {
    const element = claim(control.elementId);
    if (!element) continue;
    const press = (): void => host.dispatchKey(control.code, "keydown");
    const release = (): void => host.dispatchKey(control.code, "keyup");
    element.addEventListener("pointerdown", press);
    element.addEventListener("pointerup", release);
    // `pointercancel` and `pointerleave` both matter: a finger sliding off a button must not latch the key on.
    element.addEventListener("pointercancel", release);
    element.addEventListener("pointerleave", release);
    const remove = (): void => {
      element.removeEventListener("pointerdown", press);
      element.removeEventListener("pointerup", release);
      element.removeEventListener("pointercancel", release);
      element.removeEventListener("pointerleave", release);
      // Release on teardown, so disposing mid-press cannot leave the key stuck down.
      release();
      attached.delete(control.elementId);
    };
    attached.set(control.elementId, remove);
    teardown.push(remove);
  }

  for (const control of spec.pulse ?? []) {
    const element = claim(control.elementId);
    if (!element) continue;
    const holdMs = Math.max(1, control.holdMs ?? 40);
    const timers = new Set<unknown>();
    const press = (): void => {
      host.dispatchKey(control.code, "keydown");
      const timer = host.setTimer(() => {
        timers.delete(timer);
        host.dispatchKey(control.code, "keyup");
      }, holdMs);
      timers.add(timer);
    };
    element.addEventListener("click", press);
    const remove = (): void => {
      element.removeEventListener("click", press);
      // Clear pending release timers, or a disposed control can still dispatch after teardown.
      for (const timer of timers) host.clearTimer(timer);
      timers.clear();
      attached.delete(control.elementId);
    };
    attached.set(control.elementId, remove);
    teardown.push(remove);
  }

  return {
    bound,
    missing,
    dispose: () => {
      for (const remove of teardown) remove();
    }
  };
}
