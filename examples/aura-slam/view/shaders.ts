/**
 * WP-01 Dual-Backend Custom Shaders (GLSL 300 es + WGSL) for Aura Slam 3D:
 *   1. `netMeshShaderSpec`: sub-pixel `fwidth` derivative-filtered 4.2 cm square woven cord net with
 *      grazed Fresnel specular rim, knot intersections, top-tape shadow, and ball-impact elastic ripple (`uNetImpact`).
 *   2. `racketStringsShaderSpec`: derivative-antialiased 16x19 gut string-bed grid for carbon-graphite rackets,
 *      resolving individual strings up close and blending cleanly to translucent mean coverage at broadcast range.
 *
 * Strictly follows Aura3D 5.5.1 `material.custom` rules:
 *   - No redeclared uniforms in GLSL (engine prelude injects `spec.uniforms`).
 *   - WGSL uses `/* @aura3d-bindings * /`, `a3dRasterPosition(...)`, and `aura.u_<name>`.
 */
import type { AuraCustomMaterialSpec } from "@aura3d/engine";
import { WGSL_CLIP, WGSL_ENVIRONMENT_FOG, WGSL_MATH, wgslStage } from "../../../apps/showcase-port-shared/wgsl-twins";

export interface NetMeshShaderOptions {
  readonly cordColor?: readonly [number, number, number];
  readonly rimColor?: readonly [number, number, number];
  readonly sunDir?: readonly [number, number, number];
  readonly cellCells?: number;
  readonly cordRatio?: number;
  readonly netOpacity?: number;
}

/**
 * Paired GLSL 3.00 + WGSL derivative-filtered 4.2 cm woven-cord tennis net shader.
 * `netImpact` (`uNetImpact`) packs `[hitX, impulseZ, elapsed, direction]`.
 */
export function netMeshShaderSpec(options: NetMeshShaderOptions = {}): AuraCustomMaterialSpec {
  const cordColor = options.cordColor ?? [0.032, 0.058, 0.049];
  const rimColor = options.rimColor ?? [0.76, 0.86, 0.8];
  const sunDir = options.sunDir ?? [0.32, 0.78, 0.54];
  const cellCells = options.cellCells ?? 4.0;
  const cordRatio = options.cordRatio ?? 0.1875;
  const netOpacity = options.netOpacity ?? 0.84;

  const vertexGlsl = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vec3 pos = position;
  float imp = netImpact.y;
  if (abs(imp) > 0.0001) {
    float postPin = max(0.0, 1.0 - (pos.x / 5.94) * (pos.x / 5.94));
    float dx = abs(pos.x - netImpact.x);
    float ripple = sin(dx * 13.5 - netImpact.z * 26.0) * exp(-dx * 0.58);
    pos.z += imp * 0.35 * postPin * ripple * clamp(pos.y / 0.9, 0.0, 1.0);
  }
  vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`;

  const vertexWgsl = wgslStage([WGSL_CLIP], /* wgsl */ `
struct NetVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> NetVarying {
  var out: NetVarying;
  out.vUv = a_uv;
  var pos = a_position;
  let imp = aura.u_netImpact.y;
  if (abs(imp) > 0.0001) {
    let postPin = max(0.0, 1.0 - (pos.x / 5.94) * (pos.x / 5.94));
    let dx = abs(pos.x - aura.u_netImpact.x);
    let ripple = sin(dx * 13.5 - aura.u_netImpact.z * 26.0) * exp(-dx * 0.58);
    pos.z = pos.z + imp * 0.35 * postPin * ripple * clamp(pos.y / 0.9, 0.0, 1.0);
  }
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(pos, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(pos, 1.0));
  return out;
}`);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 gridUv = vUv * cellCells;
  vec2 fw = max(fwidth(gridUv), vec2(1e-4));
  vec2 dist = abs(fract(gridUv - 0.5) - 0.5);
  float hw = cordRatio * 0.5;
  float lineX = 1.0 - smoothstep(hw - fw.x * 0.75, hw + fw.x * 0.75, dist.x);
  float lineY = 1.0 - smoothstep(hw - fw.y * 0.75, hw + fw.y * 0.75, dist.y);
  float knot = lineX * lineY;
  float sharp = clamp(max(lineX, lineY) + knot * 0.16, 0.0, 1.0);
  float mip = smoothstep(0.18, 0.68, max(fw.x, fw.y));
  float meanAlpha = 1.0 - (1.0 - cordRatio) * (1.0 - cordRatio);
  float coverage = mix(sharp, meanAlpha, mip);

  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);
  float ndotl = 0.42 + 0.58 * max(dot(N, L), 0.0);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float spec = pow(max(dot(N, H), 0.0), 28.0) * 0.24;
  float tapeShade = mix(0.72, 1.0, smoothstep(0.0, 0.12, 0.96 - vWorld.y));
  float hitGlow = exp(-pow((vWorld.x - netImpact.x) / 1.15, 2.0)) * clamp(abs(netImpact.y) * 18.0, 0.0, 0.35);

  vec3 col = cordColor * ndotl * tapeShade + rimColor * (fresnel * 0.26 + spec + hitGlow * 0.35);
  float alpha = clamp(coverage * netOpacity + fresnel * 0.06, 0.02, 0.94);
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let gridUv = vUv * aura.u_cellCells;
  let fw = max(fwidth(gridUv), vec2<f32>(1e-4));
  let dist = abs(fract(gridUv - vec2<f32>(0.5)) - vec2<f32>(0.5));
  let hw = aura.u_cordRatio * 0.5;
  let lineX = 1.0 - smoothstep(hw - fw.x * 0.75, hw + fw.x * 0.75, dist.x);
  let lineY = 1.0 - smoothstep(hw - fw.y * 0.75, hw + fw.y * 0.75, dist.y);
  let knot = lineX * lineY;
  let sharp = clamp(max(lineX, lineY) + knot * 0.16, 0.0, 1.0);
  let mip = smoothstep(0.18, 0.68, max(fw.x, fw.y));
  let meanAlpha = 1.0 - (1.0 - aura.u_cordRatio) * (1.0 - aura.u_cordRatio);
  let coverage = mix(sharp, meanAlpha, mip);

  var N = normalize(vNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 0.0, 1.0));
  if (dot(N, V) < 0.0) { N = -N; }
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let H = a3dSafeNormalize3(L + V, vec3<f32>(0.0, 1.0, 0.0));
  let ndotl = 0.42 + 0.58 * max(dot(N, L), 0.0);
  let fresnel = a3dPow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  let spec = a3dPow(max(dot(N, H), 0.0), 28.0) * 0.24;
  let tapeShade = mix(0.72, 1.0, smoothstep(0.0, 0.12, 0.96 - vWorld.y));
  let dxHit = (vWorld.x - aura.u_netImpact.x) / 1.15;
  let hitGlow = exp(-(dxHit * dxHit)) * clamp(abs(aura.u_netImpact.y) * 18.0, 0.0, 0.35);

  let col = aura.u_cordColor * (ndotl * tapeShade) + aura.u_rimColor * (fresnel * 0.26 + spec + hitGlow * 0.35);
  let fogged = a3dApplyEnvironmentFog(col, vWorld, fragCoord.xy);
  let alpha = clamp(coverage * aura.u_netOpacity + fresnel * 0.06, 0.02, 0.94);
  return vec4<f32>(fogged, alpha);
}`);

  return {
    glsl: { vertex: vertexGlsl, fragment: fragmentGlsl },
    wgsl: { vertex: vertexWgsl, fragment: fragmentWgsl },
    uniforms: {
      cordColor: { type: "color3", value: [...cordColor] },
      rimColor: { type: "color3", value: [...rimColor] },
      sunDir: { type: "vec3", value: [...sunDir] },
      cellCells: { type: "f32", value: cellCells },
      cordRatio: { type: "f32", value: cordRatio },
      netOpacity: { type: "f32", value: netOpacity },
      netImpact: { type: "vec4", value: [0, 0, 0, 0] }
    },
    uniformAliases: { uNetImpact: "netImpact" },
    transparent: true,
    depthWrite: false,
    side: "double",
    fog: true
  };
}

/**
 * Paired GLSL 3.00 + WGSL derivative-antialiased 16x19 gut string-bed shader for both athletes' rackets.
 * Maps local `position.xz` across the 0.32 m string-bed disc with grazed gut specular sheen.
 */
export function racketStringsShaderSpec(): AuraCustomMaterialSpec {
  const vertexGlsl = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vBedUv;
void main() {
  vBedUv = position.xz / 0.32 + vec2(0.5);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

  const vertexWgsl = wgslStage([WGSL_CLIP], /* wgsl */ `
struct StringsVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vBedUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> StringsVarying {
  let _uv = a_uv;
  var out: StringsVarying;
  out.vBedUv = a_position.xz / 0.32 + vec2<f32>(0.5);
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vBedUv;
out vec4 outColor;
void main() {
  vec2 grid = vBedUv * vec2(16.0, 19.0);
  vec2 fw = max(fwidth(grid), vec2(1e-4));
  vec2 d = abs(fract(grid - 0.5) - 0.5);
  float hw = stringRatio * 0.5;
  float mainStr = 1.0 - smoothstep(hw - fw.x * 0.7, hw + fw.x * 0.7, d.x);
  float crossStr = 1.0 - smoothstep(hw - fw.y * 0.7, hw + fw.y * 0.7, d.y);
  float sharp = max(mainStr, crossStr);
  float mip = smoothstep(0.18, 0.65, max(fw.x, fw.y));
  float meanAlpha = 1.0 - (1.0 - stringRatio) * (1.0 - stringRatio);
  float coverage = mix(sharp, meanAlpha, mip);

  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 42.0) * 0.45;
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.8);
  vec3 col = gutColor * (0.62 + 0.38 * max(dot(N, L), 0.0)) + vec3(0.95, 0.98, 0.9) * (spec + fresnel * 0.22);
  float alpha = clamp(coverage * bedOpacity + fresnel * 0.08, 0.04, 0.88);
  outColor = vec4(col, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vBedUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let grid = vBedUv * vec2<f32>(16.0, 19.0);
  let fw = max(fwidth(grid), vec2<f32>(1e-4));
  let d = abs(fract(grid - vec2<f32>(0.5)) - vec2<f32>(0.5));
  let hw = aura.u_stringRatio * 0.5;
  let mainStr = 1.0 - smoothstep(hw - fw.x * 0.7, hw + fw.x * 0.7, d.x);
  let crossStr = 1.0 - smoothstep(hw - fw.y * 0.7, hw + fw.y * 0.7, d.y);
  let sharp = max(mainStr, crossStr);
  let mip = smoothstep(0.18, 0.65, max(fw.x, fw.y));
  let meanAlpha = 1.0 - (1.0 - aura.u_stringRatio) * (1.0 - aura.u_stringRatio);
  let coverage = mix(sharp, meanAlpha, mip);

  var N = normalize(vNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  if (dot(N, V) < 0.0) { N = -N; }
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let H = a3dSafeNormalize3(L + V, vec3<f32>(0.0, 1.0, 0.0));
  let spec = a3dPow(max(dot(N, H), 0.0), 42.0) * 0.45;
  let fresnel = a3dPow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.8);
  let col = aura.u_gutColor * (0.62 + 0.38 * max(dot(N, L), 0.0)) + vec3<f32>(0.95, 0.98, 0.9) * (spec + fresnel * 0.22);
  let fogged = a3dApplyEnvironmentFog(col, vWorld, fragCoord.xy);
  let alpha = clamp(coverage * aura.u_bedOpacity + fresnel * 0.08, 0.04, 0.88);
  return vec4<f32>(fogged, alpha);
}`);

  return {
    glsl: { vertex: vertexGlsl, fragment: fragmentGlsl },
    wgsl: { vertex: vertexWgsl, fragment: fragmentWgsl },
    uniforms: {
      gutColor: { type: "color3", value: [0.88, 0.89, 0.8] },
      sunDir: { type: "vec3", value: [0.32, 0.78, 0.54] },
      stringRatio: { type: "f32", value: 0.165 },
      bedOpacity: { type: "f32", value: 0.78 }
    },
    transparent: true,
    depthWrite: false,
    side: "double",
    fog: true
  };
}
