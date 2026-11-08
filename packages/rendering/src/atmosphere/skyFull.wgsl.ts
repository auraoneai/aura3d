// WebGPU twin of the full GLSL sky program (sky.glsl.ts): Preetham, gradient
// with bands, flat colour, stars, moon disc and cloud layer, with or without
// background fog. Each branch is a line-for-line port of the GLSL fragment so
// both backends read the same `skyUniforms` values (including the r185
// sunE/betaR/betaM the Preetham frame feeds since the 5.2 sky fix) and draw
// the same pixels. The plain gradient (no bands, stars, clouds or moon) keeps
// its dedicated program in sky.wgsl.ts.

import type { NativeShaderStages, PortableShaderBinding } from "../RenderDevice";
import type { SkyProgramDefines } from "./SkyEval";
import { SKY_BAND_CAPACITY } from "./GradientSky";
import { GRADIENT_SKY_FOG_PORTABLE_BINDINGS, GRADIENT_SKY_PORTABLE_BINDINGS, SKY_FOG_WGSL, skyVertexWgsl } from "./sky.wgsl";

/** Every uniform the GLSL sky fragment reads, in `skyUniforms` order. */
export const FULL_SKY_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_invViewProj", kind: "mat4" },
  { name: "u_sunDirection", kind: "vec3" },
  { name: "u_sunE", kind: "float" },
  { name: "u_sunfade", kind: "float" },
  { name: "u_betaR", kind: "vec3" },
  { name: "u_betaM", kind: "vec3" },
  { name: "u_mieDirectionalG", kind: "float" },
  { name: "u_zenith", kind: "vec3" },
  { name: "u_horizon", kind: "vec3" },
  { name: "u_ground", kind: "vec3" },
  { name: "u_exponent", kind: "float" },
  { name: "u_horizonGlow", kind: "float" },
  { name: "u_bandCount", kind: "i32" },
  { name: "u_bandParams", kind: "vec4", arrayLength: SKY_BAND_CAPACITY },
  { name: "u_bandColors", kind: "vec3", arrayLength: SKY_BAND_CAPACITY },
  { name: "u_intensity", kind: "float" },
  { name: "u_showSunDisc", kind: "float" },
  { name: "u_time", kind: "float" },
  { name: "u_starDensity", kind: "float" },
  { name: "u_starIntensity", kind: "float" },
  { name: "u_cloudCoverage", kind: "float" },
  { name: "u_cloudDensity", kind: "float" },
  { name: "u_cloudElevation", kind: "float" },
  { name: "u_cloudScaleSpeed", kind: "vec2" },
  { name: "u_cloudTint", kind: "vec3" },
  { name: "u_moonDirection", kind: "vec3" },
  { name: "u_moonColor", kind: "vec3" },
  { name: "u_moonPhase", kind: "float" },
  { name: "u_moonIntensity", kind: "float" },
  { name: "u_moonAngularCos", kind: "float" }
];

const GRADIENT_NAMES = new Set(GRADIENT_SKY_PORTABLE_BINDINGS.map((binding) => binding.name));

/** Full bindings plus the packed fog inputs (same names as the gradient fog program). */
export const FULL_SKY_FOG_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  ...FULL_SKY_PORTABLE_BINDINGS,
  ...GRADIENT_SKY_FOG_PORTABLE_BINDINGS.filter((binding) => !GRADIENT_NAMES.has(binding.name))
];

const COMMON = /* wgsl */ `
const SKY_PI = 3.141592653589793;
const RAYLEIGH_ZENITH = 8.4e3;
const MIE_ZENITH = 1.25e3;
const SUN_ANGULAR_DIAMETER_COS = 0.9999566769464484;
const THREE_OVER_SIXTEEN_PI = 0.05968310365946075;
const ONE_OVER_FOUR_PI = 0.07957747154594767;
const SKY_UP = vec3<f32>(0.0, 1.0, 0.0);

fn rayleighPhase(c: f32) -> f32 { return THREE_OVER_SIXTEEN_PI * (1.0 + c * c); }
fn hgPhase(c: f32, g: f32) -> f32 {
  let g2 = g * g;
  return ONE_OVER_FOUR_PI * ((1.0 - g2) / pow(1.0 - 2.0 * g * c + g2, 1.5));
}
fn hash2(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123); }
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0));
  let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 5; i += 1) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}
`;

const PREETHAM = /* wgsl */ `
fn skyPreetham(direction: vec3<f32>) -> vec3<f32> {
  let zenithAngle = acos(max(0.0, dot(SKY_UP, direction)));
  let inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - (zenithAngle * 180.0) / SKY_PI, -1.253));
  let sR = RAYLEIGH_ZENITH * inverse;
  let sM = MIE_ZENITH * inverse;
  let Fex = exp(-(aura.u_betaR * sR + aura.u_betaM * sM));
  let cosTheta = dot(direction, aura.u_sunDirection);
  let rP = rayleighPhase(cosTheta * 0.5 + 0.5);
  let betaRTheta = aura.u_betaR * rP;
  let mP = hgPhase(cosTheta, aura.u_mieDirectionalG);
  let betaMTheta = aura.u_betaM * mP;
  let ratio = (betaRTheta + betaMTheta) / (aura.u_betaR + aura.u_betaM);
  var Lin = pow(max(vec3<f32>(0.0), aura.u_sunE * ratio * (vec3<f32>(1.0) - Fex)), vec3<f32>(1.5));
  Lin *= mix(vec3<f32>(1.0), pow(max(vec3<f32>(0.0), aura.u_sunE * ratio * Fex), vec3<f32>(0.5)),
             vec3<f32>(clamp(pow(1.0 - dot(SKY_UP, aura.u_sunDirection), 5.0), 0.0, 1.0)));
  var L0 = vec3<f32>(0.1) * Fex;
  let sundisc = smoothstep(SUN_ANGULAR_DIAMETER_COS, SUN_ANGULAR_DIAMETER_COS + 0.00002, cosTheta) * aura.u_showSunDisc;
  L0 += (aura.u_sunE * 19000.0 * Fex) * sundisc;
  var texColor = (Lin + L0) * 0.04 + vec3<f32>(0.0, 0.0003, 0.00075);
  if (direction.y < 0.0) {
    let t = clamp(-direction.y * 4.0, 0.0, 1.0);
    texColor = mix(texColor, aura.u_ground * 0.04, vec3<f32>(t));
  }
  return texColor;
}
`;

const GRADIENT = /* wgsl */ `
fn skyGradient(direction: vec3<f32>) -> vec3<f32> {
  let y = direction.y;
  if (y >= 0.0) {
    let t = pow(clamp(y, 0.0, 1.0), 1.0 / aura.u_exponent);
    // Ordered edges: WGSL leaves reversed-edge smoothstep undefined.
    let glow = aura.u_horizonGlow * (1.0 - smoothstep(0.0, 0.25, abs(y)));
    var c = mix(aura.u_horizon, aura.u_zenith, vec3<f32>(t)) + glow * aura.u_horizon;
    let cdot = dot(direction, aura.u_sunDirection);
    let disc = smoothstep(0.9995, 0.9999, cdot);
    let halo = pow(max(0.0, cdot), 350.0) * 0.6;
    c += vec3<f32>(disc * 40.0 + halo, disc * 36.0 + halo * 0.9, disc * 30.0 + halo * 0.7);
    if (aura.u_bandCount > 0) {
      let elev = degrees(asin(clamp(y, -1.0, 1.0)));
      for (var i = 0; i < ${SKY_BAND_CAPACITY}; i += 1) {
        if (i >= aura.u_bandCount) { break; }
        let b = aura.u_bandParams[i];
        let dy = elev - b.x;
        let w = exp(-(dy * dy) / (b.y * b.y * 0.5)) * b.z;
        c += aura.u_bandColors[i] * w;
      }
    }
    return c * aura.u_intensity;
  }
  let t = clamp(-y * 3.0, 0.0, 1.0);
  return mix(aura.u_horizon, aura.u_ground, vec3<f32>(t)) * aura.u_intensity;
}
`;

const MOON = /* wgsl */ `
fn skyMoonDisc(direction: vec3<f32>) -> vec3<f32> {
  let c = dot(direction, aura.u_moonDirection);
  let disc = smoothstep(aura.u_moonAngularCos, aura.u_moonAngularCos + 0.00004, c);
  let illumination = 1.0 - abs(2.0 * aura.u_moonPhase - 1.0);
  return aura.u_moonColor * aura.u_moonIntensity * illumination * 6.0 * disc;
}
`;

const STARS = /* wgsl */ `
fn skyStarfield(direction: vec3<f32>) -> f32 {
  if (aura.u_starDensity <= 0.0) { return 0.0; }
  let theta = acos(clamp(direction.y, -1.0, 1.0));
  let phi = atan2(direction.z, direction.x);
  let uv = vec2<f32>(phi / (2.0 * SKY_PI) + 0.5, theta / SKY_PI) * 512.0;
  let cell = floor(uv);
  let h = hash2(cell);
  if (h > aura.u_starDensity * 0.01) { return 0.0; }
  let centre = cell + 0.5;
  let d = length((uv - centre) / 0.5);
  // Ordered-edge form of the GLSL reversed smoothstep (0.5 -> 0.05).
  let star = 1.0 - smoothstep(0.05, 0.5, d);
  let mag = 0.25 + 0.75 * hash2(cell + 17.0);
  return star * mag * aura.u_starIntensity;
}
`;

function cloudBlock(gradient: boolean): string {
  const light = gradient
    ? `    var cloudColor = mix(color, vec3<f32>(aura.u_intensity), vec3<f32>(0.6)) * mix(0.55, 1.0, clamp(daylight, 0.0, 1.0));`
    : `    var cloudColor = mix(vec3<f32>(0.3), vec3<f32>(1.0), vec3<f32>(daylight));
    cloudColor = mix(cloudColor, color + vec3<f32>(1.0), vec3<f32>(sunInfluence * 0.5));
    cloudColor *= aura.u_sunE * 0.00002;`;
  return /* wgsl */ `
  if (direction.y > 0.0 && aura.u_cloudCoverage > 0.0) {
    let elevation = mix(1.0, 0.1, aura.u_cloudElevation);
    var cloudUV = direction.xz / (direction.y * elevation) * aura.u_cloudScaleSpeed.x;
    cloudUV += aura.u_time * aura.u_cloudScaleSpeed.y;
    var cloudNoise = fbm(cloudUV * 1000.0) + 0.5 * fbm(cloudUV * 2000.0 + 3.7);
    cloudNoise = cloudNoise * 0.5 + 0.5;
    var cloudMask = smoothstep(1.0 - aura.u_cloudCoverage, 1.0 - aura.u_cloudCoverage + 0.3, cloudNoise);
    cloudMask *= smoothstep(0.0, 0.1 + 0.2 * aura.u_cloudElevation, direction.y);
    let sunInfluence = dot(direction, aura.u_sunDirection) * 0.5 + 0.5;
    let daylight = max(0.0, aura.u_sunDirection.y * 2.0);
${light}
    cloudColor *= aura.u_cloudTint;
    color = mix(color, cloudColor, vec3<f32>(cloudMask * aura.u_cloudDensity));
  }`;
}

function fullFragment(d: SkyProgramDefines): string {
  const model =
    d.model === "PREETHAM" ? "color = skyPreetham(direction);" :
    d.model === "GRADIENT" ? "color = skyGradient(direction);" :
    d.model === "COLOR" ? "color = aura.u_zenith;" : "color = vec3<f32>(0.0);";
  return /* wgsl */ `
// aura3d.prd07.sky fragment
/* @aura3d-bindings */
${COMMON}
${d.model === "PREETHAM" ? PREETHAM : ""}
${d.model === "GRADIENT" ? GRADIENT : ""}
${d.moon ? MOON : ""}
${d.stars ? STARS : ""}
${d.fog ? SKY_FOG_WGSL : ""}
@fragment fn fs_main(@location(0) clip: vec2<f32>) -> @location(0) vec4<f32> {
  let world = aura.u_invViewProj * vec4<f32>(clip, 1.0, 1.0);
  let direction = normalize(world.xyz / world.w);
  var color = vec3<f32>(0.0);
  ${model}
  ${d.stars ? "color += vec3<f32>(skyStarfield(direction)) * (1.0 - aura.u_sunfade) * 2.0;" : ""}
  ${d.moon ? "color += skyMoonDisc(direction) * (1.0 - aura.u_sunfade);" : ""}
  ${d.clouds ? cloudBlock(d.model === "GRADIENT") : ""}
  ${d.fog ? "color = skyApplyFog(color, direction);" : ""}
  return vec4<f32>(color, 1.0);
}`;
}

/** Native stages of the full sky variant for `defines`, far plane at `clipZLiteral`. */
export function fullSkyWgsl(d: SkyProgramDefines, clipZLiteral: string): NativeShaderStages {
  return { vertex: skyVertexWgsl(clipZLiteral), fragment: fullFragment(d) };
}

export function fullSkyPortableBindings(fog: boolean): readonly PortableShaderBinding[] {
  return fog ? FULL_SKY_FOG_PORTABLE_BINDINGS : FULL_SKY_PORTABLE_BINDINGS;
}
