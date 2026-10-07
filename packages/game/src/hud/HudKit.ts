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

export function mountHud(deps: HudKitDeps, options: HudMountOptions): Hud {
  const { root, doc } = deps;
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const now = deps.now ?? (() => Date.now());
  const schedule: HudScheduler =
    deps.schedule ??
    (typeof requestAnimationFrame === "function"
      ? rafScheduler({ requestAnimationFrame, cancelAnimationFrame })
      : (cb) => {
          cb();
          return { cancel: () => {} };
        });

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
  for (const spec of options.widgets) {
    if (widgets.has(spec.id)) throw new Error(`a3g-hud: duplicate widget id "${spec.id}"`);
    const w = createWidget(spec, doc);
    const anchor = (spec.mobileAnchor && spec.mobileAnchor !== "hidden" ? spec.mobileAnchor : spec.anchor) as HudAnchor;
    if (spec.mobileAnchor === "hidden") w.el.classList.add("a3g-mobile-hidden");
    slots.get(anchor)?.appendChild(w.el);
    widgets.set(spec.id, w);
  }

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
      hud.remove();
    }
  };
}
