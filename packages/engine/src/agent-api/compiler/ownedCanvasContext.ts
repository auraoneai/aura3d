// Canvas-context lookup routed through the rendering device owner
// (packages/rendering/src/RenderBackend.ts) so engine code never calls
// `getContext` itself (single-renderer arch gate). The owner registers the
// lookup on `createRenderDevice` under a registered symbol, keeping the
// public export surface unchanged.

import { createRenderDevice } from "@aura3d/rendering";

type CanvasContextLookup = (canvas: HTMLCanvasElement | OffscreenCanvas | undefined, kind: "webgl2" | "webgpu") => unknown;

const CANVAS_CONTEXT_LOOKUP = Symbol.for("@aura3d/rendering/canvas-context-lookup/v1");

/**
 * The context `canvas` already holds (or a fresh one, as `getContext` does) for
 * `kind`; null when the canvas has no `getContext`, the lookup throws, or the
 * rendering build predates the hook.
 */
export function lookupOwnedCanvasContext(canvas: HTMLCanvasElement | OffscreenCanvas | undefined, kind: "webgl2" | "webgpu"): unknown {
  const lookup = (createRenderDevice as unknown as Record<symbol, CanvasContextLookup | undefined>)[CANVAS_CONTEXT_LOOKUP];
  return lookup ? lookup(canvas, kind) : null;
}
