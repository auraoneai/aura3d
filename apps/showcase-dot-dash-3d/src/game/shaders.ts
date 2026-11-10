// Glint Courier — paired GLSL 300 es + WGSL custom shaders for WebGPU + WebGL2 (`backend: "auto"`).
// Strictly follows Aura3D 5.5.1 binding rules: no redeclared uniforms in GLSL, `/* @aura3d-bindings */` +
// `a3dRasterPosition(...)` + `aura.u_<name>` + `u_<tex>Texture` / `u_<tex>Sampler` in WGSL.

import { dualEnergyFieldSpec, type CustomMaterialSpec } from "../../../showcase-port-shared/dual-shaders";
import { WGSL_CLIP, WGSL_MATH, wgslStage } from "../../../showcase-port-shared/wgsl-twins";
import type { FlipbookAtlasSpec } from "../../../showcase-port-shared/vfx-pack";

export { dualEnergyFieldSpec };

const VARYING_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const VARYING_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct CourierVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> CourierVarying {
  var out: CourierVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/**
 * Paired GLSL + WGSL animated PCB reactor bus pad under the central sentry hub:
 * concentric copper-bus rings + radial clock traces + surge pulse wave.
 */
export function dualCircuitBusSpec(options: {
  readonly copperColor?: readonly [number, number, number];
  readonly pulseColor?: readonly [number, number, number];
  readonly pulseSpeed?: number;
} = {}): CustomMaterialSpec {
  const copperColor = options.copperColor ?? [0.82, 0.48, 0.22];
  const pulseColor = options.pulseColor ?? [0.36, 0.94, 1.0];
  const pulseSpeed = options.pulseSpeed ?? 2.4;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float rings = smoothstep(0.55, 0.92, 0.5 + 0.5 * cos(r * 22.0 - uTime * pulseSpeed));
  float spokes = smoothstep(0.78, 0.98, abs(cos(ang * 4.0)));
  float mask = clamp(rings * 0.72 + spokes * 0.42 * smoothstep(0.18, 0.42, r), 0.0, 1.0);
  float edgeFade = 1.0 - smoothstep(0.72, 0.98, r);
  float sweep = 0.5 + 0.5 * sin(uTime * pulseSpeed * 1.3 - r * 8.0);
  vec3 col = mix(copperColor * 0.55, pulseColor * 1.35, sweep * rings) * (0.45 + 0.95 * mask);
  float alpha = clamp(edgeFade * (0.18 + 0.68 * mask), 0.0, 0.88);
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _w = vWorld;
  let p = vUv * 2.0 - vec2<f32>(1.0, 1.0);
  let r = length(p);
  let ang = atan2(p.y, p.x);
  let rings = smoothstep(0.55, 0.92, 0.5 + 0.5 * cos(r * 22.0 - aura.u_time * aura.u_pulseSpeed));
  let spokes = smoothstep(0.78, 0.98, abs(cos(ang * 4.0)));
  let mask = clamp(rings * 0.72 + spokes * 0.42 * smoothstep(0.18, 0.42, r), 0.0, 1.0);
  let edgeFade = 1.0 - smoothstep(0.72, 0.98, r);
  let sweep = 0.5 + 0.5 * sin(aura.u_time * aura.u_pulseSpeed * 1.3 - r * 8.0);
  let col = mix(aura.u_copperColor * 0.55, aura.u_pulseColor * 1.35, sweep * rings) * (0.45 + 0.95 * mask);
  let alpha = clamp(edgeFade * (0.18 + 0.68 * mask), 0.0, 0.88);
  return vec4<f32>(col, alpha);
}`);

  return {
    glsl: { vertex: VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      copperColor: { type: "color3", value: [...copperColor] },
      pulseColor: { type: "color3", value: [...pulseColor] },
      pulseSpeed: { type: "f32", value: pulseSpeed }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

/**
 * Paired GLSL + WGSL sprite-sheet flipbook burst shader sampling `createFlipbookAtlas("sparks")`
 * (`columns` x `rows` = 32 frames) with runtime `frame`, `tint`, and `opacity` uniforms.
 */
export function dualSparkFlipbookSpec(atlasSpec: FlipbookAtlasSpec): CustomMaterialSpec {
  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  float idx = floor(clamp(frame, 0.0, grid.x * grid.y - 1.0));
  float col = mod(idx, grid.x);
  float row = floor(idx / grid.x);
  vec2 cellUv = (vec2(col, row) + clamp(vUv, 0.02, 0.98)) / grid;
  vec4 sampleTex = texture(atlas, cellUv);
  float a = sampleTex.a * opacity;
  vec3 c = sampleTex.rgb * tint * (1.35 + sampleTex.a * 0.9);
  outColor = vec4(c * a, a);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _w = vWorld;
  let maxIdx = aura.u_grid.x * aura.u_grid.y - 1.0;
  let idx = floor(clamp(aura.u_frame, 0.0, maxIdx));
  let col = idx - aura.u_grid.x * floor(idx / aura.u_grid.x);
  let row = floor(idx / aura.u_grid.x);
  let clampedUv = clamp(vUv, vec2<f32>(0.02, 0.02), vec2<f32>(0.98, 0.98));
  let cellUv = (vec2<f32>(col, row) + clampedUv) / aura.u_grid;
  let sampleTex = textureSample(u_atlasTexture, u_atlasSampler, cellUv);
  let a = sampleTex.a * aura.u_opacity;
  let c = sampleTex.rgb * aura.u_tint * (1.35 + sampleTex.a * 0.9);
  return vec4<f32>(c * a, a);
}`);

  return {
    glsl: { vertex: VARYING_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: VARYING_WGSL, fragment: fragmentWgsl },
    uniforms: {
      atlas: { type: "texture2d", value: atlasSpec.texture },
      grid: { type: "vec2", value: [atlasSpec.columns, atlasSpec.rows] },
      frame: { type: "f32", value: 0 },
      tint: { type: "color3", value: [1, 0.85, 0.45] },
      opacity: { type: "f32", value: 0 }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  };
}
