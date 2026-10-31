/**
 * GLSL for the port's `material.custom` surfaces, in GLSL 300 es (`out` varyings, `outColor`).
 * The aura shell keeps the original's stacked blade-tier maths; the road, props, sky and cloud
 * deck are this port's own shading in the original's palette and haze (linear fog 430..1010 to a
 * pink horizon, a three-band toon ramp under a warm hemisphere, a violet sky over a cloud deck).
 * Uniform names avoid the engine's built-ins (`time` would lower to the reserved `u_time`).
 */

const NOISE = /* glsl */ `
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  return n2(p) * 0.58 + n2(p * 2.17 + 7.3) * 0.28 + n2(p * 4.4 + 19.1) * 0.14;
}
`;

/** Sine-free hash and 2D value noise for the cloud deck (cheap enough to march). */
const CLOUD_NOISE = /* glsl */ `
float ch(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float cn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ch(i), ch(i + vec2(1.0, 0.0)), f.x), mix(ch(i + vec2(0.0, 1.0)), ch(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cfbm3(vec2 p){ return cn(p) * 0.56 + cn(p * 2.03 + 5.2) * 0.29 + cn(p * 4.17 + 11.7) * 0.15; }
`;

/** Haze and sun shared by every surface so the road, props and deck agree. */
const ATMOSPHERE = /* glsl */ `
const vec3 FOG_COL = vec3(0.80, 0.62, 0.80);
const vec3 SUN_DIR = vec3(-0.2501, 0.3002, -0.9206);
vec3 fogMix(vec3 c, float d){ return mix(c, FOG_COL, clamp((d - 430.0) / 580.0, 0.0, 1.0)); }
float fogAmount(float d){ return clamp((d - 430.0) / 580.0, 0.0, 1.0); }
`;

/**
 * GU47 SSR-01: the same haze and sun, driven per frame by the stage colour script (art/colorScript.ts) through uniforms.
 * Only the road and sky read it; `lookMode` 0 reproduces the pre-GU47 constants exactly (`?look=original`).
 */
const ATMOSPHERE_LIVE = /* glsl */ `
#define FOG_COL lookFogColor
#define SUN_DIR lookSunDir
vec3 fogMix(vec3 c, float d){ return mix(c, lookFogColor, clamp((d - lookFogNear) / max(1.0, lookFogFar - lookFogNear), 0.0, 1.0)); }
float fogAmount(float d){ return clamp((d - lookFogNear) / max(1.0, lookFogFar - lookFogNear), 0.0, 1.0); }
`;

/** The original's toon ramp (bands 0.92 / 0.97 / 1.0 under a sky/ground hemisphere tint). */
const TOON = /* glsl */ `
float gToonShadow = 1.0; // sun-shadow factor, set per fragment by a3dSunShadowAuto in specs with receiveShadow: true
vec3 toon(vec3 albedo, vec3 N) {
  vec3 L = normalize(vec3(-0.45, 1.0, 0.6));
  float d = min(dot(N, L) * 0.5 + 0.5, mix(0.30, 1.0, gToonShadow)); // shadow drops the surface to the lowest band
  float band = d < 0.34 ? 0.92 : (d < 0.67 ? 0.97 : 1.0);
  vec3 sky = mix(vec3(0.62, 0.52, 0.5), vec3(1.0, 0.93, 0.9), N.y * 0.5 + 0.5);
  return albedo * band * sky;
}
/** The same ramp with deeper bands, a sunset rim and a small highlight, so figures read as solid forms. */
vec3 toonFigure(vec3 albedo, vec3 N, vec3 V) {
  vec3 L = normalize(vec3(-0.45, 1.0, 0.6));
  float d = min(dot(N, L) * 0.5 + 0.5, mix(0.29, 1.0, gToonShadow));
  float band = d < 0.30 ? 0.66 : (d < 0.62 ? 0.84 : (d < 0.86 ? 0.96 : 1.04));
  vec3 sky = mix(vec3(0.66, 0.5, 0.58), vec3(1.0, 0.92, 0.9), N.y * 0.5 + 0.5);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  float rimLight = rim * (0.35 + 0.65 * max(dot(N, SUN_DIR) * 0.5 + 0.5, 0.0));
  float spec = pow(max(dot(N, normalize(normalize(L) + V)), 0.0), 36.0);
  return albedo * band * sky + vec3(1.0, 0.72, 0.62) * rimLight * 0.42 + vec3(1.0, 0.92, 0.85) * spec * 0.16;
}
`;

/** The road's ramp under the colour script: original bands at lookMode 0; at 1 the key follows the low sun and the sky tint follows the hemisphere colours. */
const TOON_LIVE = /* glsl */ `
float gToonShadow = 1.0;
vec3 toon(vec3 albedo, vec3 N) {
  vec3 L0 = normalize(vec3(-0.45, 1.0, 0.6));
  vec3 L = normalize(mix(L0, normalize(lookSunDir + vec3(0.0, 0.35, 0.0)), lookMode));
  float d = min(dot(N, L) * 0.5 + 0.5, mix(0.30, 1.0, gToonShadow));
  float band = d < 0.34 ? 0.92 : (d < 0.67 ? 0.97 : 1.0);
  band = mix(band, mix(0.62, 1.0, smoothstep(0.2, 0.75, d)), lookMode);
  vec3 sky0 = mix(vec3(0.62, 0.52, 0.5), vec3(1.0, 0.93, 0.9), N.y * 0.5 + 0.5);
  vec3 sky1 = mix(lookHemiGround, lookHemiSky, N.y * 0.5 + 0.5) * 1.35;
  return albedo * band * mix(sky0, sky1, lookMode);
}
`;

export const SOLID_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SOLID_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${ATMOSPHERE}
${TOON}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  gToonShadow = a3dSunShadowAuto(vWorld, N);
  vec3 col = toonFigure(baseColor, N, V) + glowColor * glow;
  outColor = vec4(fogMix(col, length(cameraPosition - vWorld)), 1.0);
}`;

/** Additive soft glow for ki orbs, spirits and power-ups. */
export const GLOW_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const GLOW_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${ATMOSPHERE}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = abs(dot(N, V));
  float rim = pow(1.0 - facing, 1.6);
  float core = pow(facing, 3.0);
  vec3 col = mix(glowShell * 0.9, glowCore, core) + glowShell * rim * 0.5;
  float a = (mix(0.5 + 0.25 * core, 0.12, glowHollow) + 0.45 * rim) * glowAlpha * (1.0 - fogAmount(length(cameraPosition - vWorld)));
  outColor = vec4(col, a);
}`;

/**
 * GU47 SSR-18: the same glow on an instanced node (one draw for every orb, soul or power-up). The vertex applies the
 * per-instance matrix; `glowTint` 1 takes the shell colour from the instance colour (power-up types), 0 ignores it.
 * SSR-09: the core is HDR (x2.2 under the colour script's bloom) with a fresnel shell.
 */
export const GLOW_INSTANCED_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec3 vTint;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vTint = instanceColor.rgb;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const GLOW_INSTANCED_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vTint;
out vec4 outColor;
${ATMOSPHERE}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = abs(dot(N, V));
  float rim = pow(1.0 - facing, 1.6);
  float core = pow(facing, 3.0);
  vec3 shell = mix(glowShell, vTint, glowTint);
  vec3 hot = mix(glowCore, mix(vTint, vec3(1.0), 0.75), glowTint) * glowHdr;
  vec3 col = mix(shell * 0.9, hot, core) + shell * rim * 0.7;
  float a = (mix(0.5 + 0.25 * core, 0.12, glowHollow) + 0.45 * rim) * glowAlpha * (1.0 - fogAmount(length(cameraPosition - vWorld)));
  outColor = vec4(col, a);
}`;

/**
 * GU47 SSR-11: prayer-flag cloth on an instanced box (one draw for both verges). The vertex flutters the cloth along its
 * length with `flagTime` (world.ts slows it on reduced motion); the colour is the instance colour, half-lit by the low
 * sun from behind (translucent cloth glows when backlit) and fogged like the road.
 */
export const FLAG_INSTANCED_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTint;
void main() {
  vec3 p = position;
  float along = p.x + 0.5;
  p.z += sin(flagTime * 6.0 + along * 5.0 + instanceMatrix[3].x * 0.37) * 0.12 * along;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vTint = instanceColor.rgb;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const FLAG_INSTANCED_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTint;
out vec4 outColor;
${ATMOSPHERE}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;
  float back = pow(max(dot(-V, normalize(flagSunDir)), 0.0), 2.0);
  vec3 col = vTint * (0.45 + 0.35 * max(N.y, 0.0)) + vTint * flagSunColor * back * 1.4;
  outColor = vec4(mix(col, flagFogColor, fogAmount(length(cameraPosition - vWorld))), 1.0);
}`;

/**
 * GU47 SSR-11: floating spire islands in the mid and far parallax bands, one instanced draw per band (impostor-weight:
 * a 7-sided inverted cone). Lit tops toward the low sun, a dark under-deck, a hot sun rim on the silhouette edge, and
 * heavy fog so the far band reads as layered silhouettes against the colour-script sky. `vTint` (instance colour) lifts
 * the far band toward the fog.
 */
export const ISLAND_INSTANCED_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTint;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vTint = instanceColor.rgb;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const ISLAND_INSTANCED_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTint;
out vec4 outColor;
${ATMOSPHERE}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormal);
  vec3 L = normalize(islandSunDir);
  float lit = smoothstep(-0.35, 0.65, N.y) * (0.55 + 0.45 * max(dot(N, L), 0.0));
  vec3 rock = mix(islandDark, islandLit, lit);
  float rim = pow(1.0 - abs(dot(N, V)), 3.0) * pow(max(dot(-V, L), 0.0), 2.0);
  vec3 col = rock + islandSunColor * rim * 1.6;
  float fog = max(fogAmount(length(cameraPosition - vWorld)), vTint.r);
  outColor = vec4(mix(col, islandFogColor, fog), 1.0);
}`;

/** Flat additive colour for speed streaks and ki sparks. */
export const FLAT_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const FLAT_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${ATMOSPHERE}
void main() {
  outColor = vec4(flatColor, flatAlpha * (1.0 - fogAmount(length(cameraPosition - vWorld))));
}`;

/** Soft contact shadow: a flat disc faded by distance from the node's own origin. */
export const BLOB_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec3 vCenter;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const BLOB_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vCenter;
out vec4 outColor;
void main() {
  vec3 v = vWorld - vCenter;
  float d = length(v) / blobRadius;
  float a = (1.0 - smoothstep(0.1, 1.0, d)) * blobAlpha;
  // GU47 phase 3 (rubric: shadows): under the colour script the blob is the runner's cast shadow, a capsule from the feet
  // along the ground away from the sun (blobCast metres long), darker at the feet and fading toward its tip.
  if (blobCast > 0.0) {
    float t = clamp(dot(v, blobDir), 0.0, blobCast);
    float r = length(v - blobDir * t) / (blobRadius * mix(0.42, 0.62, t / blobCast));
    float k = t / blobCast;
    float castA = (1.0 - smoothstep(0.35, 1.0, r)) * mix(1.0, 0.25, k * k);
    float feet = 1.0 - smoothstep(0.0, 0.55, length(v) / blobRadius);
    a = max(castA, feet) * blobAlpha;
  }
  if (a < 0.01) discard;
  outColor = vec4(blobShade, a);
}`;

/**
 * Road body: the pearly scaled back of the snake. `crossProfile` is the cross-section (x across,
 * y up) so the walkable top, lane dividers and edge lights are placed in road coordinates.
 */
export const ROAD_VERTEX = /* glsl */ `
attribute vec2 crossProfile;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
out vec2 vCross;
void main() {
  vUv = uv;
  vCross = crossProfile;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const ROAD_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
in vec2 vCross;
out vec4 outColor;
${NOISE}
${ATMOSPHERE_LIVE}
${TOON_LIVE}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float dist = length(cameraPosition - vWorld);
  float s = vUv.y * 10.0;
  float top = 1.0 - smoothstep(3.7, 4.5, abs(vCross.x));
  top *= 1.0 - smoothstep(0.9, 1.5, -vCross.y);

  // scale plates: ~0.8 m across the top, bond-offset rows every 1.6 m; the body uses angular cells
  vec2 cell = mix(vec2(vUv.x * 40.0, s / 2.2), vec2(vCross.x / 0.8, s / 1.6), top);
  float row = floor(cell.y);
  vec2 g = vec2(cell.x + mod(row, 2.0) * 0.5, cell.y);
  vec2 f = fract(g);
  vec2 e = min(f, 1.0 - f);
  vec2 fw = fwidth(cell);
  float fwm = max(fw.x, fw.y);
  // GU47 SSR-08: the scale detail fades out earlier under the colour script (road tile moire past 30 m)
  float detail = 1.0 - smoothstep(mix(0.16, 0.07, lookMode), mix(0.5, 0.28, lookMode), fwm);
  float bevel = mix(0.92, smoothstep(0.0, max(0.16, fwm * 1.5), min(e.x, e.y * 0.8)), detail);
  float joint = mix(0.9, smoothstep(0.0, max(0.05, fwm * 1.4), min(e.x, e.y)), detail);
  float tint = mix(0.5, fbm(floor(g) * 0.7 + 3.1), detail);
  float depth = clamp(-vCross.y / 16.0, 0.0, 1.0);
  float streak = n2(vec2(vCross.x * 1.9 + vCross.y * 0.7, s * 0.16));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);

  vec3 albedo;
  if (lookMode < 0.5) {
    // pre-GU47 road (exact)
    vec3 plate = mix(roadDark, roadTop, 0.5 + 0.5 * tint);
    plate *= mix(0.80, 1.04, bevel);
    vec3 body = mix(scaleColor * vec3(0.92, 0.86, 1.0), vec3(0.34, 0.24, 0.52), smoothstep(0.0, 0.9, depth));
    body *= (0.80 + 0.32 * streak) * mix(0.9, 1.0, bevel);
    albedo = mix(body, plate, top);
    albedo = mix(jointColor * 0.9, albedo, joint);
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + fres * 0.9 + tint * 0.6));
    albedo = mix(albedo, albedo * film * 1.08, 0.07 * top * detail);
  } else {
    // GU47 SSR-08: living serpent road. Overlapping scales (each plate darker toward its trailing edge), a pearl top
    // over a jade flank ramp into indigo belly scales; per-stage tints come from the colour script.
    float overlap = mix(1.0, 0.72 + 0.28 * smoothstep(0.0, 0.85, 1.0 - f.y), detail);
    vec3 plate = mix(roadPearl * 0.86, roadPearl, 0.5 + 0.5 * tint) * mix(0.82, 1.04, bevel) * overlap;
    float flank = smoothstep(0.0, 0.9, depth);
    vec3 body = mix(roadJade, roadBelly, flank);
    // belly scales: wide transverse plates under the body
    float belly = smoothstep(0.55, 0.9, depth);
    float bellyRow = fract(s / 1.1);
    body *= mix(1.0, mix(0.7, 1.0, smoothstep(0.0, max(0.08, fwm * 2.0), min(bellyRow, 1.0 - bellyRow))), belly * detail);
    body *= (0.84 + 0.26 * streak) * mix(0.88, 1.0, bevel) * overlap;
    albedo = mix(body, plate, top);
    albedo = mix(roadJade * 0.55, albedo, joint);
    // view-angle pearl sheen: thin-film hue shift strongest at grazing angles on the plates
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + fres * 1.2 + tint * 0.8));
    albedo = mix(albedo, albedo * film * 1.15, (0.12 + 0.3 * fres) * mix(0.5, 1.0, top) * detail);
  }

  gToonShadow = a3dSunShadowAuto(vWorld, N);
  vec3 col = toon(albedo, N);
  col += mix(vec3(1.0, 0.82, 0.9), lookSunColor, lookMode) * pow(max(dot(N, SUN_DIR), 0.0), 3.0) * mix(0.07, 0.16, lookMode) * top;
  // GU47 phase 3 (rubric: reflections): the lacquered plates mirror the sky. A fresnel sky tint (fog colour warming toward
  // the sun) and a sun glint lane on the road ahead, both kept off the grout lines; script mode only.
  vec3 Rv = reflect(-V, N);
  float rs = max(dot(Rv, SUN_DIR), 0.0);
  vec3 skyRefl = mix(lookFogColor, lookSunColor, pow(rs, 4.0));
  float plateMask = top * mix(0.35, 1.0, joint) * lookMode;
  col = mix(col, skyRefl, (0.06 + 0.3 * fres) * plateMask);
  col += lookSunColor * (pow(rs, 60.0) * 0.55 + pow(rs, 12.0) * 0.08) * plateMask;

  // GU47 SSR-08: the gold spine down the road's centre line, with a wave pulsing forward along the body
  float spineW = 0.22 + fwm * 0.4;
  float spine = (1.0 - smoothstep(spineW * 0.5, spineW, abs(vCross.x))) * top * lookMode;
  float wave = 0.55 + 0.45 * sin(s * 0.18 - roadTime * 5.0);
  col = mix(col, roadSpine * (1.2 + 0.9 * wave), spine * 0.9);

  // GU47 SSR-17: THE BROKEN SPINE's cracked plates: thin coral-gold veins glowing through some of the top plates
  float cracked = step(0.58, fbm(floor(g) * 0.37 + 7.3)) * top * detail * roadCrack * lookMode;
  float vein = 1.0 - smoothstep(0.0, 0.05 + fwm * 1.5, abs(n2(g * 2.3 + 1.7) - 0.5));
  col += mix(vec3(1.0, 0.48, 0.42), roadSpine, 0.5) * vein * cracked * (1.1 + 0.5 * wave);

  // gap telegraph: the edges of the 30 m of road before the next missing plate glow warm while gapWarn is up
  float ahead = gapAt - s;
  float edge = smoothstep(2.6, 3.5, abs(vCross.x)) * top;
  float warn = gapWarn * edge * step(0.0, ahead) * (1.0 - smoothstep(0.0, 30.0, ahead));
  col = mix(col, vec3(1.0, 0.52, 0.32), clamp(warn, 0.0, 1.0) * 0.85);

  outColor = vec4(fogMix(col, dist), 1.0);
}`;

/** Surge aura shell: the original's stacked blade tiers (ported verbatim), shaded with `auraTime` / `auraIntensity` / ... */
export const AURA_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vNV;
void main() {
  vUv = uv;
  vNV = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const AURA_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vNV;
out vec4 outColor;
${NOISE}
float bladeTier(float up, float s, float e, float kSeed, float ux, out float acrossOut){
  acrossOut = 0.0;
  float lh = (up - s) / (e - s);
  if (lh < 0.0 || lh > 1.0) return 0.0;
  float colx = ux * 13.0 + kSeed * 7.31;
  float idx = floor(colx);
  float within = fract(colx);
  float r1 = hsh(vec2(idx, 3.7 + kSeed));
  float r2 = hsh(vec2(idx, 9.1 + kSeed));
  float r3 = hsh(vec2(idx, 17.3 + kSeed));
  float reach = 0.50 + r1 * 0.48;
  reach *= 0.84 + 0.26 * sin(auraTime * (2.0 + r2 * 4.0) + idx * 1.7 + kSeed * 5.0);
  float along = 1.0 - lh / max(reach, 0.05);
  if (along <= 0.0) return 0.0;
  float halfW = mix(0.72, 0.26, 1.0 - along);
  float across = 1.0 - clamp(abs(within - 0.5) / halfW, 0.0, 1.0);
  if (across <= 0.0) return 0.0;
  float alive = step(0.10, r3);
  float envelope = smoothstep(0.0, 0.32, lh) * (0.66 + 0.34 * lh);
  acrossOut = across;
  return pow(along, 0.8) * pow(across, 0.45) * alive * envelope;
}
void main(){
  float up = clamp(vUv.y, 0.0, 1.0);
  float ac0; float a0 = bladeTier(up, 0.00, 0.40, 0.0, vUv.x, ac0);
  float ac1; float a1 = bladeTier(up, 0.32, 0.70, 1.0, vUv.x, ac1) * 1.22;
  float ac2; float a2 = bladeTier(up, 0.56, 1.00, 2.0, vUv.x, ac2) * 1.48;
  float aB = max(a0, max(a1, a2));
  if (aB <= 0.0) discard;
  float across = (a0 >= a1 && a0 >= a2) ? ac0 : (a1 >= a2 ? ac1 : ac2);
  float side = abs(sin(vUv.x * 6.2831853));
  float sideW = mix(1.0, 0.22 + 0.95 * pow(side, 1.5), auraFlank);
  float rim = pow(1.0 - abs(vNV.z), 1.25);
  float dens = 1.0;
  if (auraSheath > 0.5) {
    float t = clamp(vUv.y, 0.0, 1.0);
    dens = smoothstep(0.00, 0.30, t) * (1.0 - smoothstep(0.38, 1.0, t) * 0.94);
    dens *= 1.85;
  }
  float a = aB * sideW * dens * (0.88 + 0.72 * rim) * auraIntensity;
  a *= auraSolid;
  a *= mix(1.0, 0.62, up);
  a *= smoothstep(0.985, 0.86, up);
  if (a < 0.015) discard;
  vec3 col = mix(auraEdge, auraMid, smoothstep(0.10, 0.55, across));
  col = mix(col, auraHot, smoothstep(0.62, 0.95, across) * aB);
  outColor = vec4(col, min(a, 0.82));
}`;

/** Sky: violet dome over a ray-marched cloud deck, with a low pink sun, high wisps and a horizon haze that matches the road fog. */
export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${CLOUD_NOISE}
${ATMOSPHERE_LIVE}
const float CLOUD_H = 55.0;
float deckTop(vec2 xz){
  vec2 q = xz * 0.0026 + vec2(skyTime * 0.004, skyTime * 0.0013);
  float base = cfbm3(q);
  float lobes = cn(q * 4.7 + 3.1) * 0.65 + cn(q * 9.9 + 8.3) * 0.35;
  float h = base * 0.78 + lobes * 0.22;
  return smoothstep(0.30, 0.74, h) * CLOUD_H * (0.7 + 0.3 * lobes);
}
vec3 skyAt(float dy) {
  float t = clamp(dy / 0.80, 0.0, 1.0);
  float banded = floor(t * 10.0) / 10.0 + fract(t * 10.0) * 0.10;
  float b = mix(t, banded, 0.3);
  return b < 0.46 ? mix(skyLo, skyMid, smoothstep(0.02, 0.48, b)) : mix(skyMid, skyHi, smoothstep(0.46, 0.94, b));
}
/** GU47 SSR-04: smooth horizon -> upper -> zenith gradient, a hot band under the sun, sun disc with corona, moon. */
vec3 scriptSky(vec3 dir, float sd) {
  float dy = max(dir.y, 0.0);
  vec3 col = mix(skyLo, skyMid, smoothstep(0.0, 0.28, dy));
  col = mix(col, skyHi, smoothstep(0.18, 0.85, dy));
  float bandW = exp(-dy * 9.0);
  col = mix(col, skyBand, bandW * (0.35 + 0.65 * pow(sd, 3.0)));
  float disc = smoothstep(0.99955, 0.99975, sd);
  float corona = pow(sd, 90.0) * 0.9 + pow(sd, 12.0) * 0.25;
  // moon: pale disc with soft maria; no corona, a cold halo
  float maria = 0.82 + 0.18 * cn(dir.xy * 900.0);
  vec3 sunCol = mix(skySunDisc * 3.0, skySunDisc * 1.6 * maria, skyMoon);
  col += skySunDisc * corona * skyCorona * (1.0 - 0.7 * skyMoon);
  col += skySunDisc * pow(sd, 400.0) * 0.6 * skyMoon;
  col = mix(col, sunCol, disc);
  return col;
}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float sd = max(dot(dir, SUN_DIR), 0.0);
  vec3 col;
  if (dir.y >= 0.0) {
    col = lookMode < 0.5 ? skyAt(dir.y) : scriptSky(dir, sd);
    // star points: ~2 px squares scattered over the dome, thinning towards the horizon
    vec2 sp = vec2(atan(dir.z, dir.x) * 57.2958, dir.y * 180.0);
    vec2 cell = floor(sp);
    if (ch(cell + 17.0) > 0.982) {
      vec2 centre = cell + 0.5 + (vec2(ch(cell + 3.1), ch(cell + 9.7)) - 0.5) * 0.5;
      vec2 px = (sp - centre) / max(fwidth(sp), vec2(1e-4));
      float star = (1.0 - smoothstep(0.7, 1.5, max(abs(px.x), abs(px.y)))) * smoothstep(0.03, 0.2, dir.y);
      star *= mix(1.0, skyStars * smoothstep(0.08, 0.45, dir.y) * (0.6 + 0.4 * ch(cell + 41.0)), lookMode);
      col = mix(col, vec3(1.0), star * 0.9);
    }
    col = mix(FOG_COL, col, smoothstep(0.0, mix(0.2, 0.08, lookMode), dir.y));
  } else {
    vec3 ro = cameraPosition;
    float topY = deckBase + CLOUD_H;
    float tB = min((deckBase - 8.0 - ro.y) / dir.y, 3400.0);
    float tA = ro.y > topY ? (topY - ro.y) / dir.y : 0.0;
    // GU47 SSR-04: under the colour script the under-deck keeps its own darker tint; lookMode 0 is the old multiply
    vec3 under = mix(cloudDark * vec3(0.66, 0.58, 0.32), cloudDark * 0.8, lookMode);
    if (tB <= 0.0) {
      col = mix(cloudDark * vec3(0.62, 0.52, 0.80), FOG_COL, 0.5);
    } else {
      tA = min(tA, tB);
      float dt = (tB - tA) / 22.0;
      float t = tA + dt * (0.15 + 0.85 * ch(dir.xz * 1371.7 + dir.y * 91.3));
      vec3 acc = vec3(0.0);
      float trans = 1.0;
      float tFirst = tB;
      for (int i = 0; i < 22; i++) {
        vec3 p = ro + dir * t;
        float hgt = p.y - deckBase;
        float top = deckTop(p.xz);
        float dens = hgt < 0.0 ? 1.0 : clamp((top - hgt) / 16.0, 0.0, 1.0);
        if (dens > 0.01) {
          float a = 1.0 - exp(-dens * dt * 0.055);
          float depth01 = clamp((top - hgt) / CLOUD_H, 0.0, 1.0);
          vec3 sp = p + SUN_DIR * 30.0;
          float occl = clamp((deckTop(sp.xz) - (sp.y - deckBase)) / 16.0, 0.0, 1.0);
          float lit = (1.0 - occl) * (0.35 + 0.65 * smoothstep(0.0, 0.8, 1.0 - depth01));
          float fine = cn(p.xz * 0.05) * 0.6 + cn(p.xz * 0.15) * 0.4;
          lit *= 0.7 + 0.6 * fine;
          // lit cumulus tops glow hotter toward the sun (forward scatter) under the colour script
          lit *= 1.0 + lookMode * 0.6 * pow(sd, 6.0);
          vec3 sc = mix(under, cloudMid, 0.1 + 0.9 * clamp(lit, 0.0, 1.0));
          sc = mix(sc, cloudLit, clamp(lit, 0.0, 1.0) * clamp(lit, 0.0, 1.0) * mix(0.55, 0.8, lookMode));
          acc += trans * a * sc;
          if (trans > 0.5 && trans * (1.0 - a) <= 0.5) tFirst = t;
          trans *= 1.0 - a;
          if (trans < 0.03) break;
        }
        t += dt;
      }
      vec3 floorCol = mix(cloudDark * vec3(0.5, 0.4, 0.22), cloudDark * 0.45, lookMode);
      col = acc + trans * floorCol;
      col *= 0.93 + 0.14 * ch(gl_FragCoord.xy);
      col = mix(col, FOG_COL, smoothstep(600.0, 3400.0, tFirst) * 0.9);
      col = mix(col, FOG_COL, 0.6 * exp(dir.y * 18.0));
    }
  }
  outColor = vec4(col, 1.0);
}`;
