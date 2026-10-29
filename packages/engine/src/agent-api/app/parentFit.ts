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

/**
 * Axes the page's CSS sizes smaller than the parent (`configureCanvas` probes them at mount). On those axes the fit reads the
 * canvas's own content box and the caller leaves the inline size alone, so a canvas styled to leave room for HUD bands
 * keeps that room (top-tennis C2).
 */
export interface OwnBoxFit {
  readonly width: boolean;
  readonly height: boolean;
  box(): { readonly width: number; readonly height: number } | undefined;
}

export interface ParentFit {
  /**
   * CSS size the canvas should take now. `ownWidth`/`ownHeight` mark axes taken from the canvas's own CSS box: the caller
   * must not write the inline size on them.
   */
  measure(fallbackWidth: number, fallbackHeight: number): { readonly cssWidth: number; readonly cssHeight: number; readonly ownWidth: boolean; readonly ownHeight: boolean };
  /** Call after writing the size. Returns true when the write moved the parent (an axis was frozen): measure again. */
  settle(): boolean;
}

const EPSILON = 0.5;

export function createParentFit(canvas: ParentFitCanvas, own?: OwnBoxFit): ParentFit {
  const mountedRect = canvas.getBoundingClientRect();
  const mountedWidth = parseFloat(canvas.style.width) || mountedRect.width || canvas.clientWidth;
  const mountedHeight = parseFloat(canvas.style.height) || mountedRect.height || canvas.clientHeight;
  let contentWidth = false;
  let contentHeight = false;
  let lastParentWidth = 0;
  let lastParentHeight = 0;
  return {
    measure(fallbackWidth, fallbackHeight) {
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      lastParentWidth = parentRect?.width ?? 0;
      lastParentHeight = parentRect?.height ?? 0;
      const ownBox = own && (own.width || own.height) ? own.box() : undefined;
      const ownWidth = Boolean(own?.width && ownBox && ownBox.width > 0);
      const ownHeight = Boolean(own?.height && ownBox && ownBox.height > 0);
      const cssWidth = ownWidth ? ownBox!.width : contentWidth && mountedWidth > 0 ? mountedWidth : lastParentWidth || canvas.clientWidth || fallbackWidth;
      const cssHeight = ownHeight ? ownBox!.height : contentHeight && mountedHeight > 0 ? mountedHeight : lastParentHeight || canvas.clientHeight || fallbackHeight;
      return { cssWidth, cssHeight, ownWidth, ownHeight };
    },
    settle() {
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      if (!parentRect) return false;
      let frozen = false;
      // Axes sized by the page's CSS do not follow the parent, so they cannot feed back into it.
      if (!own?.width && !contentWidth && Math.abs(parentRect.width - lastParentWidth) > EPSILON) { contentWidth = true; frozen = true; }
      if (!own?.height && !contentHeight && Math.abs(parentRect.height - lastParentHeight) > EPSILON) { contentHeight = true; frozen = true; }
      return frozen;
    }
  };
}
