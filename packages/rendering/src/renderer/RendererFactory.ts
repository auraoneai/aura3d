// PR 0b-2 carve-out (CONTRACTS.md §3.5) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/RendererFactory.ts — owner lane 11.

import { createRenderDevice } from "../RenderBackend";
import { Renderer, type RendererOptions } from "../Renderer";
import { assertRendererFeatures } from "../RendererFeatureGates";

export async function createRenderer(options: RendererOptions = {}): Promise<Renderer> {
  const device = await createRenderDevice(options);
  if (options.requiredFeatures && options.requiredFeatures.length > 0) {
    assertRendererFeatures(device, options.requiredFeatures);
  }
  const shaderLibrary = options.shaderLibrary
    ?? (await import("../ShaderLibrary.js")).createDefaultShaderLibrary();
  // Temporal history is an optional runtime subsystem. Keep it behind the
  // asynchronous renderer factory so non-temporal apps do not place its
  // shaders, materials, and target owner on their critical download path.
  const { TemporalHistory } = await import("../TemporalHistory.js");
  return new Renderer(device, { ...options, shaderLibrary }, new TemporalHistory());
}
