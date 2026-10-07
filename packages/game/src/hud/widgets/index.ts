/**
 * §7.7 HUD widgets — one element per spec, built once at mount. `set()` values
 * queue through the kit's batched rAF write phase; `tick(dt)` advances the
 * animated parts (score roll, meter ghost trail, indicator sweep).
 */
import type { HudDocument, HudElement } from "../dom.js";

export type HudAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface HudWidgetBase {
  readonly id: string;
  readonly anchor: HudAnchor;
  readonly mobileAnchor?: HudAnchor | "hidden";
  readonly label?: string;
}

export type HudScoreSpec = HudWidgetBase & { readonly kind: "score"; readonly rollMs?: number; readonly format?: (v: number) => string };
export type HudTimerSpec = HudWidgetBase & { readonly kind: "timer"; readonly mode: "countdown" | "stopwatch"; readonly warnAt?: number };
export type HudMeterSpec = HudWidgetBase & { readonly kind: "meter"; readonly max: number; readonly ghost?: boolean; readonly segments?: number; readonly color?: string };
export type HudTextSpec = HudWidgetBase & { readonly kind: "combo" | "lives" | "objective" | "speedometer" | "prompt" };
export type HudMinimapSpec = HudWidgetBase & { readonly kind: "minimap"; readonly size: number; readonly bounds: readonly [number, number, number, number] };
export type HudIndicatorSpec = HudWidgetBase & { readonly kind: "indicator"; readonly target: () => readonly [number, number] | null };

export type HudWidgetSpec =
  | HudScoreSpec
  | HudTimerSpec
  | HudMeterSpec
  | HudTextSpec
  | HudMinimapSpec
  | HudIndicatorSpec;

export type HudValue = number | string | boolean | readonly [number, number];

export interface HudWidgetInstance {
  readonly spec: HudWidgetSpec;
  readonly el: HudElement;
  /** Apply a new target value immediately (queues into the write phase). */
  apply(value: HudValue): void;
  /** Advance widget-internal animation (score roll, ghost trail). */
  tick(dt: number): void;
  /** Last applied value for `hud.snapshot()`. */
  value(): HudValue | undefined;
}

function el(doc: HudDocument, tag: string, cls: string, text = ""): HudElement {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function labelRow(doc: HudDocument, label: string | undefined): HudElement | null {
  return label ? el(doc, "span", "a3g-w-label", label) : null;
}

function num(value: HudValue | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fmtClock(seconds: number, mode: "countdown" | "stopwatch"): string {
  const s = Math.max(0, mode === "countdown" ? seconds : seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const tenth = Math.floor((rest - Math.floor(rest)) * 10);
  return `${m}:${Math.floor(rest).toString().padStart(2, "0")}.${tenth}`;
}

export function createWidget(spec: HudWidgetSpec, doc: HudDocument): HudWidgetInstance {
  switch (spec.kind) {
    case "score": return scoreWidget(spec, doc);
    case "timer": return timerWidget(spec, doc);
    case "meter": return meterWidget(spec, doc);
    case "combo": return comboWidget(spec, doc);
    case "lives": return livesWidget(spec, doc);
    case "objective": return textWidget(spec, doc, "objective");
    case "speedometer": return speedometerWidget(spec, doc);
    case "prompt": return textWidget(spec, doc, "prompt");
    case "minimap": return minimapWidget(spec, doc);
    case "indicator": return indicatorWidget(spec, doc);
  }
}

function base(spec: HudWidgetSpec, doc: HudDocument, cls: string): HudElement {
  const root = el(doc, "div", `a3g-w a3g-w-${spec.kind} ${cls}`);
  root.dataset.widgetId = spec.id;
  root.dataset.anchor = spec.anchor;
  const l = labelRow(doc, spec.label);
  if (l) root.appendChild(l);
  return root;
}

function scoreWidget(spec: HudScoreSpec, doc: HudDocument): HudWidgetInstance {
  const rollSeconds = Math.max(0, (spec.rollMs ?? 300) / 1000);
  const format = spec.format ?? ((v: number) => Math.round(v).toLocaleString("en-US"));
  const root = base(spec, doc, "");
  const value = el(doc, "span", "a3g-w-value");
  root.appendChild(value);
  let target = 0;
  let shown = 0;
  let applied: HudValue | undefined;
  const write = () => { value.textContent = format(shown); };
  write();
  return {
    spec,
    el: root,
    apply(v) { applied = v; target = num(v); if (rollSeconds === 0) { shown = target; write(); } },
    tick(dt) {
      if (shown === target) return;
      const step = Math.max(1, Math.abs(target - shown) * Math.min(1, (dt / rollSeconds) * 5));
      shown += Math.sign(target - shown) * step;
      if (Math.abs(target - shown) < 1) shown = target;
      write();
    },
    value: () => applied
  };
}

function timerWidget(spec: HudTimerSpec, doc: HudDocument): HudWidgetInstance {
  const root = base(spec, doc, "");
  const value = el(doc, "span", "a3g-w-value");
  root.appendChild(value);
  let applied: HudValue | undefined;
  value.textContent = fmtClock(0, spec.mode);
  return {
    spec,
    el: root,
    apply(v) {
      applied = v;
      const s = num(v);
      value.textContent = fmtClock(s, spec.mode);
      value.classList.toggle("a3g-warn", spec.warnAt !== undefined && s <= spec.warnAt);
    },
    tick() {},
    value: () => applied
  };
}

function meterWidget(spec: HudMeterSpec, doc: HudDocument): HudWidgetInstance {
  const root = base(spec, doc, "");
  const track = el(doc, "div", "a3g-meter-track");
  const ghost = el(doc, "div", "a3g-meter-ghost");
  const fill = el(doc, "div", "a3g-meter-fill");
  if (spec.color) fill.style.background = spec.color;
  track.appendChild(ghost);
  track.appendChild(fill);
  root.appendChild(track);
  let applied: HudValue | undefined;
  let frac = 0;
  let ghostFrac = 0;
  const segments = spec.segments ?? 0;
  const max = Math.max(1e-6, spec.max);
  const paint = () => {
    fill.style.width = `${(frac * 100).toFixed(2)}%`;
    ghost.style.width = `${(ghostFrac * 100).toFixed(2)}%`;
    track.dataset.segments = String(segments);
  };
  paint();
  return {
    spec,
    el: root,
    apply(v) { applied = v; frac = Math.min(1, Math.max(0, num(v) / max)); ghostFrac = Math.max(ghostFrac, frac); paint(); },
    tick(dt) {
      if (!spec.ghost || ghostFrac <= frac) return;
      ghostFrac = Math.max(frac, ghostFrac - dt * 0.9);
      paint();
    },
    value: () => applied
  };
}

function comboWidget(spec: HudTextSpec, doc: HudDocument): HudWidgetInstance {
  const root = base(spec, doc, "");
  const value = el(doc, "span", "a3g-w-value", "x1");
  root.appendChild(value);
  let applied: HudValue | undefined;
  return {
    spec,
    el: root,
    apply(v) {
      applied = v;
      const n = num(v, 1);
      value.textContent = `x${Number.isInteger(n) ? n : n.toFixed(1)}`;
      root.classList.toggle("a3g-hot", n > 1);
    },
    tick() {},
    value: () => applied
  };
}

function livesWidget(spec: HudTextSpec, doc: HudDocument): HudWidgetInstance {
  const root = base(spec, doc, "");
  const pips = el(doc, "div", "a3g-lives-pips");
  root.appendChild(pips);
  let applied: HudValue | undefined;
  return {
    spec,
    el: root,
    apply(v) {
      applied = v;
      const n = Math.max(0, Math.round(num(v)));
      // No innerHTML: rebuild pips only when the count changes.
      while (pips.children.length > n) pips.removeChild(pips.children[pips.children.length - 1]);
      while (pips.children.length < n) pips.appendChild(el(doc, "span", "a3g-life-pip"));
      root.dataset.lives = String(n);
    },
    tick() {},
    value: () => applied
  };
}

function textWidget(spec: HudTextSpec, doc: HudDocument, cls: string): HudWidgetInstance {
  const root = base(spec, doc, `a3g-w-${cls}`);
  const value = el(doc, "span", "a3g-w-value");
  root.appendChild(value);
  let applied: HudValue | undefined;
  return {
    spec,
    el: root,
    apply(v) {
      applied = v;
      value.textContent = typeof v === "string" ? v : v === true ? "" : String(v ?? "");
      root.classList.toggle("a3g-hidden", v === "" || v === false);
    },
    tick() {},
    value: () => applied
  };
}

function speedometerWidget(spec: HudTextSpec, doc: HudDocument): HudWidgetInstance {
  const root = base(spec, doc, "");
  const value = el(doc, "span", "a3g-w-value", "0");
  const unit = el(doc, "span", "a3g-w-unit", "km/h");
  root.appendChild(value);
  root.appendChild(unit);
  let applied: HudValue | undefined;
  return {
    spec,
    el: root,
    apply(v) { applied = v; value.textContent = String(Math.round(num(v))); },
    tick() {},
    value: () => applied
  };
}

function minimapWidget(spec: HudMinimapSpec, doc: HudDocument): HudWidgetInstance {
  const root = base(spec, doc, "");
  const map = el(doc, "div", "a3g-minimap");
  map.style.width = `${spec.size}px`;
  map.style.height = `${spec.size}px`;
  const marker = el(doc, "div", "a3g-minimap-marker");
  map.appendChild(marker);
  root.appendChild(map);
  const [x0, z0, x1, z1] = spec.bounds;
  let applied: HudValue | undefined;
  return {
    spec,
    el: root,
    apply(v) {
      applied = v;
      if (!Array.isArray(v)) return;
      const fx = Math.min(1, Math.max(0, (v[0] - x0) / Math.max(1e-6, x1 - x0)));
      const fz = Math.min(1, Math.max(0, (v[1] - z0) / Math.max(1e-6, z1 - z0)));
      marker.style.left = `${(fx * 100).toFixed(1)}%`;
      marker.style.top = `${(fz * 100).toFixed(1)}%`;
    },
    tick() {},
    value: () => applied
  };
}

function indicatorWidget(spec: HudIndicatorSpec, doc: HudDocument): HudWidgetInstance {
  const root = base(spec, doc, "");
  const arrow = el(doc, "div", "a3g-indicator-arrow", "▲");
  root.appendChild(arrow);
  let applied: HudValue | undefined;
  return {
    spec,
    el: root,
    apply(v) {
      applied = v;
      if (Array.isArray(v)) {
        // Value is the target's normalized screen position; the arrow rotates
        // from screen-center toward it.
        const dx = v[0] - 0.5;
        const dy = v[1] - 0.5;
        arrow.style.transform = `rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90)}deg)`;
        root.classList.toggle("a3g-hidden", false);
      }
    },
    tick() {
      const t = spec.target();
      root.classList.toggle("a3g-hidden", t === null && applied === undefined);
    },
    value: () => applied
  };
}
