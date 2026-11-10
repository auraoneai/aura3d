/**
 * IC47-V2: a restrained screen-space heat shimmer over the Airstrip deck.
 * Paired GLSL 300 es + WGSL fullscreen post-pass so both WebGL2 and WebGPU (`backend: "auto"`)
 * execute natively with zero shader-unavailable fallback warnings.
 * The pass is mounted only for the GU47 Airstrip look on non-Low, non-coarse-pointer devices with motion and VFX enabled.
 */
import { effects, type AuraCustomPostPass } from "@aura3d/engine";

export const AIRSTRIP_HAZE_PASS = "ic-airstrip-haze";

const GLSL = `
uniform float u_icTime;
void main() {
  vec2 uv = v_uv;
  // A soft band above the deck, with no sharp edge or persistent flash.
  float band = smoothstep(0.20, 0.30, uv.y) * (1.0 - smoothstep(0.46, 0.55, uv.y));
  float wave = sin(uv.y * 105.0 + u_icTime * 2.0 + sin(uv.x * 30.0 - u_icTime) * 1.5);
  float lift = sin(uv.x * 45.0 + uv.y * 35.0 - u_icTime * 1.4);
  vec2 offset = vec2(wave, lift * 0.25) * (0.0015 * band);
  outColor = texture(u_color, clamp(uv + offset, vec2(0.0), vec2(1.0)));
}`;

/**
 * WebGPU custom post-pass bind layout (`WebGPUDevice.executeWebGPUCustomPass`):
 *  - binding 0: uniform array<vec4<f32>, 2> (`u_params[0] = vec4(texelSize, timeSeconds, 0)`, `u_params[1].x = u_icTime`)
 *  - binding 1: linear clamp sampler
 *  - binding 2: source scene color texture
 */
const WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> u_params: array<vec4<f32>, 2>;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>) -> @location(0) vec4<f32> {
  let icTime = u_params[1].x;
  let glY = 1.0 - v_uv.y;
  let band = smoothstep(0.20, 0.30, glY) * (1.0 - smoothstep(0.46, 0.55, glY));
  let wave = sin(glY * 105.0 + icTime * 2.0 + sin(v_uv.x * 30.0 - icTime) * 1.5);
  let lift = sin(v_uv.x * 45.0 + glY * 35.0 - icTime * 1.4);
  let offset = vec2<f32>(wave, -lift * 0.25) * (0.0015 * band);
  let sampleUv = clamp(v_uv + offset, vec2<f32>(0.0), vec2<f32>(1.0));
  return textureSample(u_color, u_sampler, sampleUv);
}`;

export function airstripHazePass(): AuraCustomPostPass {
  return effects.shaderPass({
    name: AIRSTRIP_HAZE_PASS,
    order: "before-tonemap",
    glsl: GLSL,
    wgsl: WGSL,
    uniforms: { u_icTime: 0 }
  });
}
