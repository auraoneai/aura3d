/**
 * `prd08.cameraFade` — C-02 chunk + feature for the lane-08 occluder
 * screen-door fade (PRD-08 §8.2, S-1/S-2).
 *
 * The `prd08.occluderFade` collect contributor writes `RenderItem.cameraFade`
 * (1 = opaque; CONTRACTS §3.3). When the value is < 0.999 this feature turns on
 * bit `cameraFade` for the draw's variant key and the fragment runs a Bayer-4
 * stipple discard as the first alpha-stage statement — a screen-door fade that
 * keeps the occluder casting shadows (depth/distance variants never select it)
 * and disables early-Z only on the faded variant.
 *
 * `u_cameraFadeOffset` cycles (0,0) (2,2) (2,0) (0,2) for frames using
 * temporal AA; without it the offset holds (0,0).
 *
 * The frozen legacy `ShaderLibrary.ts` is not edited (Q-01-1); the WebGPU
 * packed-uniform wiring is Q-11-1.
 */
import type { RenderItem } from "../contracts/renderItem";
import type { ShaderChunk, ShaderFeature } from "../contracts/program";
import type { FrameContributor } from "../contracts/frameGraph";
import { registeredPostPasses } from "../contracts/post";

const BAYER_GLSL = `float a3dBayer4(vec2 p) {
  ivec2 i = ivec2(mod(floor(p), 4.0));
  int idx = i.x + i.y * 4;
  const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}`;

const BAYER_WGSL = `fn a3dBayer4(p: vec2<f32>) -> f32 {
  let m = array<f32, 16>(0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  let i = vec2<i32>(floor(p) % vec2<f32>(4.0));
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}`;

/** Uniform declarations + Bayer helper, inserted at `fragment:pars`. */
export const cameraFadeParsChunk: ShaderChunk = {
  name: "a3d_prd08_cameraFadePars",
  owner: "prd08",
  stage: "fragment",
  glsl: `uniform float u_cameraFade;
uniform vec2 u_cameraFadeOffset;   // per-frame pattern offset in pixels, integer 0..3
${BAYER_GLSL}
void a3dCameraFadeDiscard() {
  if (u_cameraFade < 0.999 && a3dBayer4(gl_FragCoord.xy + u_cameraFadeOffset) >= u_cameraFade) discard;
}
`,
  wgsl: `@group(1) @binding(0) var<uniform> a3dCameraFadeParams: vec4<f32>; // x: fade, yz: offset
${BAYER_WGSL}
fn a3dCameraFadeDiscard(pos: vec4<f32>, params: vec4<f32>) {
  if (params.x < 0.999 && a3dBayer4(pos.xy + params.yz) >= params.x) { discard; }
}
`
};

/** First alpha-stage statement: the guarded stipple discard itself. */
export const cameraFadeDiscardChunk: ShaderChunk = {
  name: "a3d_prd08_cameraFadeDiscard",
  owner: "prd08",
  stage: "fragment",
  requires: ["a3d_prd08_cameraFadePars"],
  glsl: `a3dCameraFadeDiscard();`,
  wgsl: `a3dCameraFadeDiscard(a3dFragCoord, a3dCameraFadeParams);`
};

/**
 * The legacy offset channel remains available to unscoped callers. Renderer
 * frames instead attach their own immutable offset to each collected draw.
 */
export const cameraFadeOffset: [number, number] = [0, 0];

const OFFSET_CYCLE: readonly (readonly [number, number])[] = [[0, 0], [2, 2], [2, 0], [0, 2]];
const frameOffset: unique symbol = Symbol("aura.cameraFade.frameOffset");
type ScopedFadeItem = RenderItem & {
  readonly [frameOffset]?: readonly [number, number];
  readonly temporalObjectKey?: object | string | number | symbol;
};

function offsetForFrame(frameIndex: number, taaActive: boolean): readonly [number, number] {
  const index = Number.isFinite(frameIndex) ? Math.abs(Math.trunc(frameIndex)) % OFFSET_CYCLE.length : 0;
  return taaActive ? OFFSET_CYCLE[index]! : OFFSET_CYCLE[0]!;
}

/** Called once per frame by the `prd08.cameraFadeOffset` contributor. */
export function setCameraFadeOffset(frameIndex: number, taaActive: boolean): void {
  const next = offsetForFrame(frameIndex, taaActive);
  cameraFadeOffset[0] = next[0];
  cameraFadeOffset[1] = next[1];
}

function taaRegistered(): boolean {
  return registeredPostPasses().some((p) => p.id.toLowerCase().includes("taa"));
}

/**
 * Scoped frames snapshot their own offset onto the draw so overlapping
 * renderers and repeated views cannot replace a pending frame's uniforms.
 * Unscoped callers retain the historical registered-pass lookup.
 */
export function createCameraFadeOffsetContributor(): FrameContributor {
  return {
    id: "prd08.cameraFadeOffset",
    owner: "prd08",
    flag: "A3D_QR_CAMERA",
    phases: ["collect"],
    collect(items, ctx) {
      const taa = ctx.flags.on("A3D_QR_CAMERA")
        && (ctx.postScopeId ? ctx.temporalAntialiasing === true : taaRegistered());
      setCameraFadeOffset(ctx.frameIndex, taa);
      if (!ctx.postScopeId) return items;
      const offset = offsetForFrame(ctx.frameIndex, taa);
      return items.map((item) => ({
        ...item,
        // Preserve the stable source identity through this frame-local copy.
        temporalObjectKey: (item as ScopedFadeItem).temporalObjectKey ?? item,
        [frameOffset]: offset
      }));
    }
  };
}

export const CAMERA_FADE_BIT = "cameraFade";

export const cameraFadeFeature: ShaderFeature = {
  id: "prd08.cameraFade",
  owner: "prd08",
  flag: "A3D_QR_CAMERA",
  chunks: ["a3d_prd08_cameraFadePars", "a3d_prd08_cameraFadeDiscard"],
  hooks: ["fragment:pars", "fragment:alpha"],
  select(input) {
    const fade: number | undefined = input.item.cameraFade;
    // Shadow/depth variants never request the feature (C-11): the occluder
    // still casts onto the subject while it fades visually.
    if (input.pass !== "forward") return undefined;
    if (fade === undefined || fade >= 0.999) return undefined;
    return CAMERA_FADE_BIT;
  },
  defines() {
    return { A3D_CAMERA_FADE: true };
  },
  bindUniforms(_value, item: RenderItem, set) {
    set("u_cameraFade", item.cameraFade ?? 1);
    const offset = (item as ScopedFadeItem)[frameOffset] ?? cameraFadeOffset;
    set("u_cameraFadeOffset", [offset[0], offset[1]]);
  }
};

export function registerCameraFadeShader(registerChunk: (c: ShaderChunk) => void, registerFeature: (f: ShaderFeature) => () => void): () => void {
  registerChunk(cameraFadeParsChunk);
  registerChunk(cameraFadeDiscardChunk);
  return registerFeature(cameraFadeFeature);
}
