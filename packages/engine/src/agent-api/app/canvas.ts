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

export function configureCanvas(canvas: HTMLCanvasElement, pixelRatio: number, resize: boolean): void {
  canvas.style.width ||= "100%";
  canvas.style.height ||= "100%";
  canvas.style.display ||= "block";
  const rect = canvas.getBoundingClientRect();
  const parent = canvas.parentElement;
  const cssWidth = rect.width || canvas.clientWidth || parent?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960) || 960;
  const cssHeight = rect.height || canvas.clientHeight || parent?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 540) || 540;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const width = Math.max(320, Math.round(cssWidth * pixelRatio));
  const height = Math.max(220, Math.round(cssHeight * pixelRatio));
  const keepAuthoredSize = !resize && hasAuthoredBackingStore(canvas);
  canvas.width = keepAuthoredSize ? canvas.width : width;
  canvas.height = keepAuthoredSize ? canvas.height : height;
}
