/**
 * GLSL 300 es for Lamplight Line's custom materials (sky dome, cloud sea, weather points, overhead catenary wire,
 * and Fresnel railway signal lenses). Uniform names avoid `time` (it lowers to the prelude's `u_time`); the engine
 * prelude supplies `position`, `normal`, `uv`, `modelViewProjectionMatrix`, `modelMatrix`, `cameraPosition`.
 */
const HASH = `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Gradient between the two towns' sky colours with a sun (or moon) disc and glow, horizon haze, drifting cloud wisps; night adds a star field. */
export const SKY_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec3 vDir;
out vec4 outColor;
${HASH}
float fbm(vec2 p) {
  return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.07 + 3.3) + 0.0625 * vnoise(p * 8.1 + 1.7);
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 1.5 + 0.1, 0.0, 1.0);
  vec3 day = mix(skyHorizon, skyTop, pow(h, 0.6));
  vec3 night = mix(vec3(0.11, 0.16, 0.33), vec3(0.011, 0.019, 0.078), pow(h, 0.5));
  vec3 col = mix(day, night, nightMix);
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  vec3 sunCol = mix(vec3(1.0, 0.92, 0.72), vec3(0.78, 0.86, 1.0), nightMix);
  float disc = smoothstep(mix(0.9994, 0.9988, nightMix), 0.99985, sd);
  col += sunCol * (pow(sd, 8.0) * 0.3 + pow(sd, 64.0) * 0.46) * mix(1.0, 0.35, nightMix);
  col = mix(col, sunCol * 1.62, disc);
  vec2 cp = d.xz / max(d.y + 0.28, 0.12);
  float cl = smoothstep(0.52, 0.86, fbm(cp * 0.55 + vec2(0.0, 0.0)));
  cl *= smoothstep(0.0, 0.2, d.y);
  vec3 cloudCol = mix(vec3(1.0, 0.985, 0.95), vec3(0.19, 0.24, 0.41), nightMix);
  col = mix(col, cloudCol * (0.78 + 0.24 * pow(sd, 3.0)), cl * 0.62);
  float haze = exp(-max(d.y, 0.0) * 7.0);
  col = mix(col, mix(skyHorizon, vec3(0.06, 0.09, 0.2), nightMix), haze * 0.58);
  float star = step(0.9962, hash31(floor(d * 420.0)));
  col += vec3(star) * max(nightMix, starMix) * smoothstep(0.08, 0.45, d.y) * (1.0 - cl * 0.8);
  vec2 sh = normalize(sunDir.xz + vec2(1e-5)), dh = normalize(d.xz + vec2(1e-5));
  float az = max(dot(sh, dh), 0.0);
  col += vec3(1.0, 0.56, 0.31) * afterglow * pow(az, 2.8) * exp(-abs(d.y) * 8.5) * 0.66;
  if (d.y < 0.0) col = mix(skyHorizon, vec3(0.06, 0.09, 0.2), nightMix);
  outColor = vec4(a3dSrgbToLinear(col), 1.0);
}`;

export const CLOUD_VERTEX = /* glsl */ `
out vec2 vXZ;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vXZ = world.xz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Drifting cloud sea under the islands: billowing two-octave tops, shaded valleys, aerial haze to the horizon colour (day cream, night indigo). */
export const CLOUD_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec2 vXZ;
out vec4 outColor;
${HASH}
float fbm(vec2 p) {
  return 0.5 * vnoise(p) + 0.27 * vnoise(p * 2.1 + 4.0) + 0.14 * vnoise(p * 4.3 + 9.0) + 0.09 * vnoise(p * 9.1 + 2.0);
}
void main() {
  vec2 p = vXZ * 0.0036 + vec2(cloudPhase * 0.016, cloudPhase * 0.011);
  float n = fbm(p);
  float e = fbm(p + vec2(0.03, 0.02));
  float lit = clamp(0.5 + (n - e) * 9.5, 0.0, 1.0);
  vec3 dayLo = vec3(0.65, 0.73, 0.88), dayHi = vec3(1.0, 0.98, 0.93);
  vec3 nightLo = vec3(0.038, 0.058, 0.15), nightHi = vec3(0.21, 0.26, 0.45);
  vec3 lo = mix(dayLo, nightLo, nightMix), hi = mix(dayHi, nightHi, nightMix);
  vec3 col = mix(lo, hi, smoothstep(0.24, 0.76, n * 0.75 + lit * 0.46));
  vec2 toSun = normalize(sunDir.xz + vec2(1e-5));
  float sunSide = 0.5 + 0.5 * dot(normalize(vXZ - cameraPosition.xz + vec2(1e-5)), toSun);
  vec3 band = mix(cloudValley, cloudLit * mix(1.0, sunGain, sunSide), smoothstep(0.24, 0.76, n * 0.75 + lit * 0.46));
  col = mix(col, band, bandMix);
  float dist = length(vXZ - cameraPosition.xz);
  col = mix(col, hazeColor, smoothstep(480.0, 3000.0, dist));
  outColor = vec4(a3dSrgbToLinear(col), 1.0);
}`;

export const POINTS_VERTEX = /* glsl */ `
attribute float size;
attribute float fade;
out float vFade;
void main() {
  vFade = fade;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_PointSize = size;
}`;

export const POINTS_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in float vFade;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  outColor = vec4(a3dSrgbToLinear(weatherTint), smoothstep(1.0, 0.0, d) * vFade);
}`;

export const RAIN_VERTEX = /* glsl */ `
attribute float fade;
out float vFade;
void main() {
  vFade = fade;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Camera-facing rain streaks (thin quads); alpha rises toward the head of each streak. */
export const RAIN_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in float vFade;
out vec4 outColor;
void main() {
  outColor = vec4(a3dSrgbToLinear(rainTint), vFade);
}`;

/** Overhead copper-bronze catenary wire with cylindrical metallic sheen, rain-dew glints and travelling electric current pulse. */
export const CATENARY_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vUv = uv;
  vWorld = world.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const CATENARY_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
void main() {
  float radial = clamp(1.0 - abs(vUv.x * 2.0 - 1.0), 0.0, 1.0);
  float sheen = pow(radial, 1.8);
  float dist = length(vWorld - cameraPosition);
  float nearFade = 1.0 - smoothstep(35.0, 160.0, dist);
  float waveA = smoothstep(0.9, 1.0, sin(vUv.y * 0.42 - wirePhase * 3.6) * 0.5 + 0.5);
  float dew = smoothstep(0.86, 1.0, sin(vUv.y * 5.8 + 1.3) * 0.5 + 0.5) * sheen;
  vec3 base = wireTint * (0.55 + 0.85 * sheen);
  vec3 corona = arcTint * (waveA * 0.85 + dew * 0.45) * arcBoost * nearFade;
  outColor = vec4(a3dSrgbToLinear(base + corona), 1.0);
}`;

/** Fresnel bullseye railway signal lens: `uv.y` in [0,1] = stop aspect (warm ruby), `uv.y` in [2,3] = clear aspect (emerald). */
export const SIGNAL_LENS_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SIGNAL_LENS_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec2 vUv;
out vec4 outColor;
void main() {
  float clearAspect = step(1.5, vUv.y);
  vec2 localUv = vec2(vUv.x, vUv.y - clearAspect * 2.0);
  vec2 p = localUv * 2.0 - 1.0;
  float r = length(p);
  float alpha = smoothstep(1.0, 0.78, r);
  float rings = 0.74 + 0.26 * sin(r * 22.0);
  float core = exp(-r * r * 5.2);
  float breath = 0.94 + 0.06 * sin(signalPhase * 3.1 + clearAspect * 2.2);
  vec3 hue = mix(lensWarm, lensClear, clearAspect);
  vec3 col = mix(hue * rings, vec3(1.0, 0.97, 0.9), core * 0.62) * breath * (1.15 + nightBoost * 1.1);
  outColor = vec4(a3dSrgbToLinear(col), alpha * (0.52 + 0.48 * core));
}`;

/** 8x4 sprite-sheet flipbook card shader driven by `createFlipbookAtlas("sparks")` for wheel-flange sparks. */
export const SPARK_CARD_VERTEX = SIGNAL_LENS_VERTEX;

export const SPARK_CARD_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec2 vUv;
out vec4 outColor;
void main() {
  float fi = clamp(floor(burstState.x), 0.0, 31.0);
  float col = mod(fi, 8.0);
  float row = floor(fi / 8.0);
  vec2 cellUv = (vec2(col, row) + clamp(vUv, 0.02, 0.98)) / vec2(8.0, 4.0);
  vec4 tex = texture(sheet, cellUv);
  float a = tex.a * clamp(burstState.y, 0.0, 1.0);
  vec3 rgb = a3dSrgbToLinear(tex.rgb) * max(burstState.z, 0.25);
  outColor = vec4(rgb, a);
}`;
