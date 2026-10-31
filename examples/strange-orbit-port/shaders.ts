/**
 * GLSL for the port's `material.custom` surfaces. The original patched three's
 * MeshStandardMaterial through `onBeforeCompile` and sampled a remote
 * `impasto.png`; here the same pigment mixing runs in a self-contained shader
 * with a procedural impasto texture, lit by the scene's own lights through the
 * engine author chunks (`a3d_lights`, `a3d_scene`; GU47 SO47-L1).
 * Sources use GLSL 300 es varyings and GLSL1 `attribute` for author attributes.
 */

const NOISE = /* glsl */ `
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
`;

/**
 * GU47 SO47-L1: the custom surfaces read the scene's own lights through the engine author chunks, so the GLB riders and
 * the painted track are lit by the same key, planetshine, headlight and tail lights (no light literal in this file).
 * `a3dDirect` sums every direct light (the shadowed key is darkened by its PCSS cascades), `a3dHemiLight` is the authored
 * hemisphere pair. The gains keep the 4.6.1 exposure: the original rig was hemisphere 1.65 + key 2.15 + fill 0.95 times
 * exposure 1.2 over pi; the engine key carries 2.6 (= 2.15 * 1.2) and the hemisphere 1.1 (x 1.8 = 1.65 * 1.2).
 * `gouache` adds the split tone (SO47-P1) and the height mist (SO47-E3); 0 keeps `?look=original`.
 */
const HEMI_GAIN = 1.8;

const lighting = (gouache: boolean): string => /* glsl */ `
#include <a3d_lights>
const float HEMI_GAIN = ${HEMI_GAIN.toFixed(2)};
/** SO47-P1 painterly split tone: teal-violet darks, warm highlights (darkest 5% B-R up, brightest R-B up). */
vec3 splitTone(vec3 c) {${gouache ? `
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(0.04, 0.55, l);
  c *= mix(vec3(0.84, 0.93, 1.22), vec3(1.10, 1.0, 0.84), w);` : ""}
  return c;
}
vec3 shade(vec3 albedo, vec3 N, vec3 emissive, vec3 world) {
  vec3 V = normalize(cameraPosition - world);
  vec3 direct = a3dDirect(N, V, albedo, 0.9, world);
  vec3 hemi = albedo * a3dHemiLight(N) * (HEMI_GAIN / 3.14159265);
  return splitTone(direct + hemi) + emissive;
}
/** Aerial perspective from the scene fog (exp2, the same colour and density the engine fogs the GLBs with). */
vec3 haze(vec3 c, vec3 world) {
  float d = length(world - cameraPosition);
  float x = max(u_a3dFogDensity, 0.0) * d;
  float f = 1.0 - exp(-x * x);${gouache ? `
  // SO47-E3 height term: dense mist pools below the crater rim (world y < 0) and thins above it.
  float below = clamp(-world.y / 28.0, 0.0, 1.0);
  f = max(f, below * 0.6 * (1.0 - exp(-d / 140.0)));
  return mix(c, u_a3dFogColor, clamp(f, 0.0, 0.78));` : `
  return mix(c, u_a3dFogColor, clamp(f, 0.0, 0.82));`}
}
`;

export const TRACK_VERTEX = /* glsl */ `
attribute vec3 pigmentBase;
attribute vec3 pigmentVein;
attribute vec3 pigmentChalk;
attribute float paintOriginal;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vBase;
out vec3 vVein;
out vec3 vChalk;
out float vOriginal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  vBase = pigmentBase;
  vVein = pigmentVein;
  vChalk = pigmentChalk;
  vOriginal = paintOriginal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Squared falloff radius (m^2) of the riders' soft contact shadow on the road (gouache only). */
export const CONTACT_RADIUS2 = 2.4;
/** Peak darkening of the contact shadow right under a rider (0..1). */
export const CONTACT_STRENGTH = 0.85;
/** Uniform names of the six rider contact shadows (player, then rivals 1..5). */
export const CONTACT_UNIFORMS = ["riderContact0", "riderContact1", "riderContact2", "riderContact3", "riderContact4", "riderContact5"] as const;

/** Domain-warp strength of the track's paint marks (was 4.0, shared with the veins). */
export const TRACK_MARK_WARP = 2.5;

/** Track fragment; `gouache` adds the split tone, height mist and a deeper impasto relief (the signature brush texture). */
export const trackFragment = (gouache: boolean): string => /* glsl */ `
#define TRACK_MARK_WARP ${TRACK_MARK_WARP.toFixed(1)}
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vBase;
in vec3 vVein;
in vec3 vChalk;
in float vOriginal;
out vec4 outColor;
${NOISE}
${lighting(gouache)}
float paintNoise(vec2 p) { return fbm(p + vec2(fbm(p * 0.35) * 4.0, 0.0)); }
// The surface marks use a gentler domain warp than the veins (2.5 instead of 4.0): the stronger warp smeared each mark
// into a long streak along one world axis (audit SO-E5).
float markNoise(vec2 p) { return fbm(p + vec2(fbm(p * 0.35) * TRACK_MARK_WARP, 0.0)); }${gouache ? `
/** Contact shadow: riderContact0..5 hold each rider's centre (xyz, about 1 m above the road) and strength (w, 0 = hidden). */
float contactTerm(vec3 p, vec4 c) {
  vec3 d = p - c.xyz;
  return 1.0 - c.w * exp(-dot(d, d) / ${CONTACT_RADIUS2.toFixed(2)});
}
float contactOcclusion(vec3 p) {
  return contactTerm(p, riderContact0) * contactTerm(p, riderContact1) * contactTerm(p, riderContact2)
    * contactTerm(p, riderContact3) * contactTerm(p, riderContact4) * contactTerm(p, riderContact5);
}` : ""}
void main() {
  // Procedural stand-in for impasto.png: warm paint marks. World-space triplanar noise, so the marks keep the same size in
  // every direction (UV-mapped streaks stretched along the whole length of the track).
  vec3 N0 = normalize(vNormal);
  vec3 bw = pow(abs(N0), vec3(4.0));
  bw /= (bw.x + bw.y + bw.z + 1e-5);
  vec3 wq = vWorld * 0.42;
  vec2 q = wq.xz;
  float streak = bw.x * markNoise(wq.yz) + bw.y * markNoise(wq.xz) + bw.z * markNoise(wq.xy);
  float grain = vnoise(wq.xz * 6.0 + vec2(wq.y * 3.1, 0.0));
  vec3 sampled = mix(vec3(0.50, 0.36, 0.30), vec3(0.93, 0.74, 0.58), streak) * (0.9 + 0.2 * grain);
  float lum = dot(sampled, vec3(0.2126, 0.7152, 0.0722));
  float warm = smoothstep(-0.005, 0.12, sampled.r - sampled.g);
  vec3 pigment = mix(vVein, vBase, warm);
  pigment = mix(pigment, vChalk, smoothstep(0.29, 0.73, lum) * 0.84);
  vec3 original = sampled;
  float warmMask = smoothstep(0.015, 0.18, original.r - original.g);
  original = mix(original, vec3(0.56, 0.285, 0.245) * (0.65 + lum), warmMask * 0.38);
  original = mix(original, vec3(lum), 0.09);
  original *= mix(vec3(0.94), vec3(0.88, 0.67, 0.55), warmMask);
  vec3 albedo = mix(pigment * (0.24 + 1.38 * pow(max(0.0, lum), 0.65)), original, vOriginal);
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  // Teal mineral veining that follows the brush streaks, as on the original's terracotta ring.
  vec3 vq = vWorld * 0.16;
  float veinNoise = bw.x * paintNoise(vq.yz * 1.6) + bw.y * paintNoise(vq.xz * 1.6) + bw.z * paintNoise(vq.xy * 1.6);
  float vein = smoothstep(0.5, 0.68, veinNoise);
  albedo = mix(albedo, vec3(0.08, 0.36, 0.38), vein * 0.62);
  albedo *= vec3(0.80, 0.60, 0.52);
  float across = smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.93, vUv.y);
  albedo *= mix(0.5, 1.0, across);
  // Impasto relief: screen-space bump from the streak height so the key light rakes across the brush marks.
  float h = bw.x * fbm(wq.yz * 2.2) + bw.y * fbm(wq.xz * 2.2) + bw.z * fbm(wq.xy * 2.2);
  vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  N = normalize(abs(det) * N - ${gouache ? "0.09" : "0.05"} * sign(det) * (dFdx(h) * r1 + dFdy(h) * r2));
  vec3 emissive = albedo * 0.1 + vec3(0.18, 0.72, 0.66) * (1.0 - across) * 0.3;${gouache ? `
  // GU47 phase 3: soft contact shadow under each rider (the cascades miss the hover gap at software-GL resolution).
  float occ = contactOcclusion(vWorld);
  albedo *= occ;
  emissive *= occ;` : ""}
  outColor = vec4(haze(shade(albedo, N, emissive, vWorld), vWorld), 1.0);
}`;
export const TRACK_FRAGMENT = trackFragment(true);

/** Opal / mineral surfaces: strata banding with an iridescent tint (the original's `Mf`). */
export const MINERAL_VERTEX = /* glsl */ `
out vec3 vObject;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vObject = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const mineralFragment = (gouache: boolean): string => /* glsl */ `
in vec3 vObject;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${lighting(gouache)}
void main() {
  float strata = sin(vObject.y * 3.6 + sin(vObject.z * 1.8) * 1.1 + sin(vObject.x * 2.1));
  float fine = sin(vObject.y * 37.0 + sin(vObject.z * 11.0) * 1.6);
  vec3 albedo = baseColor * (0.9 + 0.08 * strata + 0.02 * fine);
  if (opal > 0.5) albedo *= mix(vec3(0.64, 0.88, 1.0), vec3(1.0, 0.69, 0.86), strata * 0.5 + 0.5);
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  float glow = opal > 0.5 ? 0.17 : 0.025;
  outColor = vec4(haze(shade(albedo, N, albedo * glow, vWorld), vWorld), 1.0);
}`;
export const MINERAL_FRAGMENT = mineralFragment(true);

/** Flat or lit solid colour (riders, rocks, pillars, planet bands). */
export const SOLID_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vObject;
out vec3 vWorld;
void main() {
  vObject = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const solidFragment = (gouache: boolean): string => /* glsl */ `
in vec3 vNormal;
in vec3 vObject;
in vec3 vWorld;
out vec4 outColor;
${NOISE}
${lighting(gouache)}
void main() {
  vec3 albedo = baseColor;
  if (banding > 0.0) {
    float b = fbm(vec2(vObject.y * banding, vObject.x * banding * 0.4 + vObject.z * banding * 0.3));
    albedo = mix(baseColor, glowColor, b * 0.9);
  }
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  vec3 emissive = glowColor * glow * (banding > 0.0 ? 0.0 : 1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 keyDir = normalize(u_a3dSunDirection);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float spec = pow(max(dot(N, normalize(keyDir + V)), 0.0), 36.0);
  float gKey = a3dSunShadowAuto(vWorld, N);
  vec3 lit = shade(albedo, N, emissive, vWorld);
  lit += vec3(0.42, 0.58, 0.95) * fres * 0.34 * (banding > 0.0 ? 0.0 : 1.0);
  lit += normalize(u_a3dSunColor + 1e-4) * 1.6 * spec * 0.28 * gKey * (banding > 0.0 ? 0.0 : 1.0);
  // Banded bodies (the gas giant) sit far out: they take a third of the haze so the planet stays a painted disc.
  outColor = vec4(mix(lit, haze(lit, vWorld), banding > 0.0 ? 0.35 : 1.0), 1.0);
}`;
export const SOLID_FRAGMENT = solidFragment(true);

/** Additive checkpoint veil (ported from the original gate `ShaderMaterial`; uv.y runs up the 13 m curtain). */
export const VEIL_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const VEIL_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float y = vUv.y * 13.0;
  float t = clamp((y + 0.6) / 13.5, 0.0, 1.0);
  float z = (vUv.x - 0.5) * 23.0;
  float edge = 10.1 - 8.3 * t * t - (1.3 * pow(1.0 - t, 0.55) + 0.1);
  float mask = 1.0 - smoothstep(edge - 0.35, edge, abs(z));
  float stream = pow(max(0.0, sin(z * 8.0 + sin(y * 0.65 - veilTime) * 1.1 - veilTime * 0.4)), 30.0);
  float rim = exp(-pow((abs(z) - edge + 0.25) * 3.0, 2.0));
  float alpha = (stream * 0.09 + rim * 0.4) * mask * smoothstep(0.0, 0.7, y) * (1.0 - smoothstep(11.5, 13.0, y));
  outColor = vec4(mix(vec3(0.48, 0.79, 1.0), vec3(1.0, 0.75, 0.3), 0.65 + 0.35 * sin(veilTime + y)), alpha * (1.0 + veilPulse * 2.0));
}`;

/** Round glowing points with a per-point `size` (stars, stardust, exhaust). */
export const POINTS_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 tint;
attribute float fade;
out vec3 vTint;
out float vFade;
void main() {
  vTint = tint;
  vFade = fade;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_PointSize = size;
}`;

export const POINTS_FRAGMENT = /* glsl */ `
in vec3 vTint;
in float vFade;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float soft = smoothstep(1.0, 0.0, d);
  outColor = vec4(vTint * (additive > 0.5 ? 1.4 : 1.0), soft * vFade);
}`;


/** Space sky: a deep gradient with a tilted galactic band, dust lanes and coloured nebula clouds (object-space direction, so it never parallaxes). */
export const NEBULA_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const NEBULA_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
float h31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.02 + vec3(7.1, 3.7, 1.3); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(vec3(0.012, 0.016, 0.045), vec3(0.035, 0.028, 0.085), d.y * 0.5 + 0.5);
  float band = exp(-pow(dot(d, normalize(vec3(0.28, 0.92, -0.26))) * 3.2, 2.0));
  float c1 = fbm3(d * 2.4 + vec3(1.7, 0.3, 4.1));
  float c2 = fbm3(d * 5.1 + c1 * 1.6 + vec3(9.2, 2.2, 0.7));
  float cloud = pow(clamp(c1 * 1.25, 0.0, 1.0), 2.2);
  vec3 purple = vec3(0.30, 0.11, 0.46);
  vec3 teal = vec3(0.04, 0.34, 0.42);
  vec3 amber = vec3(0.66, 0.30, 0.11);
  vec3 neb = mix(purple, teal, smoothstep(0.30, 0.75, c2));
  neb = mix(neb, amber, smoothstep(0.55, 0.9, fbm3(d * 1.7 + vec3(3.3, 8.8, 1.1))) * 0.7);
  col += neb * cloud * (0.10 + 0.55 * band);
  col += vec3(0.20, 0.17, 0.30) * band * pow(c2, 1.7) * 0.5;
  float lane = smoothstep(0.52, 0.74, fbm3(d * 3.4 + vec3(5.5, 1.2, 7.7)));
  col *= 1.0 - 0.55 * lane * band;
  // SO47-E2: the nebula hue turns with the painted sector (nebulaShift in turns; 0 keeps the authored colours).
  float a = nebulaShift * 6.2831853;
  vec3 k = vec3(0.57735);
  col = col * cos(a) + cross(k, col) * sin(a) + k * dot(k, col) * (1.0 - cos(a));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

/** Additive Fresnel shell around the planet (limb glow, brighter on the sun side). */
export const ATMOS_VERTEX = /* glsl */ `
out vec3 vN;
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const ATMOS_FRAGMENT = /* glsl */ `
#include <a3d_scene>
in vec3 vN;
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float f = pow(1.0 - max(dot(N, V), 0.0), 2.4);
  float sun = clamp(dot(N, normalize(u_a3dSunDirection)) * 0.6 + 0.55, 0.0, 1.0);
  outColor = vec4(atmoColor * f * (0.4 + 1.5 * sun), f * 0.9);
}`;
