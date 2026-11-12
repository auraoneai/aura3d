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
  /** Alias for `show` — `false` explicitly disables coarse-pointer auto-enable. */
  readonly visible?: boolean;
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

interface TouchContactLike {
  readonly identifier?: number;
  readonly clientX: number;
  readonly clientY: number;
}

interface TouchEventLike {
  readonly changedTouches?: ArrayLike<TouchContactLike>;
  readonly touches?: ArrayLike<TouchContactLike>;
  preventDefault?(): void;
  stopPropagation?(): void;
}

function listenNonPassive(el: HudElement, type: string, cb: (ev: unknown) => void): void {
  (el as unknown as { addEventListener(t: string, c: (ev: unknown) => void, o?: { passive?: boolean }): void })
    .addEventListener(type, cb, { passive: false });
}

function defaultCoarsePointer(): boolean {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      if (window.matchMedia("(pointer: coarse)").matches) return true;
    } catch { /* ignore unsupported media query environments */ }
  }
  if (typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0) {
    return true;
  }
  return false;
}

function adaptControlRect(
  base: TouchLayoutRect,
  isStick: boolean,
  vw: number,
  vh: number,
  scale: number
): TouchLayoutRect {
  // Portrait (including 390×844 baseline): preserve authored safe-area ratios.
  if (vw <= vh) {
    return { x: base.x, y: base.y, w: base.w * scale, h: base.h * scale };
  }
  // Landscape: adapt portrait-authored rects so sticks remain square and buttons
  // stay >= 48 CSS px without overlapping or overflowing [0, 1].
  const safeW = Math.max(1, vw);
  const safeH = Math.max(1, vh);
  if (isStick) {
    const sidePx = Math.max(96, Math.min(safeW, safeH) * 0.32) * scale;
    const w = Math.min(0.42, sidePx / safeW);
    const h = Math.min(0.48, sidePx / safeH);
    const rMargin = Math.max(0.02, 1 - (base.x + base.w));
    const bMargin = Math.max(0.04, (1 - (base.y + base.h)) * 0.85);
    const x = base.x < 0.5
      ? Math.max(0.02, base.x * 0.75)
      : Math.max(0.45, Math.min(1 - w - 0.02, 1 - w - rMargin * 0.75));
    const y = Math.max(0.04, Math.min(1 - h - 0.02, 1 - h - bMargin));
    return { x, y, w, h };
  }
  // Wide swipe/flipper zones keep their broad coverage in landscape.
  if (base.w >= 0.3 || base.h >= 0.3) {
    const w = Math.min(1 - base.x, Math.max(base.w * scale, 48 / safeW));
    const h = Math.min(1 - base.y, Math.max(base.h * scale, 48 / safeH));
    return { x: base.x, y: base.y, w, h };
  }
  const w = Math.min(0.35, Math.max(base.w * (safeH / safeW) * 1.8, 48 / safeW) * scale);
  const h = Math.min(0.35, Math.max(base.h * (safeW / safeH) * 0.65, 48 / safeH) * scale);
  const wRatio = w / Math.max(0.01, base.w * scale);
  const hRatio = h / Math.max(0.01, base.h * scale);
  const rMargin = Math.max(0, 1 - (base.x + base.w));
  const bMargin = Math.max(0, 1 - (base.y + base.h));
  const x = base.x < 0.5
    ? Math.max(0.02, Math.min(0.5 - w, base.x * Math.max(0.65, wRatio)))
    : Math.max(0.45, Math.min(1 - w - 0.02, 1 - w - rMargin * Math.max(0.65, wRatio)));
  const y = Math.max(0.02, Math.min(1 - h - 0.02, 1 - h - bMargin * Math.min(2.2, hRatio)));
  return { x, y, w, h };
}

export function mountTouchControls(
  input: TouchInputSink,
  options: TouchControlsOptions,
  deps: TouchControlsDeps
): TouchControls {
  const { doc } = deps;
  const genre = TOUCH_PRESET_GENRE[options.preset];
  const scale = options.scale ?? 1;
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const vibrate =
    deps.vibrate ??
    ((ms: number) => {
      (navigator as unknown as { vibrate?: (p: number) => boolean })?.vibrate?.(ms);
    });

  const measureViewport = (): { width: number; height: number } => {
    if (deps.viewport) return { width: Math.max(1, deps.viewport.width), height: Math.max(1, deps.viewport.height) };
    const rootRect = deps.root.getBoundingClientRect?.();
    if (rootRect && rootRect.width > 0 && rootRect.height > 0) {
      return { width: rootRect.width, height: rootRect.height };
    }
    if (typeof window !== "undefined") {
      const vv = window.visualViewport;
      if (vv && vv.width > 0 && vv.height > 0) return { width: vv.width, height: vv.height };
      if (window.innerWidth > 0 && window.innerHeight > 0) return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 390, height: 844 };
  };

  let viewport = measureViewport();

  const preset = createTouchLayoutPreset(genre, {
    width: viewport.width,
    height: viewport.height,
    elementIdPrefix: `a3g-touch-${options.preset}`
  });

  injectTouchBaseCss(doc);
  const host = doc.createElement("div");
  host.className = `a3g-touch a3g-touch-safe a3g-touch-${options.preset} a3g-hidden`;
  deps.root.appendChild(host);

  const bound: string[] = [];
  const placedControls: { el: HudElement; baseRect: TouchLayoutRect; isStick: boolean; applied: TouchLayoutRect }[] = [];
  const buttonReleases: (() => void)[] = [];
  const sticks: {
    name: string;
    stick: VirtualTouchJoystick;
    baseRect: TouchLayoutRect;
    appliedRect: TouchLayoutRect;
    el: HudElement;
    nub: HudElement;
    deadZone: number;
    fixed?: boolean;
    returnToCenter?: boolean;
    cachedRect: { left: number; top: number; width: number; height: number } | null;
    reset(): void;
    rebuildJoystick(applied: TouchLayoutRect): void;
  }[] = [];
  const stickHeld = new Map<string, string>();

  const applyRectStyle = (el: HudElement, applied: TouchLayoutRect): void => {
    el.style.left = `${applied.x * 100}%`;
    el.style.top = `${applied.y * 100}%`;
    el.style.width = `${applied.w * 100}%`;
    el.style.height = `${applied.h * 100}%`;
  };

  const place = (name: string, baseRect: TouchLayoutRect, isStick: boolean, extra = ""): { el: HudElement; applied: TouchLayoutRect } => {
    const el = doc.createElement("div");
    el.className = `a3g-tc ${extra}`.trim();
    el.dataset.control = name;
    const applied = adaptControlRect(baseRect, isStick, viewport.width, viewport.height, scale);
    applyRectStyle(el, applied);
    host.appendChild(el);
    placedControls.push({ el, baseRect, isStick, applied });
    return { el, applied };
  };

  const bindButton = (suffix: string, action: string | undefined): void => {
    const rect = preset.rects[suffix];
    if (!rect) { warn(`a3g-touch: no rect for "${suffix}" in preset ${options.preset}`); return; }
    if (!action) return; // unbound controls are not rendered
    const { el } = place(suffix, rect, false, "a3g-tc-btn");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", action);
    const activeIds = new Set<number>();
    let down = false;
    listenNonPassive(el, "touchstart", (raw) => {
      const ev = raw as TouchEventLike | undefined;
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      const changed = ev?.changedTouches;
      if (changed && changed.length > 0) {
        for (let i = 0; i < changed.length; i += 1) {
          const t = changed[i]!;
          activeIds.add(typeof t.identifier === "number" ? t.identifier : 0);
        }
      } else {
        activeIds.add(0);
      }
      if (!down) {
        down = true;
        input.setAction(action, true);
        el.classList.add("a3g-tc-down");
        if (options.haptics) vibrate(typeof options.haptics === "object" ? options.haptics.ms ?? 12 : 12);
      }
    });
    const releaseMatching = (raw: unknown) => {
      const ev = raw as TouchEventLike | undefined;
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      if (!down) return;
      const changed = ev?.changedTouches;
      if (changed && changed.length > 0) {
        for (let i = 0; i < changed.length; i += 1) {
          const t = changed[i]!;
          activeIds.delete(typeof t.identifier === "number" ? t.identifier : 0);
        }
        if (activeIds.size > 0) return;
      } else {
        activeIds.clear();
      }
      down = false;
      input.setAction(action, false);
      el.classList.remove("a3g-tc-down");
    };
    const forceRelease = () => {
      activeIds.clear();
      if (!down) return;
      down = false;
      input.setAction(action, false);
      el.classList.remove("a3g-tc-down");
    };
    listenNonPassive(el, "touchend", releaseMatching);
    listenNonPassive(el, "touchcancel", releaseMatching);
    buttonReleases.push(forceRelease);
    bound.push(suffix);
  };

  for (const b of [...preset.hold, ...preset.pulse]) {
    const suffix = b.elementId.split(":").pop()!;
    bindButton(suffix, options.bindings[suffix] ?? options.bindings[b.elementId]);
  }

  // Sticks: DOM zone + VirtualTouchJoystick writing directional actions.
  // Binding ids are `stick.*` / `rstick.*`; the layout names the rects
  // `leftStick` / `rightStick`. A stick with no bound direction is not
  // rendered, like an unbound button; a zero-radius stick (lane-swipe,
  // flippers) has no rect and is skipped.
  const stickSpecs: { name: "stick" | "rstick"; rectKey: "leftStick" | "rightStick"; cfg?: { center: readonly [number, number]; radius: number; deadZone?: number; fixed?: boolean; returnToCenter?: boolean } }[] = [
    { name: "stick", rectKey: "leftStick", cfg: preset.leftStick },
    { name: "rstick", rectKey: "rightStick", cfg: preset.rightStick }
  ];
  for (const { name, rectKey, cfg } of stickSpecs) {
    const rect = preset.rects[rectKey];
    if (!cfg || !rect || cfg.radius <= 0) continue;
    if (!STICK_DIRS.some(([dir]) => options.bindings[`${name}.${dir.split(".").pop()}`])) continue;
    const { el, applied } = place(name, rect, true, "a3g-tc-stick");
    const nub = doc.createElement("div");
    nub.className = "a3g-tc-stick-nub";
    el.appendChild(nub);
    const deadZone = cfg.deadZone ?? 0.18;
    const makeJoystick = (w: number, h: number) =>
      new VirtualTouchJoystick({
        center: [w / 2, h / 2],
        radius: Math.max(1, Math.min(w, h) / 2),
        deadZone,
        fixed: cfg.fixed,
        returnToCenter: cfg.returnToCenter
      });
    let pxW = applied.w * viewport.width;
    let pxH = applied.h * viewport.height;
    let joystick = makeJoystick(pxW, pxH);
    let activeTouchId: number | null = null;

    const entry = {
      name,
      get stick() { return joystick; },
      baseRect: rect,
      appliedRect: applied,
      el,
      nub,
      deadZone,
      fixed: cfg.fixed,
      returnToCenter: cfg.returnToCenter,
      cachedRect: null as { left: number; top: number; width: number; height: number } | null,
      reset() {
        if (activeTouchId !== null) {
          joystick.touchEnd({ id: activeTouchId, x: 0, y: 0 });
          activeTouchId = null;
        }
        nub.style.transform = "translate(calc(-50% + 0.0%), calc(-50% + 0.0%))";
      },
      rebuildJoystick(nextApplied: TouchLayoutRect) {
        entry.appliedRect = nextApplied;
        entry.cachedRect = null;
        const measured = el.getBoundingClientRect?.();
        if (measured && measured.width > 0 && measured.height > 0) {
          entry.cachedRect = { left: measured.left, top: measured.top, width: measured.width, height: measured.height };
          pxW = measured.width;
          pxH = measured.height;
        } else {
          pxW = nextApplied.w * viewport.width;
          pxH = nextApplied.h * viewport.height;
        }
        activeTouchId = null;
        joystick = makeJoystick(pxW, pxH);
      }
    };

    const resolveZoneRect = (): { left: number; top: number; width: number; height: number } => {
      if (entry.cachedRect && entry.cachedRect.width > 0 && entry.cachedRect.height > 0) {
        return entry.cachedRect;
      }
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        entry.cachedRect = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (Math.abs(r.width - pxW) > 0.5 || Math.abs(r.height - pxH) > 0.5) {
          pxW = r.width;
          pxH = r.height;
          joystick = makeJoystick(pxW, pxH);
        }
        return entry.cachedRect;
      }
      return { left: r.left, top: r.top, width: pxW, height: pxH };
    };

    listenNonPassive(el, "touchstart", (raw) => {
      const ev = raw as TouchEventLike | undefined;
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      if (activeTouchId !== null) return;
      const t = ev?.changedTouches?.[0];
      const id = typeof t?.identifier === "number" ? t.identifier : 0;
      activeTouchId = id;
      const r = resolveZoneRect();
      const p: VirtualTouchPoint = {
        id,
        x: (t?.clientX ?? r.left + r.width / 2) - r.left,
        y: (t?.clientY ?? r.top + r.height / 2) - r.top
      };
      joystick.touchStart(p);
    });
    listenNonPassive(el, "touchmove", (raw) => {
      const ev = raw as TouchEventLike | undefined;
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      if (activeTouchId === null) return;
      const changed = ev?.changedTouches;
      if (!changed || changed.length === 0) return;
      let matched: TouchContactLike | undefined;
      for (let i = 0; i < changed.length; i += 1) {
        const candidate = changed[i]!;
        const cid = typeof candidate.identifier === "number" ? candidate.identifier : 0;
        if (cid === activeTouchId) { matched = candidate; break; }
      }
      if (!matched) return;
      // Zero getBoundingClientRect() during touchmove — uses cached zone rect!
      const r = entry.cachedRect ?? { left: 0, top: 0, width: pxW, height: pxH };
      joystick.touchMove({ id: activeTouchId, x: matched.clientX - r.left, y: matched.clientY - r.top });
    });
    const endStickTouch = (raw: unknown) => {
      const ev = raw as TouchEventLike | undefined;
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      if (activeTouchId === null) return;
      const changed = ev?.changedTouches;
      if (changed && changed.length > 0) {
        let matched = false;
        for (let i = 0; i < changed.length; i += 1) {
          const cid = typeof changed[i]!.identifier === "number" ? changed[i]!.identifier! : 0;
          if (cid === activeTouchId) { matched = true; break; }
        }
        if (!matched) return;
      }
      const endedId = activeTouchId;
      activeTouchId = null;
      joystick.touchEnd({ id: endedId, x: 0, y: 0 });
    };
    listenNonPassive(el, "touchend", endStickTouch);
    listenNonPassive(el, "touchcancel", endStickTouch);
    sticks.push(entry);
    bound.push(name);
  }

  const releaseAllHeld = (): void => {
    for (const rel of buttonReleases) rel();
    for (const s of sticks) s.reset();
    for (const [key, action] of stickHeld) {
      input.setAction(action, false);
      stickHeld.delete(key);
    }
  };

  const refreshLayout = (): void => {
    const next = measureViewport();
    const sizeChanged = Math.abs(next.width - viewport.width) > 0.5 || Math.abs(next.height - viewport.height) > 0.5;
    viewport = next;
    for (const item of placedControls) {
      const nextApplied = adaptControlRect(item.baseRect, item.isStick, viewport.width, viewport.height, scale);
      item.applied = nextApplied;
      applyRectStyle(item.el, nextApplied);
    }
    for (const s of sticks) {
      const nextApplied = adaptControlRect(s.baseRect, true, viewport.width, viewport.height, scale);
      if (sizeChanged) {
        s.rebuildJoystick(nextApplied);
      } else {
        const measured = s.el.getBoundingClientRect?.();
        if (measured && measured.width > 0 && measured.height > 0) {
          s.cachedRect = { left: measured.left, top: measured.top, width: measured.width, height: measured.height };
        }
      }
    }
  };

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined" && !deps.viewport) {
    try {
      resizeObserver = new ResizeObserver(() => refreshLayout());
      if (typeof Element !== "undefined" && host instanceof Element) resizeObserver.observe(host);
      if (typeof Element !== "undefined" && deps.root instanceof Element) resizeObserver.observe(deps.root);
    } catch {
      resizeObserver = null;
    }
  }
  const onWindowResize = () => refreshLayout();
  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      releaseAllHeld();
    }
  };
  if (typeof window !== "undefined") {
    if (!deps.viewport) {
      window.addEventListener("resize", onWindowResize);
      window.addEventListener("orientationchange", onWindowResize);
      window.visualViewport?.addEventListener("resize", onWindowResize);
    }
    window.addEventListener("blur", releaseAllHeld);
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  const syncStick = (name: string, stick: VirtualTouchJoystick, nub: HudElement) => {
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
    // Nub follows the stick value (60% of its own size per unit deflection).
    nub.style.transform = `translate(calc(-50% + ${(vx * 60).toFixed(1)}%), calc(-50% + ${(vy * 60).toFixed(1)}%))`;
  };

  let visible = false;
  const applyVisibility = (v: boolean) => {
    if (!v && visible) releaseAllHeld();
    visible = v;
    host.classList.toggle("a3g-hidden", !v);
    if (v) refreshLayout();
    // §6.11: keyboard-hint strips hide whenever touch controls are visible.
    doc.body?.children?.forEach?.(() => {});
    for (const hint of keyhints(doc)) hint.classList.toggle("a3g-hidden", v);
  };

  const explicitVisible = options.show ?? options.visible;
  const onFirstTouch = () => { if (!visible && explicitVisible !== false) applyVisibility(true); };
  // First touchstart anywhere reveals the controls unless explicitly disabled (§6.11).
  if (explicitVisible !== false) {
    doc.body.addEventListener("touchstart", onFirstTouch);
  }

  const isCoarse = (deps.coarsePointer ?? defaultCoarsePointer)();
  applyVisibility(explicitVisible ?? isCoarse);

  return {
    get visible() { return visible; },
    preset: options.preset,
    setVisible: applyVisibility,
    update() {
      for (const s of sticks) syncStick(s.name, s.stick, s.nub);
    },
    dispose() {
      releaseAllHeld();
      doc.body.removeEventListener("touchstart", onFirstTouch);
      resizeObserver?.disconnect();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onWindowResize);
        window.removeEventListener("orientationchange", onWindowResize);
        window.visualViewport?.removeEventListener("resize", onWindowResize);
        window.removeEventListener("blur", releaseAllHeld);
      }
      if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
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

/**
 * Default placement and look for the touch layer. The control rects are set
 * as inline `left`/`top`/`width`/`height` percentages, which only take effect
 * on positioned elements; before this sheet a route without its own
 * `.a3g-tc` CSS got a column of static blocks. The rules use `:where()`
 * (zero specificity), so any route stylesheet still wins.
 */
const TOUCH_BASE_CSS = [
  ".a3g-touch.a3g-hidden { display: none; }",
  ":where(.a3g-touch) { position: absolute; inset: 0; pointer-events: none; z-index: 45; }",
  ":where(.a3g-touch-safe) { inset: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }",
  ":where(.a3g-tc) { position: absolute; box-sizing: border-box; pointer-events: auto; touch-action: none;",
  "  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; border-radius: 12px;",
  "  background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.35); }",
  ":where(.a3g-tc-stick) { border-radius: 50%; }",
  ":where(.a3g-tc-stick-nub) { position: absolute; left: 50%; top: 50%; width: 40%; aspect-ratio: 1;",
  "  transform: translate(-50%, -50%); border-radius: 50%; background: rgba(255,255,255,.3); pointer-events: none; }",
  ":where(.a3g-tc-down) { background: rgba(255,255,255,.32); }"
].join("\n");

function injectTouchBaseCss(doc: HudDocument): void {
  const realDoc = doc as unknown as {
    head?: { querySelector?: (s: string) => unknown; appendChild?: (el: unknown) => void };
  };
  const head = realDoc.head;
  if (!head || typeof head.appendChild !== "function" || head.querySelector?.("[data-a3g-touch-base]")) return;
  const styleEl = doc.createElement("style");
  styleEl.setAttribute("data-a3g-touch-base", "true");
  styleEl.textContent = TOUCH_BASE_CSS;
  head.appendChild(styleEl);
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
