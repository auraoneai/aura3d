/**
 * M-INPUT keyboard: transcription of the physical-key tracking and `handleKeyDown`/`handleKeyUp` decision logic in
 * game.js. The decision core is pure (events and context are plain objects); `installKeyboardListeners` is the only
 * DOM-bound part and attaches to `window`, so play never depends on which element holds focus.
 */
import type { KeyboardAction } from "../contract/input";
import type { ShotPreset } from "../contract/sim";
import type { BindingsStore } from "./bindings";

export type GameMode = "menu" | "playing" | "gameover";

/** What the key event landed on, as far as the rules care. Built from the DOM by `describeKeyTarget`. */
export interface KeyTargetInfo {
  tagName?: string;
  isContentEditable?: boolean;
  /** True when the target is `document.body` (or there is no target element). */
  isBody?: boolean;
  /** False when the target sits outside the game shell (external forms keep their own semantics). */
  insideShell?: boolean;
}

export interface KeyEventLike {
  code: string; key?: string; repeat?: boolean;
  ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; isComposing?: boolean;
  timeStamp?: number;
  target?: KeyTargetInfo | null;
  preventDefault?(): void;
}

export interface KeyboardContext {
  overlayOpen: boolean;
  touchPlayEnabled: boolean;
  workMode: boolean;
  mode: GameMode;
  online: boolean;
  swipeActive: boolean;
  /** `document.hidden` is false and the document has focus. */
  documentActive: boolean;
  fullscreen: boolean;
  selectedShot: ShotPreset;
  /** The menu gets first refusal on a key (TennisMenu.handleKey); return true when it consumed the key. */
  menuHandlesKey?(event: KeyEventLike): boolean;
}

export type KeyboardCommand =
  | { type: "pause" }
  | { type: "fullscreen" }
  | { type: "workMode" }
  | { type: "swing" }
  | { type: "lobSwing" }
  | { type: "selectShot"; shot: ShotPreset }
  | { type: "menuKey" };

export interface KeyDownResult {
  /** The shell should `preventDefault()` the DOM event. */
  preventDefault: boolean;
  /** First press of a gameplay key: the shell should unlock audio (the source's `initAudio`). */
  unlockAudio: boolean;
  command: KeyboardCommand | null;
}

export interface KeyboardTracker {
  readonly keys: { [code: string]: boolean };
  trackKeyDown(event: KeyEventLike): void;
  trackKeyUp(event: KeyEventLike): void;
  handleKeyDown(event: KeyEventLike, context: KeyboardContext): KeyDownResult;
  handleKeyUp(event: KeyEventLike): void;
  isDown(action: string): boolean;
  isBlocked(code: string): boolean;
  /** `clearInputs()` for keys: held keys stay blocked until released so a held key cannot start a shot after a menu. */
  clear(): void;
}

const EDITABLE_TAGS = ["INPUT", "SELECT", "TEXTAREA"];
const ACTIVATABLE_TAGS = ["BUTTON", "A", "SUMMARY"];
const NATIVE_TAGS = ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A", "SUMMARY"];
const NONE: KeyDownResult = Object.freeze({ preventDefault: false, unlockAudio: false, command: null });

export function createKeyboardTracker(bindings: Pick<BindingsStore, "actionForKey" | "isDown">): KeyboardTracker {
  const keys: { [code: string]: boolean } = Object.create(null) as { [code: string]: boolean };
  const physicalKeys = new Set<string>();
  const blockedKeys = new Set<string>();

  function trackKeyDown(event: KeyEventLike): void {
    physicalKeys.add(event.code);
    // Observe releases even when a dialog consumes the bubbling event.
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) {
      for (const code of physicalKeys) { blockedKeys.add(code); keys[code] = false; }
    }
  }
  function trackKeyUp(event: KeyEventLike): void {
    physicalKeys.delete(event.code); blockedKeys.delete(event.code); keys[event.code] = false;
  }
  function clear(): void {
    for (const code of physicalKeys) blockedKeys.add(code);
    for (const code of Object.keys(keys)) if (keys[code]) blockedKeys.add(code);
    for (const code of Object.keys(keys)) keys[code] = false;
  }

  function handleKeyDown(event: KeyEventLike, ctx: KeyboardContext): KeyDownResult {
    trackKeyDown(event);
    if (ctx.overlayOpen || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return NONE;
    const target = event.target ?? {};
    const tag = target.tagName;
    if (blockedKeys.has(event.code)) {
      const prevent = ctx.touchPlayEnabled && Boolean(bindings.actionForKey(event.code)) && !(tag !== undefined && NATIVE_TAGS.includes(tag)) && !target.isContentEditable;
      return prevent ? { preventDefault: true, unlockAudio: false, command: null } : NONE;
    }
    const workKey = event.code === "Backquote" || event.key === "~" || event.key === "`";
    if (ctx.workMode) {
      if (workKey && !event.repeat) return { preventDefault: true, unlockAudio: false, command: { type: "workMode" } };
      return NONE;
    }
    // Native controls and external forms keep their own input semantics.
    if (target.isBody !== true && target.insideShell === false) return NONE;
    if (ctx.menuHandlesKey?.(event)) return { preventDefault: false, unlockAudio: false, command: { type: "menuKey" } };
    if ((tag !== undefined && EDITABLE_TAGS.includes(tag)) || target.isContentEditable) return NONE;
    if (workKey && !ctx.online && ctx.mode === "playing") {
      return { preventDefault: true, unlockAudio: false, command: event.repeat ? null : { type: "workMode" } };
    }
    if (event.code === "Space" && tag !== undefined && ACTIVATABLE_TAGS.includes(tag)) return NONE;
    const action = bindings.actionForKey(event.code);
    let preventDefault = Boolean(action) && ctx.touchPlayEnabled;
    const actionWasDown = action ? bindings.isDown(action, keys) : false;
    const wasDown = keys[event.code];
    if (event.repeat || wasDown) return preventDefault ? { preventDefault, unlockAudio: false, command: null } : NONE;
    if (!ctx.documentActive) return preventDefault ? { preventDefault, unlockAudio: false, command: null } : NONE;
    keys[event.code] = true;
    const done = (command: KeyboardCommand | null, prevent = preventDefault): KeyDownResult => ({ preventDefault: prevent, unlockAudio: true, command });
    if (event.code === "KeyP" || (event.code === "Escape" && !ctx.fullscreen)) return done({ type: "pause" });
    if (event.code === "KeyF") return done({ type: "fullscreen" });
    // Replay/menu activation is a fixed UI context, separate from gameplay R.
    if (ctx.mode === "gameover" || ctx.mode === "menu") {
      if (event.code === "Space" || (event.code === "KeyR" && ctx.mode === "gameover")) return done({ type: "swing" }, true);
      return done(null);
    }
    if (!ctx.touchPlayEnabled || ctx.swipeActive || !action) return done(null);
    preventDefault = true;
    // Alternate keys are one logical button: release both before a second hit.
    if (actionWasDown) return done(null, true);
    return done(commandForAction(action, ctx), true);
  }

  return {
    keys, trackKeyDown, trackKeyUp, handleKeyDown, handleKeyUp: trackKeyUp, clear,
    isDown: (action) => bindings.isDown(action, keys),
    isBlocked: (code) => blockedKeys.has(code),
  };
}

function commandForAction(action: KeyboardAction, ctx: KeyboardContext): KeyboardCommand | null {
  if (action === "hit") return { type: "swing" };
  if (action === "lob") return { type: "lobSwing" };
  if (action === "short") return { type: "selectShot", shot: ctx.selectedShot === "short" ? "neutral" : "short" };
  if (action === "deep") return { type: "selectShot", shot: ctx.selectedShot === "deep" ? "neutral" : "deep" };
  return null;
}

/** Minimal structural view of the DOM used by the installer (keeps this file free of DOM lib dependencies). */
export interface KeyboardHost {
  addEventListener(type: string, handler: (event: never) => void, options?: boolean | { passive?: boolean; capture?: boolean }): void;
  removeEventListener(type: string, handler: (event: never) => void, options?: boolean | { capture?: boolean }): void;
}
export interface DomKeyEvent extends Omit<KeyEventLike, "target" | "preventDefault"> { target: unknown; preventDefault(): void }

interface ElementLike { tagName?: string; isContentEditable?: boolean; closest?(selector: string): unknown }

/** Reduce a DOM event target to the facts the rules need. `shellSelector` is the game container. */
export function describeKeyTarget(target: unknown, body: unknown, shellSelector = ".game-shell"): KeyTargetInfo {
  const el = (target ?? null) as ElementLike | null;
  if (!el) return { isBody: true, insideShell: true };
  const isBody = el === body;
  const insideShell = typeof el.closest === "function" ? Boolean(el.closest(shellSelector)) : true;
  const info: KeyTargetInfo = { isBody, insideShell };
  if (el.tagName !== undefined) info.tagName = el.tagName;
  if (el.isContentEditable !== undefined) info.isContentEditable = el.isContentEditable;
  return info;
}

export interface KeyboardInstall {
  tracker: KeyboardTracker;
  dispose(): void;
}

/**
 * Attach the tracker to `window`: capture-phase tracking first (so releases are seen even when a dialog swallows the
 * event), then the bubbling handler that decides commands. Blur and tab-hide clear held keys. Focus-independent.
 */
export function installKeyboardListeners(options: {
  host: KeyboardHost;
  body: unknown;
  tracker: KeyboardTracker;
  getContext(): KeyboardContext;
  onCommand(command: KeyboardCommand, event: KeyEventLike): void;
  onUnlockAudio?(): void;
  shellSelector?: string;
}): KeyboardInstall {
  const { host, body, tracker, getContext, onCommand, onUnlockAudio, shellSelector } = options;
  const toEvent = (raw: DomKeyEvent): KeyEventLike => ({
    code: raw.code, key: raw.key, repeat: raw.repeat, ctrlKey: raw.ctrlKey, altKey: raw.altKey, metaKey: raw.metaKey,
    isComposing: raw.isComposing, timeStamp: raw.timeStamp, target: describeKeyTarget(raw.target, body, shellSelector),
  });
  const onTrackDown = (raw: DomKeyEvent): void => tracker.trackKeyDown(toEvent(raw));
  const onTrackUp = (raw: DomKeyEvent): void => tracker.trackKeyUp(toEvent(raw));
  const onDown = (raw: DomKeyEvent): void => {
    const event = toEvent(raw);
    const result = tracker.handleKeyDown(event, getContext());
    if (result.preventDefault) raw.preventDefault();
    if (result.unlockAudio) onUnlockAudio?.();
    if (result.command) onCommand(result.command, event);
  };
  const onUp = (raw: DomKeyEvent): void => tracker.handleKeyUp(toEvent(raw));
  const onBlur = (): void => tracker.clear();
  host.addEventListener("keydown", onTrackDown as (event: never) => void, true);
  host.addEventListener("keyup", onTrackUp as (event: never) => void, true);
  host.addEventListener("keydown", onDown as (event: never) => void, { passive: false });
  host.addEventListener("keyup", onUp as (event: never) => void);
  host.addEventListener("blur", onBlur);
  return {
    tracker,
    dispose() {
      host.removeEventListener("keydown", onTrackDown as (event: never) => void, true);
      host.removeEventListener("keyup", onTrackUp as (event: never) => void, true);
      host.removeEventListener("keydown", onDown as (event: never) => void);
      host.removeEventListener("keyup", onUp as (event: never) => void);
      host.removeEventListener("blur", onBlur);
    },
  };
}
