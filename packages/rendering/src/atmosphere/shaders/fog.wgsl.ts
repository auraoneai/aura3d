// Native WGSL form of the PRD-07 forward fog chunk (`a3d_prd07_fog`, see
// fog.glsl.ts). The generated WebGPU PBR and unlit programs include it only
// when the stock `prd07.fog` feature is selected. The GLSL chunk's uniforms
// arrive packed in the material struct (fields named below, see
// PRD07_FOG_WGSL_FIELDS); `u_fogColor` is the material's existing `fogColor`.
//
// Forward programs never define FOG_VOLUMETRIC (the froxel volume is
// composited by the volumetric fog pass), so the froxel branch is absent here
// exactly as it is compiled out of the GLSL chunk.

import { A3D_MAX_FOG_VOLUMES } from "../FogVolumes";
import type { UniformValue } from "../../RenderDevice";

/** Material struct fields the chunk reads (appended after existing members). */
export const PRD07_FOG_WGSL_FIELDS: readonly { readonly name: string; readonly length?: number }[] = [
  { name: "prd07FogA" },          // u_fogA
  { name: "prd07FogB" },          // u_fogB
  { name: "prd07FogAbsorption" }, // xyz u_fogAbsorption, w u_fogMode
  { name: "prd07FogRange" },      // x u_fogNear, y u_fogFar
  { name: "prd07FogCamera" },     // xyz u_cameraPosition
  { name: "prd07FogSunDirection" },
  { name: "prd07FogSunColor" },
  { name: "prd07FogVolumes", length: 2 * A3D_MAX_FOG_VOLUMES }
];

/** `a3dPrd07ApplyFog(color, worldPos)`; `m` is the material struct variable name. */
export function prd07FogWgsl(m = "material"): string {
  return `
// a3d_prd07_fog (WGSL)
fn a3dPrd07HeightFogTau(c: vec3f, v: vec3f, d: f32) -> f32 {
  let dd = max(d - ${m}.prd07FogB.x, 0.0);
  var tau = ${m}.prd07FogA.x * dd;
  let k = ${m}.prd07FogA.z * v.y * dd;
  let line = select((1.0 - exp(-k)) / k, 1.0, abs(k) < 1e-4);
  tau += ${m}.prd07FogA.y * exp(-${m}.prd07FogA.z * (c.y - ${m}.prd07FogA.w)) * dd * line;
  return tau;
}

fn a3dPrd07FogVolumesTau(c: vec3f, v: vec3f, d: f32) -> f32 {
  var tau = 0.0;
  for (var i = 0u; i < ${A3D_MAX_FOG_VOLUMES}u; i += 1u) {
    let a = ${m}.prd07FogVolumes[i * 2u];
    let b = ${m}.prd07FogVolumes[i * 2u + 1u];
    if (b.w <= 0.0) { continue; }
    var t0 = 0.0;
    var t1 = d;
    var hit = true;
    for (var axis = 0u; axis < 3u; axis += 1u) {
      let o = c[axis] - a.xyz[axis];
      let dv = v[axis];
      let half_ = b.xyz[axis];
      if (abs(dv) < 1e-9) {
        if (abs(o) > half_) { hit = false; }
        continue;
      }
      let ta = (-half_ - o) / dv;
      let tb = (half_ - o) / dv;
      t0 = max(t0, min(ta, tb));
      t1 = min(t1, max(ta, tb));
    }
    if (a.w > 0.5) {
      let os = (c - a.xyz) / max(b.xyz, vec3f(1e-9));
      let vs = v / max(b.xyz, vec3f(1e-9));
      let qa = dot(vs, vs);
      if (qa < 1e-12) { hit = false; }
      let qb = dot(os, vs);
      let qc = dot(os, os) - 1.0;
      let qd = qb * qb - qa * qc;
      if (qd < 0.0 || !hit) { hit = false; }
      else {
        let qr = sqrt(qd);
        t0 = max((-qb - qr) / qa, 0.0);
        t1 = min((-qb + qr) / qa, d);
      }
    } else {
      t0 = max(t0, 0.0);
      t1 = min(t1, d);
    }
    if (hit && t1 > t0) { tau += (t1 - t0) * b.w; }
  }
  return tau;
}

fn a3dPrd07LegacyFogFactor(worldPosition: vec3f) -> f32 {
  let distanceToCamera = length(${m}.prd07FogCamera.xyz - worldPosition);
  var factor = 0.0;
  let legacyMode = ${m}.prd07FogA.w;
  if (legacyMode < 1.5) {
    factor = (distanceToCamera - ${m}.prd07FogB.x) / max(${m}.prd07FogB.y - ${m}.prd07FogB.x, 0.000001);
  } else if (legacyMode < 2.5) {
    factor = 1.0 - exp(-max(${m}.prd07FogA.x, 0.0) * distanceToCamera);
  } else {
    let scaledDensity = max(${m}.prd07FogA.x, 0.0) * distanceToCamera;
    factor = 1.0 - exp(-(scaledDensity * scaledDensity));
  }
  let heightMultiplier = select(1.0, exp(-max(0.0, worldPosition.y - ${m}.prd07FogA.z) * ${m}.prd07FogA.y), ${m}.prd07FogA.y > 0.0);
  return clamp(factor * heightMultiplier, 0.0, 1.0) * clamp(${m}.prd07FogB.z, 0.0, 1.0);
}

fn a3dPrd07FogAmount(worldPos: vec3f) -> f32 {
  let mode = ${m}.prd07FogAbsorption.w;
  if (mode == 6.0) { return a3dPrd07LegacyFogFactor(worldPos); }
  let camera = ${m}.prd07FogCamera.xyz;
  let r = worldPos - camera; let d = length(r); let v = r / max(d, 1e-5);
  var tau = 0.0;
  if (mode == 1.0) { tau = a3dPrd07HeightFogTau(camera, v, d); }
  else if (mode == 2.0) { tau = ${m}.prd07FogA.x * d; }
  else if (mode == 3.0) { tau = (${m}.prd07FogA.x * d) * (${m}.prd07FogA.x * d); }
  tau += a3dPrd07FogVolumesTau(camera, v, d);
  let f = select(1.0 - exp(-tau), clamp((d - ${m}.prd07FogRange.x) / (${m}.prd07FogRange.y - ${m}.prd07FogRange.x), 0.0, 1.0), mode == 4.0);
  return min(f, ${m}.prd07FogB.y);
}

fn a3dPrd07FogInscatter(v: vec3f) -> vec3f {
  let g = ${m}.prd07FogB.w; let mu = dot(v, ${m}.prd07FogSunDirection.xyz);
  let hg = (1.0 - g * g) / (12.5663706 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  return ${m}.fogColor.rgb + ${m}.prd07FogSunColor.rgb * hg * ${m}.prd07FogB.z;
}

fn a3dPrd07ApplyFog(color: vec3f, worldPos: vec3f) -> vec3f {
  let mode = ${m}.prd07FogAbsorption.w;
  if (mode == 0.0) { return color; }
  let r = worldPos - ${m}.prd07FogCamera.xyz; let v = normalize(r);
  if (mode == 5.0) {
    let T = exp(-${m}.prd07FogAbsorption.xyz * length(r));
    return color * T + ${m}.fogColor.rgb * (vec3f(1.0) - T);
  }
  let f = a3dPrd07FogAmount(worldPos);
  let fogged = select(a3dPrd07FogInscatter(v), ${m}.fogColor.rgb, mode == 6.0);
  return mix(color, fogged, f);
}
`;
}

type Read = (name: string, length: number, fallback: readonly number[]) => number[];

/** Pack the uniforms `bindPrd07FogUniforms` wrote into the material fields above. */
export function packPrd07FogWgslFields(uniforms: ReadonlyMap<string, UniformValue>, read: Read): Record<string, number[] | number[][]> {
  const zero3 = [0, 0, 0];
  const volumes = read("u_fogVolumes", 2 * A3D_MAX_FOG_VOLUMES * 4, new Array<number>(2 * A3D_MAX_FOG_VOLUMES * 4).fill(0));
  return {
    prd07FogA: read("u_fogA", 4, [0, 0, 0, 0]),
    prd07FogB: read("u_fogB", 4, [0, 0, 0, 0]),
    prd07FogAbsorption: [...read("u_fogAbsorption", 3, zero3), read("u_fogMode", 1, [0])[0]!],
    prd07FogRange: [read("u_fogNear", 1, [0])[0]!, read("u_fogFar", 1, [0])[0]!, 0, 0],
    prd07FogCamera: [...read("u_cameraPosition", 3, zero3), 0],
    prd07FogSunDirection: [...read("u_sunDirection", 3, zero3), 0],
    prd07FogSunColor: [...read("u_sunColor", 3, zero3), 0],
    prd07FogVolumes: Array.from({ length: 2 * A3D_MAX_FOG_VOLUMES }, (_, index) => volumes.slice(index * 4, index * 4 + 4))
  };
}
