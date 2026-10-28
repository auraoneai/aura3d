/**
 * Contact-shadow mask hand-off (beat-three.js PRD-2 WP-4, section 2.3).
 *
 * `prd02.contactShadows` renders an R8-style screen-space visibility mask in the
 * `shadows` frame phase (before the forward pass) and records it here. Per-draw
 * `applyForwardShadowMapUniforms` gets no frame context, so the forward pass reads
 * the mask from this store and binds it as `u_contactShadowMask` on programs that
 * reflect it. The shader multiplies it into the shadow-casting light's visibility
 * only (direct light), never into ambient or environment light.
 *
 * Absent mask (no `effects.contactShadows()`, flag off, `?a3dLighting=contact=off`,
 * Low tier) leaves `u_contactShadowMaskStrength` at 0, which the shader chunk
 * short-circuits to a factor of exactly 1.0, so frames stay unchanged. Module
 * store: the last frame wins, same single-renderer-per-page contract as
 * `transmissionTargetStore`.
 */
import { Sampler } from "../Sampler.js";
import type { Texture } from "../Texture.js";
import { TextureBinding } from "../TextureBinding.js";
import type { RenderShaderProgram, UniformValue } from "../RenderDevice.js";
import type { RenderItem } from "../contracts/renderItem.js";

export interface ContactShadowMaskFrame {
  readonly texture: Texture;
  /** Pixel size of the forward target the mask covers (fragment coordinates divide by this). */
  readonly width: number;
  readonly height: number;
  /** 0..1 blend between "no contact shadow" and the mask (the `intensity` request). */
  readonly strength: number;
}

let latest: ContactShadowMaskFrame | undefined;

/** Per-frame draw counters for diagnostics (reset whenever the contributor publishes or clears the mask). */
const drawCounters = { calls: 0, reflectingDraws: 0, maskedDraws: 0 };

export function setContactShadowMask(frame: ContactShadowMaskFrame | undefined): void {
  latest = frame;
  drawCounters.calls = 0;
  drawCounters.reflectingDraws = 0;
  drawCounters.maskedDraws = 0;
}

/** Draws since the last publish: all shadow-uniform applications, those whose program reflects `u_contactShadowMask`, those that bound a live mask. */
export function contactShadowMaskDrawCounters(): { readonly calls: number; readonly reflectingDraws: number; readonly maskedDraws: number } {
  return drawCounters;
}

export function contactShadowMask(): ContactShadowMaskFrame | undefined {
  return latest;
}

const ABSENT_MASK = new TextureBinding({ name: "u_contactShadowMask", required: false });
const MASK_SAMPLER = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });

/**
 * Binds the mask uniforms on programs that reflect `u_contactShadowMask`. Draws that
 * do not receive shadows (`receiveShadow === false`) bind strength 0.
 */
export function applyContactShadowMaskUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const reflected = shader.reflection.uniforms;
  drawCounters.calls += 1;
  if (!reflected.has("u_contactShadowMask")) return;
  drawCounters.reflectingDraws += 1;
  const frame = latest;
  if (!frame || item.receiveShadow === false || !(frame.strength > 0)) {
    uniforms.set("u_contactShadowMask", ABSENT_MASK);
    uniforms.set("u_contactShadowMaskStrength", 0);
    uniforms.set("u_contactShadowMaskViewport", [1, 1]);
    return;
  }
  drawCounters.maskedDraws += 1;
  uniforms.set("u_contactShadowMask", new TextureBinding({ name: "u_contactShadowMask", texture: frame.texture, sampler: MASK_SAMPLER }));
  uniforms.set("u_contactShadowMaskStrength", Math.min(1, frame.strength));
  uniforms.set("u_contactShadowMaskViewport", [Math.max(1, frame.width), Math.max(1, frame.height)]);
}
