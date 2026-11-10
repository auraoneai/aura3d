/**
 * WW47-P3: the gouache paper pass. After tonemapping, a fixed paper fibre and pigment granulation modulate the frame by
 * about 4%, weighted to the midtones (deep shadows and the sun disc stay clean), so flat painted surfaces read as paint on
 * paper. Screen-anchored on purpose: paper does not move with the camera. Off on Low and under `?look=original`.
 */
import { effects } from "@aura3d/engine";
import { createGradingLut } from "../../apps/showcase-port-shared/vfx-pack";

export const PAPER_STRENGTH = 0.04;

let cachedWarmLut: ReturnType<typeof createGradingLut> | null = null;
/** Shared cinema-warm 3D LUT strip for highland golden-hour reference grading. */
export function warmGradingLut() {
  return (cachedWarmLut ??= createGradingLut("cinema-warm"));
}

export const PAPER_GLSL = /* glsl */ `uniform float u_paper;
uniform vec2 u_paperScale;
float paperHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float paperNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(paperHash(i), paperHash(i + vec2(1.0, 0.0)), f.x), mix(paperHash(i + vec2(0.0, 1.0)), paperHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cinemaCurve(float x, float p) {
  float v = clamp(x, 0.0, 1.0);
  return v < 0.5 ? 0.5 * pow(max(2.0 * v, 1e-4), p) : 1.0 - 0.5 * pow(max(2.0 * (1.0 - v), 1e-4), p);
}
void main() {
  vec4 c = texture(u_color, v_uv);
  vec2 p = v_uv * u_paperScale;
  // fibre: long thin streaks at a slight angle; granulation: fine pigment pooling
  float fibre = paperNoise(vec2(p.x * 0.35 + p.y * 0.08, p.y * 2.6)) - 0.5;
  float grain = paperNoise(p * 1.7) * 0.6 + paperNoise(p * 4.3) * 0.4 - 0.5;
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 warm = vec3(
    cinemaCurve(c.r * 1.02 + 0.012 * l, 1.05),
    cinemaCurve(c.g * 1.0 + 0.003 * l, 1.04),
    cinemaCurve(c.b * 0.97 + 0.016 * (1.0 - l), 1.05)
  );
  vec3 graded = mix(c.rgb, warm, 0.3);
  float mid = smoothstep(0.04, 0.3, l) * (1.0 - smoothstep(0.75, 0.98, l));
  float k = 1.0 + u_paper * mid * (fibre * 0.9 + grain * 1.3);
  outColor = vec4(graded * k, c.a);
}`;

/**
 * A3/W6: the same pass as a native WebGPU fullscreen stage (`?backend=webgpu`; WebGL2 keeps drawing `PAPER_GLSL`). The custom-pass
 * bind convention: binding 0 is a `vec4` array (`values[0]` = texel size and time, then one `vec4` per declared uniform in
 * registration order: `u_paper` in `values[1].x`, `u_paperScale` in `values[2].xy`), binding 1 the linear sampler, binding 2
 * `u_color`. WebGPU's uv runs top-down, which only mirrors the screen-anchored paper grain vertically.
 */
export const PAPER_WGSL = /* wgsl */ `struct PaperUniforms { values: array<vec4<f32>, 3> };
@group(0) @binding(0) var<uniform> paper: PaperUniforms;
@group(0) @binding(1) var paperSampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;
fn paperHash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn paperNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(paperHash(i), paperHash(i + vec2<f32>(1.0, 0.0)), f.x), mix(paperHash(i + vec2<f32>(0.0, 1.0)), paperHash(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn cinemaCurve(x: f32, p: f32) -> f32 {
  let v = clamp(x, 0.0, 1.0);
  if (v < 0.5) { return 0.5 * pow(max(2.0 * v, 1e-4), p); }
  return 1.0 - 0.5 * pow(max(2.0 * (1.0 - v), 1e-4), p);
}
@fragment fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSample(u_color, paperSampler, uv);
  let strength = paper.values[1].x;
  let p = uv * paper.values[2].xy;
  let fibre = paperNoise(vec2<f32>(p.x * 0.35 + p.y * 0.08, p.y * 2.6)) - 0.5;
  let grain = paperNoise(p * 1.7) * 0.6 + paperNoise(p * 4.3) * 0.4 - 0.5;
  let l = dot(c.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let warm = vec3<f32>(
    cinemaCurve(c.r * 1.02 + 0.012 * l, 1.05),
    cinemaCurve(c.g * 1.0 + 0.003 * l, 1.04),
    cinemaCurve(c.b * 0.97 + 0.016 * (1.0 - l), 1.05)
  );
  let graded = mix(c.rgb, warm, 0.3);
  let mid = smoothstep(0.04, 0.3, l) * (1.0 - smoothstep(0.75, 0.98, l));
  let k = 1.0 + strength * mid * (fibre * 0.9 + grain * 1.3);
  return vec4<f32>(graded * k, c.a);
}`;

/** Name of the registered pass: `app.post.setPassUniform` addresses it by this. */
export const PAPER_PASS_NAME = "wind-gouache-paper";

/** Paper cells per axis: one cell every 3 drawing-buffer pixels, so the grain stays the same size in pixels at any canvas size. */
export function paperScale(width: number, height: number): [number, number] {
  return [Math.max(1, width) / 3, Math.max(1, height) / 3];
}

/**
 * 5.0 custom-pass contract (`AuraPostPassInput`): the paper reads only the tonemapped colour, so it declares exactly
 * `["color"]`. That is the one input the display tail (`after-tonemap`) provides on WebGL2 and on native WebGPU; `depth`
 * is also available there but unused, and `normal`/`velocity`/`reactive` are HDR-anchor only and would refuse
 * (`POSTPROCESS_INPUT_UNAVAILABLE`) at this stage, so they are deliberately not requested.
 */
export const PAPER_INPUTS = ["color"] as const;

export function paperPass(width: number, height: number, strength: number = PAPER_STRENGTH) {
  return effects.shaderPass({
    name: PAPER_PASS_NAME,
    order: "after-tonemap",
    inputs: PAPER_INPUTS,
    glsl: PAPER_GLSL,
    wgsl: PAPER_WGSL,
    uniforms: { u_paper: strength, u_paperScale: paperScale(width, height) }
  });
}
