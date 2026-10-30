/**
 * GLSL 300 es for the port's custom materials (sky dome, cloud sea, weather points). Uniform names avoid `time`
 * (it lowers to the prelude's `u_time`); the engine prelude supplies `position`, `modelViewProjectionMatrix`,
 * `modelMatrix`, `cameraPosition`.
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
  vec3 night = mix(vec3(0.12, 0.17, 0.34), vec3(0.012, 0.02, 0.08), pow(h, 0.5));
  vec3 col = mix(day, night, nightMix);
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  vec3 sunCol = mix(vec3(1.0, 0.93, 0.74), vec3(0.78, 0.86, 1.0), nightMix);
  float disc = smoothstep(mix(0.9994, 0.9988, nightMix), 0.99985, sd);
  col += sunCol * (pow(sd, 8.0) * 0.28 + pow(sd, 64.0) * 0.45) * mix(1.0, 0.35, nightMix);
  col = mix(col, sunCol * 1.6, disc);
  vec2 cp = d.xz / max(d.y + 0.28, 0.12);
  float cl = smoothstep(0.52, 0.86, fbm(cp * 0.55 + vec2(0.0, 0.0)));
  cl *= smoothstep(0.0, 0.2, d.y);
  vec3 cloudCol = mix(vec3(1.0, 0.99, 0.96), vec3(0.2, 0.25, 0.42), nightMix);
  col = mix(col, cloudCol * (0.78 + 0.22 * pow(sd, 3.0)), cl * 0.62);
  float haze = exp(-max(d.y, 0.0) * 7.0);
  col = mix(col, mix(skyHorizon, vec3(0.06, 0.09, 0.2), nightMix), haze * 0.55);
  float star = step(0.9962, hash31(floor(d * 420.0)));
  col += vec3(star) * max(nightMix, starMix) * smoothstep(0.08, 0.45, d.y) * (1.0 - cl * 0.8);
  // GU47 LT-05: afterglow, a warm band along the horizon under the sun's azimuth (0 = off, the 4.6 look)
  vec2 sh = normalize(sunDir.xz + vec2(1e-5)), dh = normalize(d.xz + vec2(1e-5));
  float az = max(dot(sh, dh), 0.0);
  col += vec3(1.0, 0.55, 0.32) * afterglow * pow(az, 3.0) * exp(-abs(d.y) * 9.0) * 0.6;
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
  float lit = clamp(0.5 + (n - e) * 9.0, 0.0, 1.0);
  vec3 dayLo = vec3(0.66, 0.74, 0.88), dayHi = vec3(1.0, 0.98, 0.93);
  vec3 nightLo = vec3(0.04, 0.06, 0.15), nightHi = vec3(0.2, 0.25, 0.44);
  vec3 lo = mix(dayLo, nightLo, nightMix), hi = mix(dayHi, nightHi, nightMix);
  vec3 col = mix(lo, hi, smoothstep(0.25, 0.75, n * 0.75 + lit * 0.45));
  // GU47 LT-05: band look, tops lit toward the sun and lilac valleys (bandMix 0 = the 4.6 look)
  vec2 toSun = normalize(sunDir.xz + vec2(1e-5));
  float sunSide = 0.5 + 0.5 * dot(normalize(vXZ - cameraPosition.xz + vec2(1e-5)), toSun);
  vec3 band = mix(cloudValley, cloudLit * mix(1.0, sunGain, sunSide), smoothstep(0.25, 0.75, n * 0.75 + lit * 0.45));
  col = mix(col, band, bandMix);
  float dist = length(vXZ - cameraPosition.xz);
  col = mix(col, hazeColor, smoothstep(500.0, 3000.0, dist));
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
