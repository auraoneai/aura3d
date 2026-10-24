/**
 * Parent-fit sizing with a feedback guard. The app sizes its canvas to the parent's box, but a parent whose own size is
 * content-driven (an auto-height <body> or wrapper that also holds a HUD) grows whenever the canvas grows, so every resize
 * grows the canvas again until the backing store passes GPU limits and nothing draws. When a write moves the parent, that
 * axis is content-driven: from then on the canvas keeps its mounted size on that axis instead of following the parent.
 */
export interface ParentFitCanvas {
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly style: { width: string; height: string };
  readonly parentElement: { getBoundingClientRect(): { readonly width: number; readonly height: number } } | null;
  getBoundingClientRect(): { readonly width: number; readonly height: number };
}

export interface ParentFit {
  /** CSS size the canvas should take now. */
  measure(fallbackWidth: number, fallbackHeight: number): { readonly cssWidth: number; readonly cssHeight: number };
  /** Call after writing the size. Returns true when the write moved the parent (an axis was frozen): measure again. */
  settle(): boolean;
}

const EPSILON = 0.5;

export function createParentFit(canvas: ParentFitCanvas): ParentFit {
  const own = canvas.getBoundingClientRect();
  const mountedWidth = parseFloat(canvas.style.width) || own.width || canvas.clientWidth;
  const mountedHeight = parseFloat(canvas.style.height) || own.height || canvas.clientHeight;
  let contentWidth = false;
  let contentHeight = false;
  let lastParentWidth = 0;
  let lastParentHeight = 0;
  return {
    measure(fallbackWidth, fallbackHeight) {
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      lastParentWidth = parentRect?.width ?? 0;
      lastParentHeight = parentRect?.height ?? 0;
      const cssWidth = contentWidth && mountedWidth > 0 ? mountedWidth : lastParentWidth || canvas.clientWidth || fallbackWidth;
      const cssHeight = contentHeight && mountedHeight > 0 ? mountedHeight : lastParentHeight || canvas.clientHeight || fallbackHeight;
      return { cssWidth, cssHeight };
    },
    settle() {
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      if (!parentRect) return false;
      let frozen = false;
      if (!contentWidth && Math.abs(parentRect.width - lastParentWidth) > EPSILON) { contentWidth = true; frozen = true; }
      if (!contentHeight && Math.abs(parentRect.height - lastParentHeight) > EPSILON) { contentHeight = true; frozen = true; }
      return frozen;
    }
  };
}
