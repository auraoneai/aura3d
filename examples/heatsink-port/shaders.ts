/**
 * GLSL 300 es for the port's `material.custom` surfaces (custom materials are unlit, so the original's hemisphere +
 * sun lighting is evaluated inline from the Vesper Heights `lighting` block). The original authored these as three.js
 * TSL node materials (49 live, 7 with `normalNode`); `material.node` has no scene-light access, so they are hand-ported
 * here to GLSL as the R-24 decision requires. See PORTING-NOTES.md for the node-to-GLSL mapping.
 *

 * Authored uniforms (fogColor, sunDir, baseColor, ...) are declared by the engine prelude from the material spec,
 * so the sources below never declare them.
 *
 * Fog: the original uses exponential height fog (`atmosphere`: density 0.0004, hDensity 0.0022, hBase 18, hFalloff
 * 0.031, maxFog 0.96) tinted by the district's fog colour; `fogMix()` below evaluates the same model.
 */

const COMMON = /* glsl */ `
#include <a3d_fog>
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// original atmosphere: density 0.0004, hDensity 0.0022, hBase 18, hFalloff 0.031, maxFog 0.96
vec3 applyFog(vec3 color, vec3 world) {
  return a3dFogHeight(color, fogColor, length(world - cameraPosition), world.y, 0.0004, 0.0022, 18.0, 0.031, 0.96);
}
float gSun = 1.0; // sun-shadow factor, set per fragment by a3dSunShadowAuto in specs with receiveShadow: true
vec3 lit(vec3 albedo, vec3 N) {
  vec3 hemi = mix(groundAmbient, skyAmbient, N.y * 0.5 + 0.5);
  float ndl = max(dot(N, normalize(sunDir)), 0.0);
  return albedo * (hemi + sunColor * ndl * gSun) * 0.26;
}
`;

export const ROAD_VERTEX = /* glsl */ `
attribute vec3 roadColor;
attribute vec2 roadUv;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vRoad;
out vec2 vRoadUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  vRoad = roadColor;
  vRoadUv = roadUv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const ROAD_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vRoad;
in vec2 vRoadUv;
out vec4 outColor;
${COMMON}
void main() {
  float u = vRoadUv.x;      // -1..1 across the road
  float s = vRoadUv.y;      // metres along the track
  vec3 N = normalize(vNormal);
  // dark blue-grey asphalt with large soft mottling and fine grain
  float mottle = fbm(vec2(u * 3.0 + 1.7, s * 0.05));
  float grain = fbm(vec2(u * 38.0, s * 1.4));
  vec3 asphalt = vec3(0.20, 0.23, 0.29) * (0.62 + 0.55 * mottle) * (0.9 + 0.2 * grain);
  // cyan neon tracery: thin iso-lines of a slow noise field, strongest mid-road, glowing a little
  float field = fbm(vec2(u * 2.4 + 3.0, s * 0.028));
  float vein = 1.0 - smoothstep(0.0, 0.007, abs(field - 0.52));
  vein *= 1.0 - smoothstep(0.72, 0.96, abs(u));
  float field2 = fbm(vec2(u * 4.1 - 5.0, s * 0.045));
  vein += (1.0 - smoothstep(0.0, 0.005, abs(field2 - 0.47))) * 0.5 * (1.0 - smoothstep(0.6, 0.95, abs(u)));
  // long pale dashed lane lines near the edges, short centre dashes
  float edgeLine = (1.0 - smoothstep(0.0, 0.018, abs(abs(u) - 0.80))) * step(0.22, fract(s / 55.0));
  float dash = step(0.5, fract(s / 14.0)) * (1.0 - smoothstep(0.0, 0.025, abs(u)));
  float curb = smoothstep(0.93, 0.985, abs(u));
  vec3 neon = mix(vRoad, vec3(0.80, 0.95, 1.0), 0.7);
  gSun = a3dSunShadowAuto(vWorld, N);
  vec3 color = lit(asphalt, N) * 1.55;
  color += vec3(0.10, 0.85, 0.80) * clamp(vein, 0.0, 1.0) * 0.20;
  color += vec3(0.78, 0.88, 0.95) * edgeLine * 0.55;
  color += vec3(0.75, 0.9, 1.0) * dash * 0.28;
  color += neon * curb * (0.16 + 0.06 * sin(u_time * 2.0 + s * 0.05));
  outColor = vec4(applyFog(color, vWorld), 1.0);
}`;

export const SOLID_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SOLID_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${COMMON}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 hot = vec3(1.0, 0.42, 0.08);
  gSun = a3dSunShadowAuto(vWorld, N);
  vec3 color = lit(mix(baseColor, hot * 0.8, heat * 0.55), N);
  color += glowColor * glow * (0.85 + 0.15 * sin(u_time * 5.0));
  color += hot * heat * (0.35 + rim * 1.4);
  color += vec3(1.0, 0.9, 0.7) * flash;
  outColor = vec4(applyFog(color, vWorld), 1.0);
}`;

export const VEIL_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Additive checkpoint gate and boost-pad glow. `veilTime`/`veilPulse` avoid the reserved `time`/`pulse` lowering to u_time. */
export const VEIL_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float band = veilMode > 0.5
    ? (1.0 - smoothstep(0.55, 1.0, max(abs(c.x), abs(c.y)))) * (0.45 + 0.25 * sin(u_time * 6.0 - c.y * 5.0))
    : (1.0 - smoothstep(0.0, 1.0, abs(c.x))) * (0.25 + 0.15 * sin(u_time * 4.0 + c.y * 9.0));
  float a = band * (0.5 + veilPulse);
  outColor = vec4(veilColor * a, a);
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 clip = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_Position = clip;
}`;

/** Teal-to-navy sky with a cloud layer, two aurora ribbons, a ringed planet, a moon and stars. */
export const SKY_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${COMMON}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float az = atan(d.z, d.x);
  vec3 zen = vec3(0.012, 0.030, 0.090);
  vec3 mid = vec3(0.022, 0.120, 0.175);
  vec3 hor = vec3(0.150, 0.420, 0.450);
  vec3 sky = h > 0.0 ? mix(hor, mix(mid, zen, smoothstep(0.12, 0.8, h)), smoothstep(0.0, 0.34, h)) : mix(hor, vec3(0.07, 0.20, 0.24), smoothstep(0.0, 0.25, -h));
  // cloud layer hugging the horizon
  float cl = fbm(vec2(az * 2.4 + u_time * 0.008, h * 6.0));
  float cmask = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.22, 0.65, h));
  sky += vec3(0.30, 0.34, 0.44) * pow(smoothstep(0.42, 0.9, cl), 1.4) * cmask * 0.55;
  // aurora ribbons (purple low, teal high), curtained by noise
  float c1 = 0.30 + 0.10 * sin(az * 1.6 + 0.8) + 0.04 * sin(az * 5.0);
  float c2 = 0.47 + 0.08 * sin(az * 2.1 + 3.1);
  float r1 = exp(-(((h - c1) / 0.05) * ((h - c1) / 0.05)));
  float r2 = exp(-(((h - c2) / 0.07) * ((h - c2) / 0.07)));
  float tex = 0.40 + 0.60 * fbm(vec2(az * 7.0, h * 14.0 + u_time * 0.03));
  vec3 aur = vec3(0.60, 0.24, 0.85) * r1 * tex * 1.0 + vec3(0.12, 0.80, 0.68) * r2 * tex * 0.8 + vec3(0.2, 0.75, 0.65) * r1 * 0.14;
  // ringed planet
  vec3 pd = normalize(planetDir);
  vec3 pr = normalize(cross(vec3(0.0, 1.0, 0.0), pd));
  vec3 pu = cross(pd, pr);
  vec2 pp = vec2(dot(d, pr), dot(d, pu)) / 0.17;
  float facing = step(0.0, dot(d, pd));
  float disk = (1.0 - smoothstep(0.96, 1.0, length(pp))) * facing;
  vec2 q = mat2(0.94, -0.34, 0.34, 0.94) * pp;
  float ringR = length(vec2(q.x, q.y * 3.4));
  float ring = (1.0 - smoothstep(0.0, 0.16, abs(ringR - 1.85))) * facing * (1.0 - disk * 0.6);
  vec3 planet = mix(vec3(0.12, 0.08, 0.22), vec3(0.50, 0.34, 0.52), fbm(pp * 3.0 + 4.0)) * disk * 0.95 + vec3(0.55, 0.50, 0.62) * ring * 0.55;
  float moonMask = 1.0 - smoothstep(0.022, 0.026, acos(clamp(dot(d, normalize(moonDir)), -1.0, 1.0)));
  float sun = pow(max(dot(d, normalize(sunDir)), 0.0), 160.0);
  vec2 g = floor(d.xz * 700.0 + d.y * 300.0);
  float star = step(0.9988, hash21(g)) * smoothstep(0.1, 0.4, h);
  vec3 color = sky + aur + planet + vec3(1.0, 1.1, 1.5) * moonMask + sunColor * sun * 0.3 + vec3(star) * 0.9 + glowColor * 0.08 * (1.0 - abs(h));
  outColor = vec4(color, 1.0);
}`;

/**
 * Rolling hills and plains: layered-noise rock with ridged strata, a bump-mapped normal from screen-space derivatives
 * (one noise evaluation, no finite differences, so it stays cheap on software GL), frost above a snow line, teal haze.
 */
export const TERRAIN_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${COMMON}
float ridged(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0)); p = p * 2.07 + 11.3; a *= 0.5; }
  return s * 1.15;
}
void main() {
  vec3 N0 = normalize(vNormal);
  // flats use the ground plane, slopes use (horizontal, height) so strata run across the face
  vec2 pf = vWorld.xz;
  float flatness = smoothstep(0.35, 0.85, N0.y);
  vec2 pd = mix(vec2(vWorld.x + vWorld.z, vWorld.y * 1.6), pf, flatness);
  float h0 = ridged(pd * 0.09);
  // bump mapping from screen-space derivatives of the height field (Mikkelsen)
  vec3 dpdx = dFdx(vWorld), dpdy = dFdy(vWorld);
  float dhx = dFdx(h0), dhy = dFdy(h0);
  vec3 r1 = cross(dpdy, N0), r2 = cross(N0, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  float bumpK = 5.0 * (1.0 - smoothstep(25.0, 130.0, length(vWorld - cameraPosition))); // fade the bump with distance: no aliasing
  vec3 N = normalize(abs(det) * N0 - bumpK * grad);
  float n = fbm(pf * 0.020);
  vec3 rock = mix(vec3(0.17, 0.21, 0.27), vec3(0.34, 0.40, 0.47), n) * (0.82 + 0.36 * n);
  rock *= 0.72 + 0.56 * h0;                                     // ridged strata and crevices
  rock *= 0.9 + 0.2 * vnoise(vWorld.xz * 1.9 + vWorld.y * 0.7);  // speckle
  float snow = smoothstep(0.55, 0.9, N0.y) * smoothstep(snowLine, snowLine + 90.0, vWorld.y);
  vec3 albedo = mix(rock, vec3(0.50, 0.56, 0.63), snow * 0.55) * terrainTint;
  float strata = 0.5 + 0.5 * sin(vWorld.y * 0.85 + n * 6.0);
  albedo *= 0.9 + 0.1 * strata * (1.0 - N0.y);
  float cavity = smoothstep(0.35, 0.75, h0);
  gSun = a3dSunShadowAuto(vWorld, N);
  vec3 color = lit(albedo, N) * 1.25 * (0.75 + 0.35 * cavity);
  color += vec3(0.04, 0.16, 0.18) * pow(1.0 - clamp(N0.y, 0.0, 1.0), 2.0);
  outColor = vec4(applyFog(color, vWorld), 1.0);
}`;

export const STREAK_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Additive camera-facing speed streaks: bright core across the width, faded ends along the length. */
export const STREAK_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = pow(sin(3.14159265 * clamp(vUv.y, 0.0, 1.0)), 1.2);
  float a = across * along * streakAlpha;
  outColor = vec4(streakColor * a, a);
}`;

export const POINTS_VERTEX = /* glsl */ `
attribute float size;
attribute float fade;
attribute vec3 tint;
out float vFade;
out vec3 vTint;
void main() {
  vFade = fade;
  vTint = tint;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_PointSize = size;
}`;

export const POINTS_FRAGMENT = /* glsl */ `
in float vFade;
in vec3 vTint;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = (1.0 - smoothstep(0.0, 1.0, length(c))) * vFade;
  outColor = vec4(vTint * a, a);
}`;

/** Soft contact shadow under the hovering drone (HP-08): a dark radial blob, alpha-blended onto the road. */
export const BLOB_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const BLOB_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float a = (1.0 - smoothstep(0.2, 1.0, r)) * blobAlpha;
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;
