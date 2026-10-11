/**
 * #207 / Q-03-1 (PRD-08 §8.3, fact F-08-5) — the C-13 consumer of the
 * lane-08 screen-feel uniforms. Flag: `A3D_QR_POST` (the publisher is
 * additionally gated on `A3D_QR_CAMERA`, so nothing applies unless both are on).
 *
 * Lane 08 publishes `AuraScreenFeelUniforms` (`{ flash, chroma, radialBlur,
 * vignette, center }`, center in NDC) on the per-frame C-01 blackboard under
 * `prd08.screenFeel` from its `collect` contributor, and reads
 * `prd08.screenFeel.consumed` in that same `collect` to decide whether its DOM
 * fallback still has to draw. The C-13 custom-pass callbacks receive the
 * v2 driver's private blackboard, not the C-01 frame blackboard, so this
 * module bridges the two with a `prd03.screenFeel` frame contributor:
 *
 *  - `collect` (order −1, so it runs before `prd08.screenFeel`): rolls the
 *    per-device state to a new frame and, when the pass applied on the
 *    previous frame, sets `prd08.screenFeel.consumed = true` so lane 08's
 *    same-phase read sees it (the blackboard is rebuilt every frame);
 *  - `post-hdr` (runs right before the post chain): captures the uniforms the
 *    lane-08 contributor published this frame;
 *  - the C-13 pass (`before-tonemap`, `linear-hdr`) is enabled only when a
 *    part is non-zero; when it runs, its `uniforms()` callback marks the
 *    frame applied and sets `prd08.screenFeel.consumed = true` on that
 *    frame's blackboard too (F-08-5: "on frames it applied").
 *
 * Shader = the F-08-5 reference behaviour: chroma (R at `uv + d·k`, B at
 * `uv − d·k`, `d = uv − 0.5`, `k = 0.006·chroma`), radial blur (8 taps along
 * `uv − center`, step `0.012·radialBlur`, weights `1 − i/8`, normalised),
 * vignette pulse (`col *= 1 − vignette·smoothstep(0.35, 0.9, |uv − 0.5|)`)
 * and flash (`hdr += flash`, before exposure/tonemap). Each part
 * short-circuits at 0. The Low-tier rule (flash + vignette only) is applied
 * by the publisher (`screenUniformsForTier`); the pass draws what it is given.
 *
 * Flag off: the contributor is filtered out by `frameContributors(flags)` and
 * the pass is never registered (registration is lazy, from the flag-on
 * `collect`), so the registry, the frame and the diagnostics are unchanged.
 */

import { registerFrameContributor, type FrameContributor, type FrameContributorContext } from "../contracts/frameGraph";
import { registerPostPass, registeredPostPasses, type PostPassDescriptor } from "../contracts/post";
import type { RenderItem } from "../contracts/renderItem";
import type { RenderDevice } from "../RenderDevice";

/** C-23 blackboard key lane 08 publishes (`SCREEN_FEEL_BLACKBOARD_KEY`). */
export const SCREEN_FEEL_KEY = "prd08.screenFeel";
/** Key lane 08 reads to learn a C-13 consumer applied the uniforms. */
export const SCREEN_FEEL_CONSUMED_KEY = "prd08.screenFeel.consumed";
/** C-13 pass + C-01 contributor id. */
export const SCREEN_FEEL_PASS_ID = "prd03.screenFeel";

/** Structural `AuraScreenFeelUniforms` (engine `contracts/time.ts`). */
export interface ScreenFeelUniformsLike {
  readonly flash: number;
  readonly chroma: number;
  readonly radialBlur: number;
  readonly vignette: number;
  readonly center: readonly [number, number];
}

interface ScreenFeelDeviceState {
  /** This frame's uniforms (captured in `post-hdr`), or null. */
  uniforms: ScreenFeelUniformsLike | null;
  /** This frame's C-01 blackboard (set in `collect`). */
  blackboard: Map<string, unknown> | null;
  appliedThisFrame: boolean;
  appliedLastFrame: boolean;
  /** Frames the pass ran on (diagnostics/tests). */
  appliedFrames: number;
}

const deviceStates = new WeakMap<RenderDevice, ScreenFeelDeviceState>();

function stateFor(device: RenderDevice): ScreenFeelDeviceState {
  let state = deviceStates.get(device);
  if (!state) {
    state = { uniforms: null, blackboard: null, appliedThisFrame: false, appliedLastFrame: false, appliedFrames: 0 };
    deviceStates.set(device, state);
  }
  return state;
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Validates a blackboard value; anything malformed reads as "no screen feel". */
export function readScreenFeelUniforms(value: unknown): ScreenFeelUniformsLike | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Record<keyof ScreenFeelUniformsLike, unknown>>;
  const center = Array.isArray(v.center) && v.center.length >= 2 ? [finite(v.center[0]), finite(v.center[1])] as const : [0, 0] as const;
  return {
    flash: Math.max(0, finite(v.flash)),
    chroma: Math.max(0, finite(v.chroma)),
    radialBlur: Math.max(0, finite(v.radialBlur)),
    vignette: Math.min(1, Math.max(0, finite(v.vignette))),
    center
  };
}

/** True when at least one part would change pixels (all four short-circuit at 0). */
export function screenFeelActive(u: ScreenFeelUniformsLike | null): u is ScreenFeelUniformsLike {
  return u !== null && (u.flash > 0 || u.chroma > 0 || u.radialBlur > 0 || u.vignette > 0);
}

/** Fragment body appended after the C-13 header (`u_color`, `v_uv`, `outColor`). */
export const SCREEN_FEEL_GLSL = /* glsl */ `
uniform float u_feelFlash;
uniform float u_feelChroma;
uniform float u_feelRadialBlur;
uniform float u_feelVignette;
uniform vec2 u_feelCenter; // NDC

vec3 feelSample(vec2 uv) {
  if (u_feelChroma <= 0.0) return texture(u_color, uv).rgb;
  vec2 d = (uv - 0.5) * (0.006 * u_feelChroma);
  return vec3(texture(u_color, uv + d).r, texture(u_color, uv).g, texture(u_color, uv - d).b);
}

void main() {
  vec2 uv = v_uv;
  vec3 col;
  if (u_feelRadialBlur > 0.0) {
    vec2 centerUv = u_feelCenter * 0.5 + 0.5;
    vec2 stepUv = (uv - centerUv) * (0.012 * u_feelRadialBlur);
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 8; i += 1) {
      float w = 1.0 - float(i) / 8.0;
      sum += feelSample(uv - stepUv * float(i)) * w;
      wsum += w;
    }
    col = sum / wsum;
  } else {
    col = feelSample(uv);
  }
  if (u_feelVignette > 0.0) col *= 1.0 - u_feelVignette * smoothstep(0.35, 0.9, length(uv - 0.5));
  if (u_feelFlash > 0.0) col += vec3(u_feelFlash);
  outColor = vec4(col, texture(u_color, uv).a);
}
`;

/** The C-13 descriptor; its callbacks read the per-device frame state. */
export const SCREEN_FEEL_PASS: PostPassDescriptor = {
  id: SCREEN_FEEL_PASS_ID,
  owner: "prd03",
  flag: "A3D_QR_POST",
  insertAt: "before-tonemap",
  space: "linear-hdr",
  inputs: ["color"],
  fragment: { glsl: SCREEN_FEEL_GLSL },
  gpuOnly: true,
  enabled: (frame: FrameContributorContext) => screenFeelActive(stateFor(frame.device).uniforms),
  uniforms: (frame: FrameContributorContext) => {
    const state = stateFor(frame.device);
    const u = state.uniforms;
    if (!u) return { u_feelFlash: 0, u_feelChroma: 0, u_feelRadialBlur: 0, u_feelVignette: 0, u_feelCenter: [0, 0] };
    // `uniforms()` is called only from inside the pass's draw: the frame applied.
    if (!state.appliedThisFrame) {
      state.appliedThisFrame = true;
      state.appliedFrames += 1;
    }
    state.blackboard?.set(SCREEN_FEEL_CONSUMED_KEY, true);
    return {
      u_feelFlash: u.flash,
      u_feelChroma: u.chroma,
      u_feelRadialBlur: u.radialBlur,
      u_feelVignette: u.vignette,
      u_feelCenter: [u.center[0], u.center[1]]
    };
  }
};

let releasePass: (() => void) | null = null;

/** Registers the C-13 pass once (idempotent); called from the flag-on collect. */
export function ensureScreenFeelPassRegistered(): void {
  if (releasePass) return;
  if (registeredPostPasses().some((pass) => pass.id === SCREEN_FEEL_PASS_ID)) return;
  releasePass = registerPostPass(SCREEN_FEEL_PASS);
}

/** Test seam: drop the lazily-registered pass (the next flag-on collect re-registers it). */
export function resetScreenFeelPass(): void {
  releasePass?.();
  releasePass = null;
}

/** C-01 bridge contributor (see the file header for the per-frame order). */
export const SCREEN_FEEL_CONTRIBUTOR: FrameContributor = {
  id: SCREEN_FEEL_PASS_ID,
  owner: "prd03",
  flag: "A3D_QR_POST",
  phases: ["collect", "post-hdr"],
  // Before `prd08.screenFeel` (order 0) so its same-phase consumed read sees
  // the previous frame's application.
  order: -1,
  collect(items: RenderItem[], ctx: FrameContributorContext): RenderItem[] {
    ensureScreenFeelPassRegistered();
    const state = stateFor(ctx.device);
    state.appliedLastFrame = state.appliedThisFrame;
    state.appliedThisFrame = false;
    state.uniforms = null;
    state.blackboard = ctx.blackboard;
    if (state.appliedLastFrame) ctx.blackboard.set(SCREEN_FEEL_CONSUMED_KEY, true);
    return items;
  },
  passes(phase, ctx) {
    if (phase === "post-hdr") {
      const state = stateFor(ctx.device);
      state.uniforms = readScreenFeelUniforms(ctx.blackboard.get(SCREEN_FEEL_KEY));
      state.blackboard = ctx.blackboard;
    }
    return [];
  }
};

let releaseContributor: (() => void) | null = null;

/** Lane barrel entry: registers the bridge contributor (inactive flag-off). */
export function registerScreenFeelConsumer(): void {
  if (releaseContributor) return;
  releaseContributor = registerFrameContributor(SCREEN_FEEL_CONTRIBUTOR);
}

/** Diagnostics/test accessor for one device's frame state. */
export function screenFeelFrameState(device: RenderDevice): Readonly<Pick<ScreenFeelDeviceState, "uniforms" | "appliedThisFrame" | "appliedLastFrame" | "appliedFrames">> {
  const s = stateFor(device);
  return { uniforms: s.uniforms, appliedThisFrame: s.appliedThisFrame, appliedLastFrame: s.appliedLastFrame, appliedFrames: s.appliedFrames };
}
