/**
 * §6.11 touch controls (PRD-09 1766): presets built on
 * `@aura3d/input`'s `VirtualTouchJoystick` + `TouchLayouts.ts`, writing into
 * `GameInputController` (`press`/`release`/`setAction`) — the same action
 * path as physical keys, no parallel input stack.
 *
 * Visibility rule: shown after the first `touchstart`, or at mount when
 * `(pointer: coarse)` matches; hidden otherwise (desktop fine pointers never
 * see it). While visible, keyboard-hint elements marked `data-a3g-keyhint`
 * are hidden. Every target is ≥ 48 CSS px (enforced by the TouchLayouts unit
 * test at 390×844) and rects are expressed in safe-area-relative units.
 */
import {
  createTouchLayoutPreset,
  VirtualTouchJoystick,
  type TouchLayoutGenre,
  type TouchLayoutRect,
  type VirtualTouchPoint
} from "@aura3d/input";
import type { HudDocument, HudElement } from "../hud/dom.js";

export type TouchPreset =
  | "twin-stick"
  | "dpad-2btn"
  | "dpad-4btn"
  | "steer-pedals"
  | "aim-drag"
  | "flight"
  | "lane-swipe"
  | "flippers";

/** §6.11: preset → TouchLayouts genre (dpad-2btn→platform, dpad-4btn→fight, steer-pedals→race). */
export const TOUCH_PRESET_GENRE: Readonly<Record<TouchPreset, TouchLayoutGenre>> = Object.freeze({
  "twin-stick": "twin-stick",
  "dpad-2btn": "platform",
  "dpad-4btn": "fight",
  "steer-pedals": "race",
  "aim-drag": "aim-drag",
  "flight": "flight",
  "lane-swipe": "lane-swipe",
  "flippers": "flippers"
});

export interface TouchControlsOptions {
  readonly preset: TouchPreset;
  /**
   * Control-id → action/code map. Button ids are the layout's element suffixes
   * (`"jump"`, `"light"`, …); stick directions are `"stick.up"`, `"stick.down"`,
   * `"stick.left"`, `"stick.right"`, and `"rstick.*"` for the second stick.
   * Values are `GameInputController` actions (via `setAction`).
   */
  readonly bindings: Readonly<Record<string, string>>;
  /** Force visibility (overrides the §6.11 rule). */
  readonly show?: boolean;
  /** Android-style tick on press — calls `navigator.vibrate(ms)`. */
  readonly haptics?: boolean | { ms?: number };
  /** Uniform scale multiplier for rect size (default 1). */
  readonly scale?: number;
}

/** The `GameInputController` surface touch writes into (structural). */
export interface TouchInputSink {
  press(binding: string): void;
  release(binding: string): void;
  setAction(action: string, held: boolean): void;
}

export interface TouchControls {
  readonly visible: boolean;
  readonly preset: TouchPreset;
  setVisible(visible: boolean): void;
  /** Feed a frame tick so stick values stay current; safe to call every frame. */
  update(): void;
  dispose(): void;
  /** Per-control snapshot for evidence (bound/missing, live values). */
  evidence(): {
    readonly preset: TouchPreset;
    readonly genre: TouchLayoutGenre;
    readonly bound: readonly string[];
    readonly visible: boolean;
    readonly sticks: readonly string[];
  };
}

export interface TouchControlsDeps {
  readonly doc: HudDocument;
  /** Parent element the `.a3g-touch` host is appended to (the shell layer). */
  readonly root: HudElement;
  /** Viewport px the safe-area rects are scaled against. */
  readonly viewport?: { readonly width: number; readonly height: number };
  /** `(pointer: coarse)` matcher — when true the controls show at mount. */
  readonly coarsePointer?: () => boolean;
  /** Haptics sink; default `navigator.vibrate` when present. */
  readonly vibrate?: (ms: number) => void;
  readonly warn?: (m: string) => void;
}

const STICK_DIRS = [
  ["stick.left", -1, 0],
  ["stick.right", 1, 0],
  ["stick.up", 0, -1],
  ["stick.down", 0, 1]
] as const;

export function mountTouchControls(
  input: TouchInputSink,
  options: TouchControlsOptions,
  deps: TouchControlsDeps
): TouchControls {
  const { doc } = deps;
  const genre = TOUCH_PRESET_GENRE[options.preset];
  const viewport = deps.viewport ?? { width: 390, height: 844 };
  const scale = options.scale ?? 1;
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const vibrate =
    deps.vibrate ??
    ((ms: number) => {
      (navigator as unknown as { vibrate?: (p: number) => boolean })?.vibrate?.(ms);
    });

  const preset = createTouchLayoutPreset(genre, {
    width: viewport.width,
    height: viewport.height,
    elementIdPrefix: `a3g-touch-${options.preset}`
  });

  const host = doc.createElement("div");
  host.className = `a3g-touch a3g-touch-${options.preset} a3g-hidden`;
  deps.root.appendChild(host);

  const bound: string[] = [];
  const sticks: { name: string; stick: VirtualTouchJoystick; rect: TouchLayoutRect }[] = [];
  const stickHeld = new Map<string, string>();

  const place = (name: string, rect: TouchLayoutRect, extra = ""): HudElement => {
    const el = doc.createElement("div");
    el.className = `a3g-tc ${extra}`.trim();
    el.dataset.control = name;
    el.style.left = `${rect.x * 100}%`;
    el.style.top = `${rect.y * 100}%`;
    el.style.width = `${rect.w * scale * 100}%`;
    el.style.height = `${rect.h * scale * 100}%`;
    host.appendChild(el);
    return el;
  };

  const bindButton = (suffix: string, action: string | undefined): void => {
    const rect = preset.rects[suffix];
    if (!rect) { warn(`a3g-touch: no rect for "${suffix}" in preset ${options.preset}`); return; }
    if (!action) return; // unbound controls are not rendered
    const el = place(suffix, rect, "a3g-tc-btn");
    el.setAttribute("role", "button");
    let down = false;
    el.addEventListener("touchstart", () => {
      down = true;
      input.setAction(action, true);
      el.classList.add("a3g-tc-down");
      if (options.haptics) vibrate(typeof options.haptics === "object" ? options.haptics.ms ?? 12 : 12);
    });
    const release = () => {
      if (!down) return;
      down = false;
      input.setAction(action, false);
      el.classList.remove("a3g-tc-down");
    };
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    bound.push(suffix);
  };

  for (const b of [...preset.hold, ...preset.pulse]) {
    const suffix = b.elementId.split(":").pop()!;
    bindButton(suffix, options.bindings[suffix] ?? options.bindings[b.elementId]);
  }

  // Sticks: DOM zone + VirtualTouchJoystick writing directional actions.
  const stickSpecs: { name: string; cfg?: { center: readonly [number, number]; radius: number; deadZone?: number; fixed?: boolean; returnToCenter?: boolean } }[] = [
    { name: "stick", cfg: preset.leftStick },
    { name: "rstick", cfg: preset.rightStick }
  ];
  for (const { name, cfg } of stickSpecs) {
    const rect = preset.rects[name];
    if (!cfg || !rect) continue;
    const el = place(name, rect, "a3g-tc-stick");
    const nub = doc.createElement("div");
    nub.className = "a3g-tc-stick-nub";
    el.appendChild(nub);
    const pxW = rect.w * viewport.width;
    const pxH = rect.h * viewport.height;
    const joystick = new VirtualTouchJoystick({
      center: [pxW / 2, pxH / 2],
      radius: Math.min(pxW, pxH) / 2,
      deadZone: cfg.deadZone ?? 0.18,
      fixed: cfg.fixed,
      returnToCenter: cfg.returnToCenter
    });
    let nextId = 0;
    el.addEventListener("touchstart", (ev) => {
      const t = (ev as { changedTouches?: { clientX: number; clientY: number }[] }).changedTouches?.[0];
      const r = el.getBoundingClientRect();
      joystick.touchStart({
        id: ++nextId,
        x: (t?.clientX ?? r.left + pxW / 2) - r.left,
        y: (t?.clientY ?? r.top + pxH / 2) - r.top
      });
    });
    el.addEventListener("touchmove", (ev) => {
      const t = (ev as { changedTouches?: { clientX: number; clientY: number }[] }).changedTouches?.[0];
      if (!t) return;
      const r = el.getBoundingClientRect();
      joystick.touchMove({ id: nextId, x: t.clientX - r.left, y: t.clientY - r.top });
    });
    el.addEventListener("touchend", () => joystick.touchEnd({ id: nextId, x: 0, y: 0 }));
    el.addEventListener("touchcancel", () => joystick.touchEnd({ id: nextId, x: 0, y: 0 }));
    sticks.push({ name, stick: joystick, rect });
    bound.push(name);
  }

  const syncStick = (name: string, stick: VirtualTouchJoystick) => {
    const [vx, vy] = stick.snapshot().value;
    for (const [dir, dx, dy] of STICK_DIRS) {
      const controlId = `${name}.${dir.split(".").pop()}`;
      const action = options.bindings[controlId];
      if (!action) continue;
      const shouldHold = (dx !== 0 ? vx * dx : vy * dy) > 0.35;
      const key = `${name}.${dir}`;
      const wasHeld = stickHeld.get(key) === action;
      if (shouldHold && !wasHeld) { input.setAction(action, true); stickHeld.set(key, action); }
      else if (!shouldHold && wasHeld) { input.setAction(action, false); stickHeld.delete(key); }
    }
    // Nub visual offset
    void name;
  };

  let visible = false;
  const applyVisibility = (v: boolean) => {
    visible = v;
    host.classList.toggle("a3g-hidden", !v);
    // §6.11: keyboard-hint strips hide whenever touch controls are visible.
    doc.body?.children?.forEach?.(() => {});
    for (const hint of keyhints(doc)) hint.classList.toggle("a3g-hidden", v);
  };

  const onFirstTouch = () => { if (!visible) applyVisibility(true); };
  // First touchstart anywhere reveals the controls (§6.11).
  doc.body.addEventListener("touchstart", onFirstTouch);

  applyVisibility(options.show ?? deps.coarsePointer?.() ?? false);

  return {
    get visible() { return visible; },
    preset: options.preset,
    setVisible: applyVisibility,
    update() {
      for (const s of sticks) syncStick(s.name, s.stick);
    },
    dispose() {
      doc.body.removeEventListener("touchstart", onFirstTouch);
      host.remove();
    },
    evidence: () => ({
      preset: options.preset,
      genre,
      bound,
      visible,
      sticks: sticks.map((s) => s.name)
    })
  };
}

/** Elements flagged `data-a3g-keyhint` under the document. */
function keyhints(doc: HudDocument): HudElement[] {
  const found: HudElement[] = [];
  const walk = (el: HudElement) => {
    if (el.dataset?.a3gKeyhint !== undefined || el.getAttribute?.("data-a3g-keyhint") !== null) found.push(el);
    for (const c of el.children) walk(c);
  };
  for (const c of doc.body.children) walk(c);
  return found;
}
