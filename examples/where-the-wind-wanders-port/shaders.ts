/**
 * GLSL 300 es for the port. Every program shares one lighting model measured from the original's
 * rig (warm key from (-35, 60, 28), hemisphere sky #e5f2cf over ground #395730, exp2 fog #b8d0bd at
 * density 0.0045) and writes linear HDR; the engine's ACES output stage (exposure 1.16 in the
 * original) does the tone mapping, so every surface rolls off the same way.
 *
 *   WIND_*      grass tufts, flowers, ferns, reeds and shrubs: alpha-cut crossed cards that sway
 *   PAINT_*     the painted ground: brush strokes, flower speckle, baked tree and building shadows
 *   SEA_*       water: shallow-to-deep colour, fresnel sky, foam lines, glitter
 *   SKY_*       gradient, painted clouds, sun
 *   PROP_*      merged scenery (trees, cottage, windmill, fences, jetty, bell): procedural wood,
 *               plaster, tiles, bark, leaves from per-vertex `kind` and metre uvs
 *   TRAVELLER_* the walker: limbs swing in the vertex shader from a gait phase
 *   GLOW_/MOTE_ billboards: letter and bell halos, drifting pollen
 *   HAZE_/SHAFT_ ground mist ribbons and light shafts
 *   BLOB_*      the traveller's contact shadow
 */

import { CLOUD_GLSL, WIND_GLSL } from "./wind";

const PLAYER_FADE = /* glsl */ `
bool playerFade(vec3 world) {
  float t = smoothstep(0.9, 3.4, distance(world.xz, playerPos.xz));
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return t < ign;
}
`;

/**
 * GU47 WW47-L1: the light is no longer hard-coded. `sunDir`, `sunCol`, `sunGain`, `skyCol`, `gndCol`, `fogCol`,
 * `fogDensity`, `fogHeight` and `cloudShadowAmt` are spec uniforms (`daylightUniforms()` in world.ts) written every
 * frame from the daylight driver (daylight.ts), so the painted surfaces and the engine sun share one key.
 * A fragment that defines `WIND_SUN_SHADOW` and includes `<a3d_shadow>` before COMMON receives the engine sun's shadow.
 */
export const COMMON = /* glsl */ `
#include <a3d_fog>
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return s / 0.9375;
}

${WIND_GLSL}
${CLOUD_GLSL}
/** The share of the sun reaching a ground point: the engine sun shadow (when received) times the drifting cloud shadow. */
float sunVisibility(vec3 world, vec3 n) {
  float clouds = 1.0 - cloudShadowAmt * cloudCover(world.xz, windTime);
#ifdef WIND_SUN_SHADOW
  return clouds * a3dSunShadowAuto(world, n);
#else
  return clouds;
#endif
}

vec3 lightSurface(vec3 albedo, vec3 n, float ao, float wrap, float sss, vec3 view, vec3 world) {
  float ndl = dot(n, sunDir);
  float lam = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 hemi = mix(gndCol, skyCol, n.y * 0.5 + 0.5) * 0.92;
  float vis = sunVisibility(world, n);
  vec3 sun = sunCol * sunGain * lam * vis;
  float back = sss * pow(clamp(dot(-view, sunDir), 0.0, 1.0), 2.0) * 0.8 * vis;
  return albedo * (hemi * ao + sun * mix(1.0, ao, 0.7) + sunCol * back);
}

bool nearFade(vec3 world, float d0, float d1) {
  float t = smoothstep(d0, d1, distance(cameraPosition, world));
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return t < ign;
}

vec3 applyFog(vec3 c, vec3 world, float scale) {
  float d = distance(cameraPosition, world);
  float f = 1.0 - exp(-pow(fogDensity * scale * d, 2.0));
  c = mix(c, fogCol, clamp(f, 0.0, 1.0));
  // WW47-S3: low fog pooling over the sea and the stream (sea level -0.55) at golden hour and dusk; 0 at midday
  return a3dFogHeight(c, mix(fogCol, sunCol, 0.18), d, world.y, 0.0, 0.016 * fogHeight * scale, -0.55, 0.9, 0.6 * fogHeight);
}
`;

/* ---------------------------------------------------------------- foliage cards */

export const WIND_VERTEX = /* glsl */ `
attribute vec3 tint;
attribute float sway;
attribute float phase;
attribute float kind;
out vec3 vTint;
out vec2 vUv;
out vec3 vWorld;
out float vKind;
out float vPhase;
out float vGust;
${WIND_GLSL}
void main() {
  vTint = tint;
  vUv = uv;
  vKind = kind;
  vPhase = phase;
  vec3 p = position;
  float gust = 0.55 + 0.45 * sin(windTime * 0.31 + position.x * 0.045 + position.z * 0.03);
  // WW47-S2: the signature gust band rolls downwind (wind.ts); gustAmt 0 keeps the 4.6 sway (?look=original)
  float band = windGustBand(position.xz, windTime);
  vGust = band * gustAmt;
  gust = mix(gust, gust * (0.55 + 0.45 * windGust(position.xz, windTime)), gustAmt);
  float w = windTime * 1.7 + phase + position.x * 0.12;
  float bend = uv.y * uv.y;
  p.x += (sin(w) * 0.7 + sin(w * 2.3 + phase) * 0.3) * sway * bend * windStrength * gust * 1.3;
  p.z += cos(w * 0.73 + phase) * sway * 0.55 * bend * windStrength * gust;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

export const WIND_FRAGMENT = /* glsl */ `
in vec3 vTint;
in vec2 vUv;
in vec3 vWorld;
in float vKind;
in float vPhase;
in float vGust;
out vec4 outColor;
#define WIND_SUN_SHADOW 1
#include <a3d_shadow>
${COMMON}
${PLAYER_FADE}

float seg(vec2 p, vec2 a, vec2 b, float r0, float r1) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r0, r1, h);
}

void main() {
  if (nearFade(vWorld, 2.5, 7.0)) discard;
  if (vWorld.z > playerPos.z - 0.4 && distance(vWorld.xz, playerPos.xz) < 3.4 && playerFade(vWorld)) discard;
  int k = int(vKind + 0.5);
  vec2 uv = vUv;
  float cover = 0.0;
  float tone = 0.0;
  vec3 col = vTint;
  float ph = vPhase;
  if (k == 0) {
    // grass tuft: five leaning blades of different heights
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float cx = 0.1 + fi * 0.16 + (hash21(vec2(ph, fi)) - 0.5) * 0.12;
      float h = 0.62 + 0.38 * hash21(vec2(fi, ph * 1.7));
      float lean = (hash21(vec2(ph + 3.0, fi)) - 0.5) * 0.34;
      float x = uv.x - cx - lean * uv.y * uv.y;
      float wdt = 0.1 * (1.0 - uv.y / h);
      float inside = step(uv.y, h) * (1.0 - smoothstep(wdt * 0.55, wdt, abs(x)));
      if (inside > cover) { cover = inside; tone = fi * 0.16 + uv.y / h * 0.6; }
    }
    col = vTint * (0.52 + 0.9 * tone * 0.8 + 0.25 * uv.y);
  } else if (k == 1) {
    // flower: stem, two leaves and a five-petal head
    float stem = 1.0 - smoothstep(0.016, 0.03, abs(uv.x - 0.5 - 0.04 * sin(uv.y * 3.0 + ph)));
    stem *= step(uv.y, 0.64);
    vec2 hc = vec2(0.5, 0.74);
    vec2 d = uv - hc;
    float ang = atan(d.y, d.x);
    float petals = 0.2 * (0.78 + 0.22 * cos(5.0 * ang + ph));
    float head = 1.0 - smoothstep(petals * 0.82, petals, length(d));
    float core = 1.0 - smoothstep(0.045, 0.06, length(d));
    float leaf = (1.0 - smoothstep(0.0, 0.05, seg(uv, vec2(0.5, 0.12), vec2(0.78, 0.3), 0.045, 0.0))) +
                 (1.0 - smoothstep(0.0, 0.05, seg(uv, vec2(0.5, 0.2), vec2(0.2, 0.36), 0.045, 0.0)));
    vec3 green = vec3(0.12, 0.26, 0.06) * (0.8 + 0.5 * uv.y);
    vec3 petal = vTint * (0.78 + 0.35 * length(d) / 0.2);
    col = mix(green, petal, head);
    col = mix(col, vec3(0.95, 0.62, 0.08), core);
    cover = max(max(stem, clamp(leaf, 0.0, 1.0)), head);
  } else if (k == 2) {
    // fern: arching rib with pinnate fronds
    float rib = uv.x - 0.5 - 0.22 * uv.y * uv.y * sign(sin(ph));
    float env = sin(clamp(uv.y, 0.0, 1.0) * 3.14159) * 0.42 * (1.0 - 0.35 * uv.y);
    float teeth = 0.5 + 0.5 * sin(uv.y * 46.0 + abs(rib) * 14.0);
    float frond = step(abs(rib), env * (0.45 + 0.55 * teeth)) * step(0.06, uv.y);
    float midrib = 1.0 - smoothstep(0.012, 0.022, abs(rib));
    cover = max(frond, midrib);
    col = vTint * (0.55 + 0.7 * uv.y) * (0.82 + 0.3 * teeth);
  } else if (k == 3) {
    // reed with a seed head on some plants
    float x = uv.x - 0.5 - 0.06 * sin(uv.y * 2.4 + ph);
    float blade = step(uv.y, 0.96) * (1.0 - smoothstep(0.02 * (1.0 - uv.y) + 0.004, 0.035 * (1.0 - uv.y) + 0.012, abs(x)));
    float seed = step(4.0, mod(ph, 6.0));
    vec2 d = vec2(x, (uv.y - 0.82) * 0.34);
    float head = seed * (1.0 - smoothstep(0.035, 0.05, length(d * vec2(1.6, 1.0)))) * step(0.7, uv.y) * step(uv.y, 0.94);
    cover = max(blade, head);
    col = mix(vTint * (0.5 + 0.8 * uv.y), vec3(0.28, 0.16, 0.07), head);
  } else if (k == 5) {
    // ground-cover rosette: broad overlapping leaves fanning out of one point
    vec2 d = uv - vec2(0.5, 0.0);
    float best = 0.0;
    for (int i = 0; i < 5; i++) {
      float a = -1.35 + float(i) * 0.675 + (hash21(vec2(ph, float(i))) - 0.5) * 0.3;
      vec2 dir = vec2(sin(a), cos(a));
      float along = dot(d, dir);
      float across = abs(dot(d, vec2(dir.y, -dir.x)));
      float len = 0.55 + 0.35 * hash21(vec2(float(i), ph));
      float wdt = 0.17 * sin(clamp(along / len, 0.0, 1.0) * 3.14159) + 0.012;
      float inside = step(0.0, along) * step(along, len) * (1.0 - smoothstep(wdt * 0.8, wdt, across));
      if (inside > best) { best = inside; tone = along / len; }
    }
    cover = best;
    col = vTint * (0.5 + 0.8 * tone) * (0.85 + 0.3 * vnoise(uv * 18.0 + ph));
    col = mix(col, vec3(0.1, 0.32, 0.22) * (0.6 + 0.7 * tone), 0.35);
  } else if (k == 6) {
    // flower spike (lupine-like): a stem carrying many small florets, densest at the base of the head
    float x = uv.x - 0.5 - 0.05 * sin(uv.y * 2.5 + ph);
    float stem = 1.0 - smoothstep(0.012, 0.024, abs(x));
    stem *= step(uv.y, 0.55);
    float row = floor(uv.y * 22.0);
    float taper = 0.17 * (1.0 - smoothstep(0.52, 0.98, uv.y)) + 0.015;
    vec2 cell = vec2(floor((x + 0.25) * 16.0), row);
    float floret = hash21(cell + ph) > 0.28 ? 1.0 : 0.0;
    float within = step(abs(x), taper) * step(0.45, uv.y) * step(uv.y, 0.97) * floret;
    vec2 f = fract(vec2((x + 0.25) * 16.0, uv.y * 22.0)) - 0.5;
    within *= 1.0 - smoothstep(0.34, 0.46, length(f));
    cover = max(stem, within);
    vec3 green = vec3(0.1, 0.28, 0.07);
    col = mix(green, vTint * (0.8 + 0.5 * hash21(cell)), within);
  } else {
    // flowering shrub: dense leafy mound, darker underneath, speckled with blossom
    vec2 d = (uv - vec2(0.5, 0.44)) * vec2(1.0, 1.12);
    float ang = atan(d.y, d.x);
    float edge = 0.46 + 0.05 * (vnoise(vec2(ang * 3.0, ph) * 2.0) - 0.5) * 2.0 + 0.035 * sin(ang * 13.0 + ph);
    cover = 1.0 - smoothstep(edge - 0.045, edge, length(d));
    float leaves = vnoise(uv * 22.0 + ph) * 0.6 + vnoise(uv * 9.0 + ph * 2.0) * 0.4;
    float dapple = smoothstep(0.56, 0.82, vnoise(uv * 11.0 + ph * 3.0));
    col = vTint * (0.45 + 0.5 * uv.y + 0.35 * leaves + 0.45 * dapple);
    vec2 bc = floor(uv * 10.0);
    float bh = hash21(bc + ph);
    vec2 bf = fract(uv * 10.0) - 0.5;
    float bloom = step(0.66, bh) * (1.0 - smoothstep(0.26, 0.4, length(bf))) * step(0.18, uv.y);
    float pick = fract(ph * 1.7);
    vec3 petal = pick < 0.34 ? vec3(0.92, 0.28, 0.4) : pick < 0.62 ? vec3(0.86, 0.16, 0.14) : pick < 0.82 ? vec3(0.97, 0.62, 0.7) : vec3(0.98, 0.86, 0.35);
    col = mix(col, petal * (0.8 + 0.4 * bh), bloom);
  }
  if (cover < 0.5) discard;
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vec3(0.0, 1.0, 0.0) + vec3((uv.x - 0.5) * 0.5, 0.0, 0.0));
  // a passing gust bends the blades over and shows their paler undersides: a light sheen that travels downwind
  col = mix(col, col * vec3(1.18, 1.16, 1.02) + vec3(0.03, 0.035, 0.015), vGust * uv.y * 0.85);
  vec3 lit = lightSurface(col, n, 0.55 + 0.45 * uv.y, 0.6, 0.55, view, vWorld);
  outColor = vec4(applyFog(lit, vWorld, 1.0), 1.0);
}`;

/* ---------------------------------------------------------------- terrain */

export const PAINT_VERTEX = /* glsl */ `
attribute vec3 tint;
out vec3 vTint;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vTint = tint;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const PAINT_FRAGMENT = /* glsl */ `
in vec3 vTint;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
#define WIND_SUN_SHADOW 1
#include <a3d_shadow>
${COMMON}
void main() {
  vec2 p = vWorld.xz;
  float broad = fbm(p * 0.28);
  float brush = fbm(p * 1.6 + 3.1);
  float fine = vnoise(p * 7.5) * 0.6 + vnoise(p * 19.0) * 0.4;
  float stroke = vnoise(vec2(p.x * 11.0, p.y * 2.4 + broad * 5.0));
  vec3 albedo = vTint * (0.7 + 0.5 * broad) * (0.86 + 0.2 * brush + 0.16 * (stroke - 0.5) + 0.1 * (fine - 0.5));
  float grassy = smoothstep(0.0, 0.1, vTint.g - vTint.r * 0.92) * (1.0 - smoothstep(0.55, 0.9, vTint.r));
  // tiny wild flowers painted into the turf
  vec2 cell = floor(p * 2.1);
  vec2 local = fract(p * 2.1) - 0.5;
  float h = hash21(cell);
  float dot1 = step(0.9, h) * (1.0 - smoothstep(0.06, 0.1, length(local - (vec2(hash21(cell + 4.0), hash21(cell + 9.0)) - 0.5) * 0.6)));
  vec3 fc = h > 0.97 ? vec3(0.9, 0.82, 0.28) : h > 0.94 ? vec3(0.9, 0.9, 0.85) : vec3(0.62, 0.7, 0.95);
  albedo = mix(albedo, fc * 0.85, dot1 * grassy * 0.85);
  // WW47-M2 (GU47 only, paintAmt 0 on ?look=original): brush strokes laid along the wind, long downwind and narrow
  // across it, and an ochre band down the worn path with brush-broken edges. Mean factor ~1, so the key stays the key.
  vec2 wq = vec2(dot(p, WIND_DIR), dot(p, vec2(-WIND_DIR.y, WIND_DIR.x)));
  float lay = vnoise(vec2(wq.x * 0.9, wq.y * 7.0) + broad * 2.5);
  float bristle = vnoise(vec2(wq.x * 2.6, wq.y * 31.0));
  albedo *= mix(1.0, 0.82 + 0.3 * lay + 0.12 * (bristle - 0.5), paintAmt);
  float pathD = p.y - (3.5 + 1.7 * sin(0.082 * p.x));
  float pathBand = exp(-(pathD * pathD) / 0.55) * step(-52.0, p.x) * step(p.x, 58.0);
  float pathEdge = smoothstep(0.25, 0.75, pathBand + (lay - 0.5) * 0.5);
  albedo = mix(albedo, vec3(0.6, 0.4, 0.15) * (0.9 + 0.2 * bristle), pathEdge * 0.42 * paintAmt);
  // a little relief from the brush field so slopes catch the sun
  float e = 0.12;
  float h0 = vnoise(p * 2.4);
  vec3 n = normalize(vNormal + vec3((vnoise(p * 2.4 + vec2(e, 0.0)) - h0), 0.0, (vnoise(p * 2.4 + vec2(0.0, e)) - h0)) * 0.9);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 lit = lightSurface(albedo, n, 0.9 + 0.1 * brush, 0.35, 0.0, view, vWorld);
  outColor = vec4(applyFog(lit, vWorld, 1.0), 1.0);
}`;

/* ---------------------------------------------------------------- sea */

export const SEA_FRAGMENT = /* glsl */ `
in vec3 vTint;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  vec2 p = vWorld.xz;
  float t = windTime;
  vec2 q1 = p * 0.22 + vec2(t * 0.045, -t * 0.03);
  vec2 q2 = p * 0.6 + vec2(-t * 0.07, t * 0.05);
  float e = 0.05;
  float a0 = vnoise(q1) * 0.65 + vnoise(q2) * 0.35;
  float ax = vnoise(q1 + vec2(e, 0.0)) * 0.65 + vnoise(q2 + vec2(e, 0.0)) * 0.35;
  float az = vnoise(q1 + vec2(0.0, e)) * 0.65 + vnoise(q2 + vec2(0.0, e)) * 0.35;
  vec3 n = normalize(vec3(-(ax - a0) * 1.4, 1.0, -(az - a0) * 1.4));
  vec3 view = normalize(cameraPosition - vWorld);
  float s = smoothstep(8.0, 16.0, vWorld.x);
  float shoreZ = -13.2 - 1.2 * (1.0 - s) - (2.6 + 9.0 * (1.0 - s)) * 0.6;
  float off = vWorld.z - shoreZ;
  float depth = smoothstep(0.0, 18.0, -off);
  vec3 shallow = vec3(0.14, 0.72, 0.64);
  vec3 deep = vec3(0.04, 0.45, 0.55);
  vec3 col = mix(shallow, deep, pow(depth, 0.7));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, view), 0.0), 4.0);
  vec3 refl = reflect(-view, n);
  vec3 skyc = mix(vec3(0.6, 0.8, 0.86), vec3(0.14, 0.4, 0.82), clamp(refl.y * 1.6, 0.0, 1.0));
  // phase 3 (GU47 daylight only, seaSparkle = the key's clearSky): a stronger sky reflection
  col = mix(col, skyc, fres * (0.55 + 0.25 * seaSparkle));
  float glint = pow(max(dot(refl, sunDir), 0.0), 140.0) * 5.0;
  float tw = smoothstep(0.78, 0.98, vnoise(p * vec2(5.0, 9.0) + vec2(t * 0.6, t * 0.4)));
  col += sunCol * (glint + tw * 0.18 * (1.0 - depth * 0.5));
  // phase 3: daylight sparkle on the wind ripples (the sun sits behind the camera, so the glint alone never shows)
  float sparkle = smoothstep(0.86, 0.99, vnoise(p * vec2(7.0, 12.0) + vec2(t * 0.9, -t * 0.5))) * smoothstep(0.55, 0.85, a0);
  col += vec3(1.0, 0.98, 0.92) * sparkle * 0.55 * seaSparkle;
  // foam breathes along the shore
  float breathe = 0.5 + 0.5 * sin(t * 1.1 + off * 1.6 + a0 * 6.0);
  float foam = (1.0 - smoothstep(0.0, 2.4, off + 0.6 * breathe)) * step(-0.8, off) * (0.35 + 0.65 * breathe) * smoothstep(0.35, 0.7, vnoise(p * 1.6 + t * 0.2));
  foam += (1.0 - smoothstep(0.0, 0.7, abs(off + 1.2 - 1.6 * breathe))) * 0.35 * step(0.0, off + 2.0);
  col = mix(col, vec3(0.95, 0.97, 0.92), clamp(foam, 0.0, 0.85));
  float alpha = mix(0.55, 0.97, smoothstep(-0.5, 3.5, -off + 1.0)) ;
  outColor = vec4(applyFog(col, vWorld, 1.0), alpha);
}`;

export const STREAM_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float t = windTime;
  float flow = vnoise(vec2(vUv.y * 0.9 - t * 0.9, vUv.x * 7.0)) * 0.6 + vnoise(vec2(vUv.y * 2.3 - t * 1.6, vUv.x * 13.0)) * 0.4;
  vec3 deepC = vec3(0.07, 0.5, 0.52);
  vec3 shallowC = vec3(0.42, 0.82, 0.7);
  vec3 col = mix(deepC, shallowC, smoothstep(0.1, 1.0, across) * 0.8 + flow * 0.25);
  col += vec3(0.5, 0.65, 0.6) * smoothstep(0.62, 0.9, flow) * 0.5;
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = 0.05 + 0.5 * pow(1.0 - max(view.y, 0.0), 3.0);
  col = mix(col, vec3(0.55, 0.78, 0.9), fres);
  float foam = smoothstep(0.78, 0.97, across) * (0.5 + 0.5 * vnoise(vec2(vUv.y * 3.0, t * 0.4)));
  col = mix(col, vec3(0.92, 0.96, 0.9), foam * 0.7);
  float alpha = (1.0 - smoothstep(0.88, 1.0, across)) * 0.94;
  outColor = vec4(applyFog(col, vWorld, 1.0), alpha);
}`;

/* ---------------------------------------------------------------- sky */

export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${COMMON}
#include <a3d_sky>
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float up = clamp(dir.y, 0.0, 1.0);
  // WW47-S1: the gradient comes from the daylight key (the 4.6 colours under ?look=original)
  vec3 horizon = skyHorizon;
  vec3 mid = skyMid;
  vec3 zenith = skyZenith;
  vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.3, up));
  sky = mix(sky, zenith, smoothstep(0.22, 0.85, up));
  float sunAmt = max(dot(dir, sunDir), 0.0);
  vec3 sunLegacy = sunCol * (pow(sunAmt, 6.0) * 0.16 + pow(sunAmt, 90.0) * 0.7 + pow(sunAmt, 2000.0) * 8.0);
  // painted sun: a soft disc (0.6 deg radius) inside a wide warm glow, plus warm haze along the horizon
  vec3 sunPainted = sunCol * (a3dSunGlow(dir, sunDir, 9.0) * 0.22 + a3dSunGlow(dir, sunDir, 160.0) * 0.6 + a3dSunDisc(dir, sunDir, 0.0105) * 6.0)
    + a3dHorizonHaze(dir, mix(horizon, sunCol, 0.35) * 0.18, 0.16);
  sky += mix(sunLegacy, sunPainted, skyPainted);
  vec2 cp = dir.xz / max(dir.y + 0.09, 0.035) * 0.62 + vec2(windTime * 0.011, windTime * 0.004);
  // the painted clouds drift with the prevailing wind (wind.ts) instead of the fixed 4.6 drift
  cp += skyPainted * WIND_DIR * windTime * 0.006;
  float c = fbm(cp * 1.15);
  float cs = fbm((cp + sunDir.xz * 0.16) * 1.15);
  // phase 3: a fair-weather sky by day (clearSky): fewer clouds with brighter undersides; 0 keeps the dusk and night deck
  float cov = smoothstep(0.6 + 0.07 * clearSky, 0.76 + 0.05 * clearSky, c + 0.08 * fbm(cp * 4.0));
  cov *= smoothstep(0.0, 0.2, dir.y);
  float lit = clamp(0.55 + (c - cs) * 5.5, 0.0, 1.0);
  vec3 cloud = mix(mix(vec3(0.55, 0.64, 0.78), vec3(0.8, 0.87, 0.96), 0.55 * clearSky), vec3(1.25, 1.17, 1.02), lit) * cloudTint;
  cloud = mix(cloud, horizon * 1.05, smoothstep(0.1, 0.0, dir.y) * 0.8);
  // stars after the bell: the a3d_sky hash field, faded under clouds and toward the horizon
  sky += vec3(0.9, 0.92, 1.0) * a3dStars(dir, 0.012 * starAmt) * starAmt * 1.6 * (1.0 - cov);
  sky = mix(sky, cloud, cov * 0.92);
  sky = mix(horizon, sky, smoothstep(-0.12, 0.0, dir.y));
  outColor = vec4(sky, 1.0);
}`;

/* ---------------------------------------------------------------- props */

export const PROP_VERTEX = /* glsl */ `
attribute vec3 tint;
attribute float sway;
attribute float phase;
attribute float kind;
out vec3 vTint;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
out float vKind;
void main() {
  vTint = tint;
  vUv = uv;
  vKind = kind;
  vec3 p = position;
  float gust = 0.55 + 0.45 * sin(windTime * 0.31 + position.x * 0.045 + position.z * 0.03);
  float w = windTime * 1.35 + phase;
  p.x += (sin(w + position.y * 0.5) * 0.7 + sin(w * 2.1 + phase * 1.7) * 0.3) * sway * gust;
  p.z += cos(w * 0.8 + position.x * 0.2) * sway * 0.5 * gust;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

export const PROP_FRAGMENT = /* glsl */ `
in vec3 vTint;
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
in float vKind;
out vec4 outColor;
#define WIND_SUN_SHADOW 1
#include <a3d_shadow>
${COMMON}
${PLAYER_FADE}

void main() {
  if (nearFade(vWorld, 4.5, 11.0)) discard;
  int k = int(vKind + 0.5);
  if (k <= 1 && vWorld.z > playerPos.z - 0.4 && distance(vWorld.xz, playerPos.xz) < 3.4 && playerFade(vWorld)) discard;
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vNormal);
  if (dot(n, view) < 0.0) n = -n;
  vec2 uv = vUv;
  vec3 wp = vWorld;
  vec3 albedo = vTint;
  float wrap = 0.25, sss = 0.0, ao = 1.0, spec = 0.0, emissive = 0.0;
  if (k == 0) {
    // leaf mass: clumps of lighter and darker leaves, sunlit tops, translucent edges
    float clump = vnoise(wp.xz * 0.8 + wp.y * 1.3);
    float leaf = vnoise(wp.xy * 5.5 + wp.zz * 2.2) * 0.55 + vnoise(wp.zy * 8.0 + wp.xx * 3.0) * 0.45;
    float dap = smoothstep(0.62, 0.86, vnoise(wp.xz * 2.6 + wp.y * 2.2));
    albedo = vTint * (0.62 + 0.62 * leaf) * (0.82 + 0.34 * clump) + vTint * vec3(0.55, 0.5, 0.1) * dap * 0.55;
    wrap = 0.6; sss = 0.7;
    ao = 0.55 + 0.45 * clamp(n.y * 0.5 + 0.55, 0.0, 1.0);
  } else if (k == 1) {
    float streak = vnoise(vec2(uv.x * 7.0, uv.y * 0.9));
    float ring = vnoise(vec2(uv.x * 22.0, uv.y * 3.0));
    albedo = vTint * (0.62 + 0.55 * streak) * (0.88 + 0.2 * ring);
    wrap = 0.3;
  } else if (k == 2) {
    float row = floor(uv.y / 0.24);
    float f = fract(uv.y / 0.24);
    float tone = 0.8 + 0.35 * hash21(vec2(row, 3.0));
    float grain = vnoise(vec2(uv.x * 1.3 + row * 4.0, uv.y * 24.0));
    float seam = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.94, 1.0, f));
    albedo = vTint * tone * (0.82 + 0.3 * grain) * mix(0.55, 1.0, seam);
  } else if (k == 3) {
    float stain = vnoise(uv * 2.2 + 3.0) * 0.5 + vnoise(uv * 9.0) * 0.5;
    albedo = vTint * (0.86 + 0.22 * stain);
    wrap = 0.3;
  } else if (k == 4) {
    float row = uv.y / 0.5;
    float r = floor(row);
    float col = uv.x / 0.62 + 0.5 * mod(r, 2.0);
    vec2 cellId = vec2(floor(col), r);
    float tone = 0.78 + 0.4 * hash21(cellId);
    float f = fract(row);
    float edge = smoothstep(0.0, 0.2, f) ;
    float side = smoothstep(0.0, 0.05, fract(col)) * (1.0 - smoothstep(0.95, 1.0, fract(col)));
    float moss = smoothstep(0.62, 0.85, vnoise(uv * 1.7 + 5.0));
    albedo = mix(vTint * tone, vec3(0.25, 0.36, 0.14), moss * 0.35) * mix(0.55, 1.0, edge) * mix(0.8, 1.0, side);
    wrap = 0.2;
  } else if (k == 5) {
    float b = vnoise(wp.xz * 1.6 + wp.y * 1.1) * 0.6 + vnoise(wp.xz * 6.0 + wp.y * 4.0) * 0.4;
    albedo = vTint * (0.68 + 0.5 * b);
    wrap = 0.15;
  } else if (k == 6) {
    float plank = floor(wp.z * 1.85);
    float f = fract(wp.z * 1.85);
    float tone = 0.78 + 0.38 * hash21(vec2(plank, 7.0));
    float grain = vnoise(vec2(wp.x * 6.0 + plank * 5.0, wp.z * 3.0));
    albedo = vTint * tone * (0.8 + 0.3 * grain) * mix(0.45, 1.0, smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.92, 1.0, f)));
  } else if (k == 7) {
    vec3 refl = reflect(-view, n);
    albedo = mix(vec3(0.04, 0.09, 0.12), vec3(0.3, 0.45, 0.55), clamp(refl.y * 0.5 + 0.4, 0.0, 1.0));
    emissive = 0.22 * (0.7 + 0.3 * sin(wp.x * 3.0));
    spec = 0.5;
  } else if (k == 8) {
    albedo = vTint;
    spec = 1.0;
    wrap = 0.1;
  } else if (k == 9) {
    float weave = 0.9 + 0.1 * sin(uv.x * 90.0) * sin(uv.y * 90.0);
    float fold = vnoise(uv * 3.0);
    albedo = vTint * weave * (0.88 + 0.18 * fold);
    wrap = 0.7; sss = 0.8;
  } else if (k == 10) {
    albedo = vTint;
    wrap = 0.5; sss = 0.3;
  }
  // WW47-M2 (GU47 only): triplanar brush grain on the painted props (not the glass, k 7, or the brass, k 8), strokes
  // stretched along one axis of each plane so plaster, wood and stone read as gouache rather than flat fills
  if (paintAmt > 0.0 && k != 7 && k != 8) {
    vec3 bw = pow(abs(n), vec3(4.0));
    bw /= bw.x + bw.y + bw.z + 1e-4;
    float gx = vnoise(vec2(wp.z * 9.0, wp.y * 2.2));
    float gy = vnoise(vec2(dot(wp.xz, WIND_DIR) * 2.2, dot(wp.xz, vec2(-WIND_DIR.y, WIND_DIR.x)) * 9.0));
    float gz = vnoise(vec2(wp.x * 9.0, wp.y * 2.2));
    float grain = gx * bw.x + gy * bw.y + gz * bw.z;
    albedo *= mix(1.0, 0.88 + 0.24 * grain, paintAmt);
  }
  vec3 lit = lightSurface(albedo, n, ao, wrap, sss, view, wp);
  if (spec > 0.0) {
    vec3 h = normalize(sunDir + view);
    lit += sunCol * pow(max(dot(n, h), 0.0), 36.0) * spec * 0.9;
  }
  lit += albedo * vec3(1.0, 0.75, 0.4) * emissive;
  // sky-coloured rim keeps silhouettes from going muddy against the haze
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  lit += skyCol * albedo * rim * 0.1;
  outColor = vec4(applyFog(lit, wp, 1.0), 1.0);
}`;

export const TRAVELLER_VERTEX = /* glsl */ `
attribute vec3 tint;
attribute float kind;
attribute float limb;
out vec3 vTint;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
out float vKind;

vec3 rotX(vec3 p, vec3 pivot, float a) {
  vec3 q = p - pivot;
  float c = cos(a), s = sin(a);
  return pivot + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}
vec3 rotXn(vec3 n, float a) {
  float c = cos(a), s = sin(a);
  return vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
}

void main() {
  vTint = tint;
  vUv = uv;
  vKind = kind;
  vec3 p = position;
  vec3 n = normal;
  int l = int(limb + 0.5);
  float sw = sin(gait) * 0.8 * walkAmt;
  float a = 0.0;
  vec3 pivot = vec3(0.0);
  if (l == 1) { pivot = vec3(-0.12, 0.86, 0.0); a = sw * (1.0 - hopAmt) - hopAmt * 0.7; }
  else if (l == 2) { pivot = vec3(0.12, 0.86, 0.0); a = -sw * (1.0 - hopAmt) - hopAmt * 0.25; }
  else if (l == 3) { pivot = vec3(-0.3, 1.42, 0.0); a = -sw * 0.95 - hopAmt * 2.4; }
  else if (l == 4) { pivot = vec3(0.3, 1.42, 0.0); a = sw * 0.95 - hopAmt * 2.4; }
  if (l >= 1 && l <= 4) { p = rotX(p, pivot, a); n = rotXn(n, a); }
  if (l == 5) {
    float flap = (0.05 + 0.14 * walkAmt + 0.05 * hopAmt) * (1.55 - p.y) * (0.6 + 0.4 * sin(windTime * 4.0 + p.y * 3.0 + gait));
    p.z -= flap + 0.04 * walkAmt;
  }
  p.y += abs(sin(gait)) * 0.07 * walkAmt;
  p.z += (p.y - 0.9) * 0.07 * walkAmt;
  p.y *= 1.0 + squash;
  p.xz *= 1.0 - squash * 0.5;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

/* ---------------------------------------------------------------- billboards and ribbons */

export const GLOW_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = uv;
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = normalize(cameraPosition - center);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  vec3 w = center + right * position.x + up * position.y;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export const GLOW_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float ang = atan(d.y, d.x);
  float pulse = 0.78 + 0.22 * sin(windTime * 2.2 + glowSeed);
  float core = exp(-r * r * 5.0);
  float rays = pow(0.5 + 0.5 * cos(ang * 6.0 + windTime * 0.35 + glowSeed), 3.0) * exp(-r * 3.2) * 0.55;
  float a = (core + rays) * (1.0 - smoothstep(0.85, 1.0, r)) * glowAmount * pulse;
  outColor = vec4(glowColor * a, a);
}`;

export const MOTE_VERTEX = /* glsl */ `
attribute vec3 tint;
out vec2 vUv;
out float vSeed;
out vec3 vWorld;
void main() {
  vUv = uv;
  vSeed = tint.x;
  float t = windTime * 0.33 + tint.x * 40.0;
  vec3 c = position + vec3(sin(t * 1.3) * 1.6 + sin(windTime * 0.07 + tint.x * 9.0) * 3.0, sin(t * 0.9) * 0.8, cos(t * 1.1) * 1.4);
  vec3 center = (modelMatrix * vec4(c, 1.0)).xyz;
  vec3 toCam = normalize(cameraPosition - center);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  vec2 q = (uv - 0.5) * tint.y;
  vec3 w = center + right * q.x + up * q.y;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export const MOTE_FRAGMENT = /* glsl */ `
in vec2 vUv;
in float vSeed;
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float tw = 0.55 + 0.45 * sin(windTime * (1.2 + vSeed * 2.0) + vSeed * 60.0);
  float a = pow(1.0 - clamp(r, 0.0, 1.0), 2.2) * tw * 0.8;
  float fade = 1.0 - clamp(distance(cameraPosition, vWorld) / 90.0, 0.0, 1.0);
  outColor = vec4(vec3(1.0, 0.93, 0.62) * a * fade, a * fade);
}`;

export const HAZE_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const HAZE_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  vec2 p = vec2(vUv.x * 15.0 - windTime * 0.035 + hazePhase, vUv.y * 3.0 + hazePhase);
  float n = 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.1 + windTime * 0.013);
  float edge = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
  float height = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.40, 1.0, vUv.y));
  float a = edge * height * (0.3 + n * 0.7) * hazeOpacity;
  vec3 col = mix(fogCol * 1.35, vec3(1.0, 0.96, 0.82), 0.35);
  outColor = vec4(col, a);
}`;

export const SHAFT_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  float across = 1.0 - smoothstep(0.0, 1.0, abs(vUv.x - 0.5) * 2.0);
  across *= across;
  float along = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float flicker = 0.7 + 0.3 * vnoise(vec2(vUv.x * 6.0 + shaftSeed, windTime * 0.12 + shaftSeed));
  float a = across * along * flicker * shaftOpacity;
  outColor = vec4(sunCol * 1.0 + vec3(0.1), a);
}`;

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
  float r = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.15, 1.0, r)) * shadowOpacity;
  outColor = vec4(0.06, 0.1, 0.03, a);
}`;
