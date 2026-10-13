/**
 * HudKit — mounted once per app (PRD-09 1758). A 3×3 slot grid padded by
 * `env(safe-area-inset-*)` hosts one element per widget spec; `set()` values
 * are applied in a single batched write phase on the frame scheduler, and in
 * dev builds `Element.prototype.innerHTML` is wrapped to throw when assigned
 * under `.a3g-hud` — DOM is built once at mount, never re-serialized.
 */
import type { HudDocument, HudElement, HudRect, HudScheduler } from "./dom.js";
import { rafScheduler } from "./dom.js";
import { HUD_THEMES, type HudThemePreset, type HudThemeVars } from "./themes.js";
import { screenFraction } from "./screenFraction.js";
import {
  createWidget,
  type HudAnchor,
  type HudWidgetInstance,
  type HudWidgetSpec,
  type HudValue
} from "./widgets/index.js";

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface HudMountOptions {
  /** Preset name or a custom `--a3g-*` var record (preset + overrides). */
  theme?: HudThemePreset | HudThemeVars;
  readonly widgets: readonly HudWidgetSpec[];
  /** §17 budget cap; dev warns when the measured fraction exceeds it. */
  readonly maxScreenFraction?: number;
}

export interface HudWidgetSnapshot {
  readonly id: string;
  readonly value: HudValue | undefined;
  /** This widget's rect ∩ canvas, as a fraction of the canvas area (§17). */
  readonly screenFraction: number;
}

export interface HudSnapshot {
  /** C-24 contract surface. */
  readonly widgets: readonly HudWidgetSnapshot[];
  readonly values: Readonly<Record<string, HudValue | undefined>>;
  /** Measured union widget rect / canvas area (§17). */
  readonly screenFraction: number;
  readonly theme: HudThemePreset | "custom";
  readonly widgetCount: number;
  readonly visible: boolean;
}

export interface HudBannerOptions {
  readonly holdMs?: number;
  /** e.g. "round" | "fight" | "ko" — maps to `.a3g-banner-<style>`. */
  readonly style?: string;
}

export interface Hud {
  set(id: string, value: HudValue): void;
  /** Shows the banner; resolves when it hides (C-24: `Promise<void>`). */
  banner(text: string, options?: HudBannerOptions): Promise<void>;
  toast(text: string, options?: { ms?: number }): void;
  damageNumber(value: number, world: Vec3Like, options?: { color?: string; crit?: boolean }): void;
  setVisible(visible: boolean): void;
  snapshot(): HudSnapshot;
  dispose(): void;
}

export interface HudKitDeps {
  readonly root: HudElement;
  readonly doc: HudDocument;
  /** Canvas (or app container) rect for the §17 screen fraction. */
  readonly canvasRect?: () => HudRect;
  /** rAF-compatible frame scheduler; defaults to window.requestAnimationFrame. */
  readonly schedule?: HudScheduler;
  readonly now?: () => number;
  /** Enable the dev `innerHTML` assertion + budget warning (default: on). */
  readonly devAssertions?: boolean;
  readonly warn?: (message: string) => void;
  /** Optional world→screen projection for damage numbers; [x,y] in root units. */
  readonly project?: (world: Vec3Like) => readonly [number, number] | null;
  /**
   * Mobile layout query (default: `matchMedia(HUD_MOBILE_QUERY)` when
   * available). While it matches, widgets with a `mobileAnchor` move to that
   * slot; pass `null` to pin the desktop layout.
   */
  readonly mobileQuery?: HudMediaQuery | null;
}

/** Structural subset of `MediaQueryList` the kit listens to. */
export interface HudMediaQuery {
  readonly matches: boolean;
  addEventListener?(type: "change", cb: () => void): void;
  removeEventListener?(type: "change", cb: () => void): void;
}

/** Same breakpoint as `styles/hud-base.css` (mobile anchors + `.a3g-mobile-hidden`). */
export const HUD_MOBILE_QUERY = "(orientation: portrait) and (max-width: 480px)";

function defaultMobileQuery(): HudMediaQuery | null {
  const mm = (globalThis as { matchMedia?: (q: string) => HudMediaQuery }).matchMedia;
  return typeof mm === "function" ? mm.call(globalThis, HUD_MOBILE_QUERY) : null;
}

const ANCHORS: readonly HudAnchor[] = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right"
];

function safeAreaStyle(el: HudElement): void {
  el.style.paddingTop = "calc(8px + env(safe-area-inset-top, 0px))";
  el.style.paddingBottom = "calc(8px + env(safe-area-inset-bottom, 0px))";
  el.style.paddingLeft = "calc(8px + env(safe-area-inset-left, 0px))";
  el.style.paddingRight = "calc(8px + env(safe-area-inset-right, 0px))";
}

/** Dev guard (PRD-09 1758): wrap innerHTML so a write under `.a3g-hud` throws. */
export function assertNoInnerHtml(doc: HudDocument, warn: (m: string) => void): () => void {
  const proto = (doc as unknown as { defaultView?: { Element?: { prototype: object } } }).defaultView;
  const elementProto = proto?.Element?.prototype;
  if (!elementProto) return () => {};
  const descriptor = Object.getOwnPropertyDescriptor(elementProto, "innerHTML");
  if (!descriptor?.set) return () => {};
  const original = descriptor.set;
  Object.defineProperty(elementProto, "innerHTML", {
    configurable: true,
    get: descriptor.get,
    set(this: Element, html: string) {
      let node: Element | null = this;
      while (node) {
        if (node.classList?.contains?.("a3g-hud")) {
          throw new Error("a3g-hud: innerHTML is forbidden after mount; use hud.set()");
        }
        node = node.parentElement;
      }
      original.call(this, html);
    }
  });
  return () => {
    Object.defineProperty(elementProto, "innerHTML", {
      configurable: true,
      get: descriptor.get,
      set: original
    });
  };
}

const HUD_BASE_CSS = [
  ".a3g-hud { position: absolute; inset: 0; pointer-events: none; z-index: 40;",
  "  font-family: var(--a3g-font, system-ui, sans-serif); color: var(--a3g-fg, #eee);",
  "  display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr 1fr;",
  "  padding: calc(8px + env(safe-area-inset-top,0px)) calc(8px + env(safe-area-inset-right,0px))",
  "           calc(8px + env(safe-area-inset-bottom,0px)) calc(8px + env(safe-area-inset-left,0px)); }",
  ".a3g-hud.a3g-hidden, .a3g-touch.a3g-hidden { display: none; }",
  ".a3g-hud-slot { display: flex; gap: 6px; min-width: 0; min-height: 0; }",
  ".a3g-a-top-left { grid-area: 1/1; flex-direction: column; align-items: flex-start; }",
  ".a3g-a-top { grid-area: 1/2; flex-direction: column; align-items: center; }",
  ".a3g-a-top-right { grid-area: 1/3; flex-direction: column; align-items: flex-end; }",
  ".a3g-a-left { grid-area: 2/1; flex-direction: column; justify-content: center; align-items: flex-start; }",
  ".a3g-a-center { grid-area: 2/2; flex-direction: column; justify-content: center; align-items: center; }",
  ".a3g-a-right { grid-area: 2/3; flex-direction: column; justify-content: center; align-items: flex-end; }",
  ".a3g-a-bottom-left { grid-area: 3/1; flex-direction: column; justify-content: flex-end; align-items: flex-start; }",
  ".a3g-a-bottom { grid-area: 3/2; flex-direction: column; justify-content: flex-end; align-items: center; }",
  ".a3g-a-bottom-right { grid-area: 3/3; flex-direction: column; justify-content: flex-end; align-items: flex-end; }",
  ".a3g-w { background: var(--a3g-bg); border: 1px solid var(--a3g-edge); border-radius: var(--a3g-radius);",
  "  padding: 4px 10px; box-shadow: var(--a3g-glow); font-size: 15px; line-height: 1.2; white-space: nowrap; }",
  ".a3g-w.a3g-hidden { display: none; }",
  ".a3g-w-label { display: block; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--a3g-fg-dim); }",
  ".a3g-w-value { font-weight: 700; font-variant-numeric: tabular-nums; }",
  ".a3g-w-value.a3g-warn { color: var(--a3g-warn); }",
  ".a3g-w-unit { font-size: 10px; color: var(--a3g-fg-dim); margin-left: 4px; }",
  ".a3g-meter-track { position: relative; width: 180px; height: 12px; background: rgba(0,0,0,.5);",
  "  border: 1px solid var(--a3g-edge); border-radius: var(--a3g-radius); overflow: hidden; }",
  ".a3g-meter-fill, .a3g-meter-ghost { position: absolute; inset: 0 auto 0 0; background: var(--a3g-accent); }",
  ".a3g-meter-ghost { background: var(--a3g-danger); opacity: .55; }",
  ".a3g-life-pip { display: inline-block; width: 12px; height: 12px; margin-right: 4px; background: var(--a3g-accent); border-radius: 50%; }",
  ".a3g-minimap { position: relative; border: 1px solid var(--a3g-edge); background: var(--a3g-bg); }",
  ".a3g-minimap-marker { position: absolute; width: 8px; height: 8px; margin: -4px; background: var(--a3g-accent); border-radius: 50%; }",
  ".a3g-indicator-arrow { color: var(--a3g-accent); font-size: 22px; transition: transform .15s; }",
  ".a3g-banner { position: absolute; left: 50%; top: 34%; transform: translate(-50%,-50%);",
  "  font-size: 42px; font-weight: 800; letter-spacing: .06em; text-shadow: var(--a3g-glow); color: var(--a3g-accent); }",
  ".a3g-banner.a3g-hidden { display: none; }",
  ".a3g-toasts { position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%);",
  "  display: flex; flex-direction: column; align-items: center; gap: 4px; }",
  ".a3g-toast { background: var(--a3g-bg); border: 1px solid var(--a3g-edge); border-radius: var(--a3g-radius); padding: 4px 12px; font-size: 13px; }",
  ".a3g-damage { position: absolute; inset: 0; overflow: hidden; }",
  ".a3g-dmg { position: absolute; font-weight: 800; font-size: 18px; color: var(--a3g-fg);",
  "  text-shadow: 0 1px 2px rgba(0,0,0,.7); will-change: transform, opacity; }",
  ".a3g-dmg-crit { font-size: 26px; color: var(--a3g-danger); }",
  "@media (orientation: portrait) and (max-width: 480px) {",
  "  .a3g-mobile-hidden { display: none; }",
  "  .a3g-w { font-size: 13px; padding: 3px 8px; }",
  "}"
].join("\n");

export function mountHud(deps: HudKitDeps, options: HudMountOptions): Hud {
  const { root, doc } = deps;
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const now = deps.now ?? (() => Date.now());
  const schedule: HudScheduler =
    deps.schedule ??
    (typeof requestAnimationFrame === "function"
      ? rafScheduler({
          requestAnimationFrame: (cb) => requestAnimationFrame(cb),
          cancelAnimationFrame: (id) => cancelAnimationFrame(id)
        })
      : (cb) => {
          cb();
          return { cancel: () => {} };
        });

  const realDoc = doc as unknown as {
    head?: { querySelector?: (s: string) => unknown; appendChild?: (el: unknown) => void };
    createElement: (tag: string) => HudElement;
  };
  if (realDoc.head && typeof realDoc.head.appendChild === "function" && !realDoc.head.querySelector?.("[data-a3g-hud-base]")) {
    const styleEl = realDoc.createElement("style");
    styleEl.setAttribute("data-a3g-hud-base", "true");
    styleEl.textContent = HUD_BASE_CSS;
    realDoc.head.appendChild(styleEl);
  }

  const themeVars: HudThemeVars =
    typeof options.theme === "string" || options.theme === undefined
      ? HUD_THEMES[options.theme ?? "plain"]
      : options.theme;
  const themeName = typeof options.theme === "string" ? options.theme : options.theme ? "custom" : "plain";

  const hud = doc.createElement("div");
  hud.className = `a3g-hud a3g-theme-${themeName === "custom" ? "plain" : themeName}`;
  hud.setAttribute("aria-hidden", "false");
  safeAreaStyle(hud);
  for (const [k, v] of Object.entries(themeVars)) hud.style[k] = v;

  const slots = new Map<HudAnchor, HudElement>();
  for (const anchor of ANCHORS) {
    const slot = doc.createElement("div");
    slot.className = `a3g-hud-slot a3g-a-${anchor}`;
    slot.dataset.anchor = anchor;
    hud.appendChild(slot);
    slots.set(anchor, slot);
  }

  // Overlay layers: banner (center), toast stack (bottom), damage numbers (free).
  const bannerEl = doc.createElement("div");
  bannerEl.className = "a3g-banner a3g-hidden";
  hud.appendChild(bannerEl);
  const toastHost = doc.createElement("div");
  toastHost.className = "a3g-toasts";
  hud.appendChild(toastHost);
  const dmgHost = doc.createElement("div");
  dmgHost.className = "a3g-damage";
  hud.appendChild(dmgHost);

  const widgets = new Map<string, HudWidgetInstance>();
  // `mobileAnchor` applies only while the mobile layout query matches; the
  // desktop layout always uses `anchor`. "hidden" is a CSS-only rule
  // (`.a3g-mobile-hidden` is display:none inside the same media query).
  const mobileQuery = deps.mobileQuery === undefined ? defaultMobileQuery() : deps.mobileQuery;
  const relocatable: Array<{ el: HudElement; anchor: HudAnchor; mobileAnchor: HudAnchor }> = [];
  for (const spec of options.widgets) {
    if (widgets.has(spec.id)) throw new Error(`a3g-hud: duplicate widget id "${spec.id}"`);
    const w = createWidget(spec, doc);
    slots.get(spec.anchor)?.appendChild(w.el);
    if (spec.mobileAnchor === "hidden") w.el.classList.add("a3g-mobile-hidden");
    else if (spec.mobileAnchor && spec.mobileAnchor !== spec.anchor) {
      relocatable.push({ el: w.el, anchor: spec.anchor, mobileAnchor: spec.mobileAnchor });
    }
    widgets.set(spec.id, w);
  }
  const applyLayout = () => {
    const mobile = mobileQuery?.matches === true;
    for (const r of relocatable) slots.get(mobile ? r.mobileAnchor : r.anchor)?.appendChild(r.el);
  };
  applyLayout();
  const onLayoutChange = () => applyLayout();
  if (relocatable.length > 0) mobileQuery?.addEventListener?.("change", onLayoutChange);

  root.appendChild(hud);

  let restoreInnerHtml = () => {};
  if (deps.devAssertions !== false) {
    restoreInnerHtml = assertNoInnerHtml(doc, warn);
  }

  // Batched write phase: set() marks a widget dirty; each frame flush applies
  // queued values once, then advances widget animation in the same pass.
  let visible = true;
  let lastT = now();
  let disposed = false;
  const pending = new Map<string, HudValue>();
  interface DamageLife { el: HudElement; born: number; ttl: number; x: number; y: number }
  const damageLive: DamageLife[] = [];
  interface Timed { el: HudElement; until: number }
  const toasts: Timed[] = [];
  let bannerUntil = -1;
  let bannerDone: (() => void) | null = null;

  const flush = () => {
    if (disposed) return;
    const t = now();
    const dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    for (const [id, v] of pending) widgets.get(id)?.apply(v);
    pending.clear();
    for (const w of widgets.values()) w.tick(dt);
    if (bannerUntil >= 0 && t > bannerUntil) {
      bannerEl.classList.add("a3g-hidden");
      bannerUntil = -1;
      bannerDone?.();
      bannerDone = null;
    }
    for (let i = toasts.length - 1; i >= 0; i--) {
      if (t > toasts[i].until) {
        toasts[i].el.remove();
        toasts.splice(i, 1);
      }
    }
    for (let i = damageLive.length - 1; i >= 0; i--) {
      const d = damageLive[i];
      const age = (t - d.born) / d.ttl;
      if (age >= 1) {
        d.el.remove();
        damageLive.splice(i, 1);
        continue;
      }
      d.el.style.transform = `translate(-50%, ${(-age * 48).toFixed(1)}px)`;
      d.el.style.opacity = String(1 - age);
    }
    const maxFrac = options.maxScreenFraction;
    if (maxFrac !== undefined) {
      const frac = measureFraction();
      if (frac > maxFrac) warn(`a3g-hud: screen fraction ${frac.toFixed(3)} exceeds budget ${maxFrac}`);
    }
    frame = schedule(flush);
  };
  let frame = schedule(flush);

  const canvasRect = deps.canvasRect ?? (() => hud.getBoundingClientRect());
  const measureFraction = () =>
    screenFraction(
      [...widgets.values()].map((w) => w.el.getBoundingClientRect()),
      canvasRect()
    );

  return {
    set(id, value) {
      pending.set(id, value);
    },
    banner(text, opts) {
      bannerEl.textContent = text;
      bannerEl.className = `a3g-banner${opts?.style ? ` a3g-banner-${opts.style}` : ""}`;
      bannerUntil = now() + (opts?.holdMs ?? 1600);
      bannerDone?.();
      return new Promise<void>((resolve) => { bannerDone = resolve; });
    },
    toast(text, opts) {
      const el = doc.createElement("div");
      el.className = "a3g-toast";
      el.textContent = text;
      toastHost.appendChild(el);
      toasts.push({ el, until: now() + (opts?.ms ?? 2600) });
    },
    damageNumber(value, world, opts) {
      const el = doc.createElement("div");
      el.className = `a3g-dmg${opts?.crit ? " a3g-dmg-crit" : ""}`;
      el.textContent = String(Math.round(value));
      if (opts?.color) el.style.color = opts.color;
      const p = deps.project ? deps.project(world) : null;
      const x = p ? p[0] : world.x;
      const y = p ? p[1] : world.y;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      dmgHost.appendChild(el);
      damageLive.push({ el, born: now(), ttl: 900, x, y });
    },
    setVisible(v) {
      visible = v;
      hud.classList.toggle("a3g-hidden", !v);
    },
    snapshot() {
      const values: Record<string, HudValue | undefined> = {};
      const canvas = canvasRect();
      const widgetSnaps: HudWidgetSnapshot[] = [];
      for (const [id, w] of widgets) {
        values[id] = w.value();
        widgetSnaps.push({
          id,
          value: w.value(),
          screenFraction: screenFraction([w.el.getBoundingClientRect()], canvas)
        });
      }
      return {
        widgets: widgetSnaps,
        values,
        screenFraction: measureFraction(),
        theme: themeName,
        widgetCount: widgets.size,
        visible
      };
    },
    dispose() {
      disposed = true;
      frame.cancel();
      bannerDone?.();
      bannerDone = null;
      restoreInnerHtml();
      mobileQuery?.removeEventListener?.("change", onLayoutChange);
      hud.remove();
    }
  };
}
