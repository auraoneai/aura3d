import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "@aura3d/rendering";

/**
 * threejs-parity SH-06: the value-level way to obtain a `RenderTarget` from the
 * curated `@aura3d/engine/renderer` surface (three's `new WebGLRenderTarget`).
 * Pass the target to `renderer.render({ source, camera?, target })` to render
 * offscreen at the target's own size, then sample `target.colorTexture`
 * (for example through `new TextureBinding({ name, texture })` on a
 * `TexturedUnlitMaterial`) as an ordinary material map. The device validates
 * the descriptor; the caller owns the target and must `dispose()` it.
 */
export function createRenderTarget(
  host: { readonly device: RenderDevice },
  descriptor: RenderTargetDescriptor
): RenderTarget {
  return host.device.createRenderTarget({ label: "engine-render-target", ...descriptor });
}
