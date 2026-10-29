// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAppTarget } from "../nodes/types.js";
import { AuraRuntimeError } from "./errors.js";
import { round } from "../GameRuntime.js";

export function resolveCanvas(target: AuraAppTarget): HTMLCanvasElement | undefined {
  if (!target) {
    return undefined;
  }
  if (typeof target === "string") {
    if (typeof document === "undefined") {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}" because document is unavailable. Suggested fix: run createAuraApp in a browser or pass an HTMLCanvasElement.`
      );
    }
    const element = document.querySelector(target);
    if (!element) {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}". Suggested fix: add <canvas id="${target.replace(/^#/, "")}"></canvas> or pass an existing element.`
      );
    }
    if (element instanceof HTMLCanvasElement) return element;
    if (element instanceof HTMLElement) return appendCanvas(element);
    throw new AuraRuntimeError(
      "missing-canvas",
      `Aura3D target "${target}" is not an HTMLElement. Suggested fix: pass a canvas or container element.`
    );
  }
  return target instanceof HTMLCanvasElement ? target : appendCanvas(target);
}

function appendCanvas(target: HTMLElement): HTMLCanvasElement {
  applyDefaultCanvasMountLayout(target);
  const canvas = document.createElement("canvas");
  canvas.dataset.aura3dCanvas = "true";
  target.append(canvas);
  return canvas;
}

/**
 * `resize: false` means "do not take over sizing", not "render at the HTML
 * default backing store". A canvas element always reports `width === 300` and
 * `height === 150` until something assigns them, so a truthiness check on those
 * properties can never tell an author-chosen size from the spec default. Only an
 * explicit `width`/`height` attribute, or a backing store that was already
 * assigned to something other than the default pair, counts as author intent.
 */
function hasAuthoredBackingStore(canvas: HTMLCanvasElement): boolean {
  if (canvas.dataset.aura3dCanvas === "true") return false;
  if (canvas.hasAttribute("width") || canvas.hasAttribute("height")) return true;
  return canvas.width !== DEFAULT_CANVAS_BACKING_WIDTH || canvas.height !== DEFAULT_CANVAS_BACKING_HEIGHT;
}

const DEFAULT_CANVAS_BACKING_WIDTH = 300;

const DEFAULT_CANVAS_BACKING_HEIGHT = 150;

function applyDefaultCanvasMountLayout(target: HTMLElement): void {
  if (typeof window === "undefined") return;
  if (target.parentElement === document.body && !target.hasAttribute("data-aura3d-preserve-page-layout")) {
    document.documentElement.style.width ||= "100%";
    document.documentElement.style.height ||= "100%";
    document.body.style.width ||= "100%";
    document.body.style.height ||= "100%";
    document.body.style.margin ||= "0";
    document.body.style.overflow ||= "hidden";
  }
  target.style.width ||= "100%";
  // `100vh` is only the right default for a mount that owns the whole page. A mount
  // nested inside a layout container already has a definite height from that container,
  // and forcing viewport height onto it overflows the parent by the parent's own
  // padding - which `overflow: hidden` on the body then silently amputates, so the
  // bottom of the playfield becomes unreachable. Nested mounts fill their parent.
  const ownsPageLayout = target.parentElement === document.body;
  const mountHeight = ownsPageLayout ? "100vh" : "100%";
  target.style.height ||= mountHeight;
  target.style.minHeight ||= mountHeight;
  target.style.position ||= "relative";
  target.style.overflow ||= "hidden";
}

export function configureCanvas(
  canvas: HTMLCanvasElement,
  pixelRatio: number,
  resize: boolean,
  minimum: { readonly width: number; readonly height: number } = { width: 320, height: 220 }
): void {
  // A second app on the same canvas starts from the page's own inline size, not the pixel size the previous app wrote.
  const previous = engineInlineSize.get(canvas);
  if (previous) {
    if (canvas.style.width === previous.written.width) canvas.style.width = previous.authored.width;
    if (canvas.style.height === previous.written.height) canvas.style.height = previous.authored.height;
  }
  const authored = { width: canvas.style.width, height: canvas.style.height };
  // Before the probe: it assigns the backing store, which adds width/height attributes.
  const keepAuthoredSize = !resize && hasAuthoredBackingStore(canvas);
  const own = probeCssSizedAxes(canvas);
  canvasOwnSizedAxes.set(canvas, own);
  if (!own.width) canvas.style.width ||= "100%";
  if (!own.height) canvas.style.height ||= "100%";
  canvas.style.display ||= "block";
  const rect = canvas.getBoundingClientRect();
  const ownBox = own.width || own.height ? canvasContentBox(canvas) : undefined;
  const parent = canvas.parentElement;
  const cssWidth = (own.width ? ownBox?.width : undefined) || rect.width || canvas.clientWidth || parent?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960) || 960;
  const cssHeight = (own.height ? ownBox?.height : undefined) || rect.height || canvas.clientHeight || parent?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 540) || 540;
  if (!own.width) canvas.style.width = `${cssWidth}px`;
  if (!own.height) canvas.style.height = `${cssHeight}px`;
  engineInlineSize.set(canvas, { authored, written: { width: canvas.style.width, height: canvas.style.height } });
  const width = Math.max(minimum.width, Math.round(cssWidth * pixelRatio));
  const height = Math.max(minimum.height, Math.round(cssHeight * pixelRatio));
  canvas.width = keepAuthoredSize ? canvas.width : width;
  canvas.height = keepAuthoredSize ? canvas.height : height;
}

/**
 * With `resize: false` the author owns the canvas backing size and may change it after the app mounts (a hand-sized
 * device-pixel-ratio cap, a window resize listener). The renderer's viewport and offscreen targets are sized from the
 * backing store at mount, so a later change must be forwarded or the picture fills only part of the new buffer.
 * Returns the size to forward to `renderer.resize`, or null when nothing changed or the engine owns sizing.
 */
export function authoredBackingResize(
  resize: boolean,
  canvas: { readonly width: number; readonly height: number },
  synced: { readonly width: number; readonly height: number }
): { readonly width: number; readonly height: number } | null {
  if (resize) return null;
  if (canvas.width < 1 || canvas.height < 1) return null;
  if (canvas.width === synced.width && canvas.height === synced.height) return null;
  return { width: canvas.width, height: canvas.height };
}

/** Axes on which the page's own CSS sizes the canvas smaller than its parent; the engine fits those axes to the canvas's box. */
export interface CanvasOwnSizedAxes {
  width: boolean;
  height: boolean;
}

const canvasOwnSizedAxes = new WeakMap<HTMLCanvasElement, CanvasOwnSizedAxes>();
interface InlineSize { readonly width: string; readonly height: string }
/** The page's inline size before the engine wrote one, and the last size the engine wrote. */
const engineInlineSize = new WeakMap<HTMLCanvasElement, { readonly authored: InlineSize; written: InlineSize }>();

/** Frame-loop resizes call this after writing the canvas's inline size, so a later mount can tell it from the page's. */
export function noteEngineCanvasSize(canvas: HTMLCanvasElement): void {
  const entry = engineInlineSize.get(canvas);
  if (entry) entry.written = { width: canvas.style.width, height: canvas.style.height };
}

/** What `configureCanvas` decided for this canvas (both false when it never ran or could not measure). Live: resizes may set an axis. */
export function ownSizedCanvasAxes(canvas: HTMLCanvasElement): CanvasOwnSizedAxes {
  let axes = canvasOwnSizedAxes.get(canvas);
  if (!axes) {
    axes = { width: false, height: false };
    canvasOwnSizedAxes.set(canvas, axes);
  }
  return axes;
}

/**
 * At a resize, checks the parent-fit axes again without touching the backing store, because a media query (a phone turned to
 * portrait) can start sizing the canvas after the mount. With the engine's inline size removed, an axis whose content box
 * is neither the backing store's size (an `auto` size) nor the size its ratio gives (an aspect-ratio-only size), and is
 * smaller than the parent, is now sized by the page: it switches to the canvas's own box and keeps no inline size.
 */
export function refreshOwnSizedAxes(canvas: HTMLCanvasElement): CanvasOwnSizedAxes {
  const axes = ownSizedCanvasAxes(canvas);
  if (axes.width && axes.height) return axes;
  const parent = canvas.parentElement;
  if (!parent || typeof parent.getBoundingClientRect !== "function" || typeof getComputedStyle !== "function") return axes;
  const inline = { width: canvas.style.width, height: canvas.style.height };
  if (!axes.width) canvas.style.width = "";
  if (!axes.height) canvas.style.height = "";
  const box = canvasContentBox(canvas);
  const parentRect = parent.getBoundingClientRect();
  const ratio = canvas.width > 0 ? canvas.height / canvas.width : 0;
  const pageSized = (size: number, intrinsic: number, fromRatio: number, parentSize: number): boolean =>
    size > 0 && Math.abs(size - intrinsic) > 0.5 && Math.abs(size - fromRatio) > 0.5 && size < parentSize - 0.5;
  if (box && !axes.width && pageSized(box.width, canvas.width, ratio > 0 ? box.height / ratio : -1, parentRect.width)) axes.width = true;
  if (box && !axes.height && pageSized(box.height, canvas.height, box.width * ratio, parentRect.height)) axes.height = true;
  if (!axes.width) canvas.style.width = inline.width;
  if (!axes.height) canvas.style.height = inline.height;
  return axes;
}

/** The canvas's CSS content box (its bounding box minus padding and border). Undefined without a layout engine. */
export function canvasContentBox(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } | undefined {
  if (typeof getComputedStyle !== "function" || typeof canvas.getBoundingClientRect !== "function") return undefined;
  const rect = canvas.getBoundingClientRect();
  const style = getComputedStyle(canvas);
  const px = (value: string): number => parseFloat(value) || 0;
  return {
    width: Math.max(0, rect.width - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth)),
    height: Math.max(0, rect.height - px(style.paddingTop) - px(style.paddingBottom) - px(style.borderTopWidth) - px(style.borderBottomWidth))
  };
}

/**
 * top-tennis C2: a page that styles the canvas smaller than its parent (portrait score and control bands:
 * `height: calc(100% - bands)` plus a top margin) had that size replaced by the parent's full height, which pushed the
 * bottom of the canvas off screen. An axis counts as sized by the page's CSS when its content box does not move when the
 * backing store changes (an `auto` CSS size follows the width/height attributes, and an aspect-ratio-only size follows
 * their ratio) and the box is smaller than the parent's. Measured once at mount, before the engine writes any size; the
 * probe changes the backing store, which the mount assigns again right after. Without a layout engine nothing is
 * measured and both axes keep the parent fit.
 */
function probeCssSizedAxes(canvas: HTMLCanvasElement): CanvasOwnSizedAxes {
  const none = { width: false, height: false };
  const parent = canvas.parentElement;
  if (!parent || typeof parent.getBoundingClientRect !== "function") return none;
  const before = canvasContentBox(canvas);
  if (!before || before.width <= 0 || before.height <= 0) return none;
  const backing = { width: canvas.width, height: canvas.height };
  canvas.width = backing.width + 64;
  canvas.height = backing.height + 48;
  const after = canvasContentBox(canvas);
  canvas.width = backing.width;
  canvas.height = backing.height;
  if (!after) return none;
  const parentRect = parent.getBoundingClientRect();
  const fixedAxis = (a: number, b: number, parentSize: number): boolean => Math.abs(a - b) <= 0.5 && a > 0 && a < parentSize - 0.5;
  return {
    width: fixedAxis(before.width, after.width, parentRect.width),
    height: fixedAxis(before.height, after.height, parentRect.height)
  };
}
