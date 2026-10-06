// PRD-07 P3 — sky background program (GLSL ES 3.00).
// Fragment mirrors the CPU evaluators in PreethamSky.ts / GradientSky.ts so
// `horizonRadiance` (CPU) and rendered pixels agree within f32 tolerance.

import { registerShaderChunk, type ShaderChunk } from "../contracts/program";
import type { SkyProgramDefines } from "./SkyEval";

export const SKY_SHADER_MARKER = "aura3d.prd07.sky";

const VERT = `
// ${SKY_SHADER_MARKER} vertex
in vec2 a_pos;
out vec2 v_clip;
void main() {
  v_clip = a_pos;
  gl_Position = vec4(a_pos, 0.999999, 1.0); // at far plane
}
`;

const FRAG = `
// ${SKY_SHADER_MARKER} fragment
precision highp float;
uniform mat4 u_invViewProj;
uniform vec3 u_sunDirection;
uniform float u_sunE;
uniform float u_sunfade;
uniform vec3 u_betaR;
uniform vec3 u_betaM;
uniform float u_mieDirectionalG;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_ground;
uniform float u_exponent;
uniform float u_horizonGlow;
uniform float u_intensity;
uniform float u_showSunDisc;
uniform float u_time;
uniform float u_starDensity;
uniform float u_starIntensity;
uniform float u_cloudCoverage;
uniform float u_cloudDensity;
uniform float u_cloudElevation;
uniform vec2 u_cloudScaleSpeed;

in vec2 v_clip;
layout(location=0) out vec4 o_color;

const float PI = 3.141592653589793238462643383279502884197169;
const float RAYLEIGH_ZENITH = 8.4E3;
const float MIE_ZENITH = 1.25E3;
const float SUN_ANGULAR_DIAMETER_COS = 0.999956676946448443553574619906976478926848692873900859324;
const float THREE_OVER_SIXTEEN_PI = 0.05968310365946075;
const float ONE_OVER_FOUR_PI = 0.07957747154594767;
const vec3 UP = vec3(0.0, 1.0, 0.0);

float rayleighPhase(float c) { return THREE_OVER_SIXTEEN_PI * (1.0 + c * c); }
float hgPhase(float c, float g) {
  float g2 = g * g;
  return ONE_OVER_FOUR_PI * ((1.0 - g2) / pow(1.0 - 2.0 * g * c + g2, 1.5));
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

vec3 preetham(vec3 direction) {
  float zenithAngle = acos(max(0.0, dot(UP, direction)));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - (zenithAngle * 180.0) / PI, -1.253));
  float sR = RAYLEIGH_ZENITH * inverse;
  float sM = MIE_ZENITH * inverse;
  vec3 Fex = exp(-(u_betaR * sR + u_betaM * sM));
  float cosTheta = dot(direction, u_sunDirection);
  float rP = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = u_betaR * rP;
  float mP = hgPhase(cosTheta, u_mieDirectionalG);
  vec3 betaMTheta = u_betaM * mP;
  vec3 ratio = (betaRTheta + betaMTheta) / (u_betaR + u_betaM);
  vec3 Lin = pow(max(vec3(0.0), u_sunE * ratio * (1.0 - Fex)), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(max(vec3(0.0), u_sunE * ratio * Fex), vec3(0.5)),
             clamp(pow(1.0 - dot(UP, u_sunDirection), 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisc = smoothstep(SUN_ANGULAR_DIAMETER_COS, SUN_ANGULAR_DIAMETER_COS + 0.00002, cosTheta) * u_showSunDisc;
  L0 += (u_sunE * 19000.0 * Fex) * sundisc;
  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  if (direction.y < 0.0) {
    float t = clamp(-direction.y * 4.0, 0.0, 1.0);
    texColor = mix(texColor, u_ground * 0.04, t);
  }
  return texColor;
}

vec3 gradient(vec3 direction) {
  float y = direction.y;
  if (y >= 0.0) {
    float t = pow(clamp(y, 0.0, 1.0), 1.0 / u_exponent);
    float glow = u_horizonGlow * smoothstep(0.25, 0.0, abs(y));
    vec3 c = mix(u_horizon, u_zenith, t) + glow * u_horizon;
    float cdot = dot(direction, u_sunDirection);
    float disc = smoothstep(0.9995, 0.9999, cdot);
    float halo = pow(max(0.0, cdot), 350.0) * 0.6;
    c += vec3(disc * 40.0 + halo, disc * 36.0 + halo * 0.9, disc * 30.0 + halo * 0.7);
    return c * u_intensity;
  }
  float t = clamp(-y * 3.0, 0.0, 1.0);
  return mix(u_horizon, u_ground, t) * u_intensity;
}

float starfield(vec3 direction) {
  if (u_starDensity <= 0.0) return 0.0;
  // Equirect cell hash; a cell holds one star when hash < density*0.01.
  float theta = acos(clamp(direction.y, -1.0, 1.0));
  float phi = atan(direction.z, direction.x);
  vec2 uv = vec2(phi / (2.0 * PI) + 0.5, theta / PI) * 512.0;
  vec2 cell = floor(uv);
  float h = hash2(cell);
  if (h > u_starDensity * 0.01) return 0.0;
  vec2 centre = cell + 0.5;
  float d = length((uv - centre) / 0.5);
  float star = smoothstep(0.5, 0.05, d);
  float mag = 0.25 + 0.75 * hash2(cell + 17.0);
  return star * mag * u_starIntensity;
}

void main() {
  vec4 world4 = u_invViewProj * vec4(v_clip, 1.0, 1.0);
  vec3 direction = normalize(world4.xyz / world4.w);
  vec3 color = vec3(0.0);
#if MODEL_PREETHAM
  color = preetham(direction);
#elif MODEL_GRADIENT
  color = gradient(direction);
#elif MODEL_COLOR
  color = u_zenith;
#else
  color = vec3(0.0);
#endif
#if SKY_STARS
  // Stars shine where the sky is dark (sunfade low = night).
  color += vec3(starfield(direction)) * (1.0 - u_sunfade) * 2.0;
#endif
#if SKY_CLOUDS
  if (direction.y > 0.0 && u_cloudCoverage > 0.0) {
    float elevation = mix(1.0, 0.1, u_cloudElevation);
    vec2 cloudUV = direction.xz / (direction.y * elevation) * u_cloudScaleSpeed.x;
    cloudUV += u_time * u_cloudScaleSpeed.y;
    float cloudNoise = fbm(cloudUV * 1000.0) + 0.5 * fbm(cloudUV * 2000.0 + 3.7);
    cloudNoise = cloudNoise * 0.5 + 0.5;
    float cloudMask = smoothstep(1.0 - u_cloudCoverage, 1.0 - u_cloudCoverage + 0.3, cloudNoise);
    cloudMask *= smoothstep(0.0, 0.1 + 0.2 * u_cloudElevation, direction.y);
    float sunInfluence = dot(direction, u_sunDirection) * 0.5 + 0.5;
    float daylight = max(0.0, u_sunDirection.y * 2.0);
    vec3 cloudColor = mix(vec3(0.3), vec3(1.0), daylight);
    cloudColor = mix(cloudColor, color + vec3(1.0), sunInfluence * 0.5);
    cloudColor *= u_sunE * 0.00002;
    color = mix(color, cloudColor, cloudMask * u_cloudDensity);
  }
#endif
  o_color = vec4(color, 1.0);
}
`;

function defines(d: SkyProgramDefines): string {
  return (
    `${d.model === "PREETHAM" ? "#define MODEL_PREETHAM 1\n" : ""}` +
    `${d.model === "GRADIENT" ? "#define MODEL_GRADIENT 1\n" : ""}` +
    `${d.model === "COLOR" ? "#define MODEL_COLOR 1\n" : ""}` +
    `${d.stars ? "#define SKY_STARS 1\n" : "#define SKY_STARS 0\n"}` +
    `${d.clouds ? "#define SKY_CLOUDS 1\n" : "#define SKY_CLOUDS 0\n"}`
  );
}

export function skyVertexSource(): string {
  return `#version 300 es\n${VERT}`;
}

export function skyFragmentSource(d: SkyProgramDefines): string {
  return `#version 300 es\n${defines(d)}${FRAG}`;
}

export const SKY_CHUNKS: readonly ShaderChunk[] = [
  { name: "a3d_prd07_sky_vertex", owner: "prd07", stage: "vertex", glsl: VERT },
  { name: "a3d_prd07_sky_fragment", owner: "prd07", stage: "fragment", glsl: FRAG }
];

export function registerSkyChunks(): void {
  for (const chunk of SKY_CHUNKS) {
    try {
      registerShaderChunk(chunk);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("SHADER_CHUNK_DUPLICATE"))) throw error;
    }
  }
}
