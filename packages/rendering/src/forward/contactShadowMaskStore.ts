/**
 * Contact-shadow mask hand-off (beat-three.js PRD-2 WP-4, section 2.3).
 *
 * `prd02.contactShadows` renders an R8-style screen-space visibility mask in the
 * `shadows` frame phase (before the forward pass) and records it here. Per-draw
 * `applyForwardShadowMapUniforms` gets no frame context, so the forward pass reads
 * the mask from this store and binds it as `u_contactShadowMask` on programs that
 * reflect it. The shader multiplies it into the shadow-casting directional light's
 * visibility only (direct light), never into ambient or environment light, and never
 * into spot or point lights (the mask is marched along the sun direction).
 *
 * Scope: the mask is a screen-space texture of the MAIN camera's view, so it is stored
 * per render device and bound only for a draw whose forward pass has the same device,
 * the same target size and the same camera position. A secondary render in the same
 * frame (second canvas or renderer, render-to-texture, reflection or thumbnail camera)
 * does not match and gets strength 0, because sampling by `gl_FragCoord` over another
 * view would put shadows in the wrong places.
 *
 * Absent mask (no `effects.contactShadows()`, flag off, `?a3dLighting=contact=off`,
 * Low tier, no shadow-casting sun) leaves `u_contactShadowMaskStrength` at 0, which the
 * shader chunk short-circuits to a factor of exactly 1.0, so frames stay unchanged.
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
  /** World position of the camera the mask was marched from. */
  readonly cameraPosition: readonly [number, number, number];
}

/** What the forward pass is rendering: the mask binds only when it matches the published frame. */
export interface ContactShadowMaskScope {
  readonly device: object;
  readonly width: number;
  readonly height: number;
  /** Undefined means the origin, the same default the frame camera uses. */
  readonly cameraPosition?: readonly number[] | undefined;
}

export interface ContactShadowDrawCounters {
  /** Shadow-uniform applications since the last publish. */
  calls: number;
  /** Those whose program reflects `u_contactShadowMask`. */
  reflectingDraws: number;
  /** Those that bound a live mask. */
  maskedDraws: number;
}

interface DeviceState {
  frame: ContactShadowMaskFrame | undefined;
  counters: ContactShadowDrawCounters;
}

const states = new WeakMap<object, DeviceState>();

function stateFor(device: object): DeviceState {
  let state = states.get(device);
  if (!state) {
    state = { frame: undefined, counters: { calls: 0, reflectingDraws: 0, maskedDraws: 0 } };
    states.set(device, state);
  }
  return state;
}

/** Publishes (or clears, with `undefined`) the mask for `device` and resets its per-frame draw counters. */
export function setContactShadowMask(device: object, frame: ContactShadowMaskFrame | undefined): void {
  const state = stateFor(device);
  state.frame = frame;
  state.counters = { calls: 0, reflectingDraws: 0, maskedDraws: 0 };
}

/** Draws on `device` since the last publish or clear (read-only snapshot). */
export function contactShadowMaskDrawCounters(device: object): Readonly<ContactShadowDrawCounters> {
  return { ...stateFor(device).counters };
}

export function contactShadowMask(device: object): ContactShadowMaskFrame | undefined {
  return states.get(device)?.frame;
}

function sameView(frame: ContactShadowMaskFrame, scope: ContactShadowMaskScope): boolean {
  if (frame.width !== scope.width || frame.height !== scope.height) return false;
  const position = scope.cameraPosition ?? [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs((position[i] ?? 0) - frame.cameraPosition[i]!) > 1e-4) return false;
  }
  return true;
}

const ABSENT_MASK = new TextureBinding({ name: "u_contactShadowMask", required: false });
const MASK_SAMPLER = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });

/**
 * Binds the mask uniforms on programs that reflect `u_contactShadowMask`. Draws that
 * do not receive shadows (`receiveShadow === false`), draws without a `scope`, and draws
 * whose scope is not the published main view bind strength 0.
 */
export function applyContactShadowMaskUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  scope?: ContactShadowMaskScope
): void {
  const reflected = shader.reflection.uniforms;
  const state = scope ? states.get(scope.device) : undefined;
  if (state) state.counters.calls += 1;
  if (!reflected.has("u_contactShadowMask")) return;
  if (state) state.counters.reflectingDraws += 1;
  const frame = state?.frame;
  if (!state || !scope || !frame || item.receiveShadow === false || !(frame.strength > 0) || !sameView(frame, scope)) {
    uniforms.set("u_contactShadowMask", ABSENT_MASK);
    uniforms.set("u_contactShadowMaskStrength", 0);
    uniforms.set("u_contactShadowMaskViewport", [1, 1]);
    return;
  }
  state.counters.maskedDraws += 1;
  uniforms.set("u_contactShadowMask", new TextureBinding({ name: "u_contactShadowMask", texture: frame.texture, sampler: MASK_SAMPLER }));
  uniforms.set("u_contactShadowMaskStrength", Math.min(1, frame.strength));
  uniforms.set("u_contactShadowMaskViewport", [Math.max(1, frame.width), Math.max(1, frame.height)]);
}
