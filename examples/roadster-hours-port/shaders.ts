/**
 * GLSL 300 es for the port's `material.custom` surfaces: a procedural sky dome, a footprint-filtered ocean, lit asphalt
 * with filtered markings, rock/terrain and a lit solid for rails, gates and props. They share one atmosphere (sun, sky
 * gradient, ambient, haze) so everything agrees with the engine-lit vehicles.
 * Uniform names avoid `time`/`pulse` (they lower to `u_time`, which the prelude already declares) and no function parameter
 * reuses a uniform name (the prelude then skips that uniform's `#define` alias).
 * Filtering: every high-frequency term (aggregate, waves, markings, strata) fades by the pixel footprint (`fwidth`) and
 * hands its energy to roughness, so nothing aliases into moire at grazing angles.
 */

export const ATMOS = /* glsl */ `
float gSunShadow = 1.0; // set per fragment from a3dSunShadowAuto (specs with receiveShadow: true); 1 elsewhere
float sq(float x) { return x * x; }
float rhHash(vec2 q) {
  uvec2 v = uvec2(ivec2(floor(q))) * uvec2(1597334673u, 3812015801u);
  uint h = (v.x ^ v.y) * 1597334673u;
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13;
  return float(h) * (1.0 / 4294967296.0);
}
float rhNoise(vec2 q) {
  vec2 i = floor(q); vec2 f = fract(q); f = f * f * (3.0 - 2.0 * f);
  float a = rhHash(i), b = rhHash(i + vec2(1.0, 0.0)), c = rhHash(i + vec2(0.0, 1.0)), d = rhHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float rhFbm(vec2 q) {
  float amp = 0.5; float sum = 0.0;
  for (int i = 0; i < 4; i++) { sum += amp * rhNoise(q); q = q * 2.03 + vec2(17.1, 9.2); amp *= 0.5; }
  return sum;
}
vec3 hazeAt(vec3 v) {
  float sa = max(dot(v, sunDir), 0.0);
  return horizonColor + sunColor * (pow(clamp(sa, 0.0, 1.0), 4.0) * 0.07 + pow(clamp(sa, 0.0, 1.0), 24.0) * 0.14) * (1.0 - nightAmt);
}
vec3 skyAt(vec3 v) {
  float up = clamp(v.y, 0.0, 1.0);
  vec3 col = mix(horizonColor, zenithColor, pow(clamp(up, 0.0, 1.0), 0.36));
  float sa = max(dot(v, sunDir), 0.0);
  col += sunColor * (pow(clamp(sa, 0.0, 1.0), 4.0) * 0.07 + pow(clamp(sa, 0.0, 1.0), 24.0) * 0.14 + pow(clamp(sa, 0.0, 1.0), 220.0) * 0.9) * (1.0 - nightAmt * 0.6);
  col += smoothstep(0.99955, 0.99985, sa) * sunColor * 3.0;
  col += horizonColor * exp(-up * 14.0) * 0.45;
  return col;
}
vec3 fogIt(vec3 base, vec3 wp) {
  vec3 dv = wp - cameraPosition;
  float d = length(dv);
  float f = clamp((d - fogNear) / (fogFar - fogNear), 0.0, 1.0);
  return mix(base, hazeAt(dv / max(d, 0.001)), f * f);
}
vec3 finish(vec3 c) {
  if (any(isnan(c)) || any(isinf(c))) return vec3(0.0);
  return min(c, vec3(48.0));
}
float ggx(float nh, float a) {
  float a2 = a * a;
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * max(dd * dd, 1e-8));
}
vec3 lightSurface(vec3 albedo, vec3 N, vec3 V, float rough, float metal, vec3 emis) {
  vec3 L = sunDir;
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.001);
  vec3 H = normalize(L + V);
  float a = max(rough * rough, 0.03);
  float F = 0.04 + 0.96 * pow(clamp(1.0 - ndv, 0.0, 1.0), 5.0);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 fres = f0 + (vec3(1.0) - f0) * pow(clamp(1.0 - dot(H, V), 0.0, 1.0), 5.0);
  vec3 spec = sunColor * fres * ggx(max(dot(N, H), 0.0), a) * 0.25 * ndl * gSunShadow;
  vec3 amb = mix(ambGround, ambSky, N.y * 0.5 + 0.5);
  vec3 bounce = (ambSky * 0.5 + sunColor * 0.09) * max(dot(N, normalize(vec3(-sunDir.x, 0.15, -sunDir.z))), 0.0);
  vec3 diff = albedo * (1.0 - metal) * (amb + bounce + sunColor * ndl * gSunShadow);
  vec3 refl = skyAt(reflect(-V, N));
  float rf = F * (1.0 - 0.8 * rough) + metal * 0.5 * (1.0 - rough);
  return diff + spec + refl * rf * mix(vec3(1.0), albedo, metal) * (0.4 + 0.6 * ndl) + emis;
}
`;

export const ROAD_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const lineMask = /* glsl */ `
float lineMask(float x, float centre, float hw, float aa) {
  float m = 1.0 - smoothstep(hw - aa, hw + aa, abs(x - centre));
  return m * clamp(hw / max(aa, 1e-5), 0.0, 1.0);
}
`;

/**
 * GU47 RH47-10: packed CC0 detail map taps (R luminance detail, G/B NormalGL x/y; see art/detail.ts). The engine binds asset
 * textures with a clamp, un-mipmapped sampler, so each tap wraps with `fract` and fades out by its texel footprint: a scale
 * is gone before one pixel covers 2 texels, so the detail cannot alias into moire at distance. Returns (albedo, nx, ny) deltas.
 */
const detailChunk = /* glsl */ `
vec4 rhDetailTap(sampler2D tex, vec2 p, float tile) {
  vec2 uv = p / tile;
  float texels = length(fwidth(uv)) * 512.0;
  float w = 1.0 - smoothstep(0.75, 2.0, texels);
  return vec4(texture(tex, fract(uv)).rgb - 0.5, w);
}
vec3 rhDetail(sampler2D tex, vec2 p, vec2 tiles) {
  vec4 a = rhDetailTap(tex, p, tiles.x);
  vec4 b = rhDetailTap(tex, p, tiles.y);
  return a.xyz * a.w + b.xyz * (b.w * 0.6);
}
`;

/** uv.x = lateral position across the road (-1..1), uv.y = arc length in metres. */
export const ROAD_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${ATMOS}
${lineMask}
${detailChunk}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float lat = vUv.x;
  float arc = vUv.y;
  float aaL = fwidth(lat) * 1.4 + 1e-5;
  float aaS = fwidth(arc) * 1.4 + 1e-4;
  float foot = length(fwidth(vWorld.xz));
  float fade = 1.0 - smoothstep(0.3, 1.4, foot);

  float g1 = rhNoise(vWorld.xz * 16.0), g2 = rhNoise(vWorld.xz * 3.7 + 7.0), g3 = rhNoise(vWorld.xz * 0.42 + 3.0);
  float tone = (g1 - 0.5) * 0.4 * fade + (g2 - 0.5) * 0.28 * fade + (g3 - 0.5) * 0.2;
  vec3 albedo = asphalt * (1.0 + tone);
  vec3 dt = detailAmt > 0.0 ? rhDetail(roadDetail, vWorld.xz, detailTiles) * detailAmt : vec3(0.0);
  albedo *= 1.0 + dt.x * 0.9;
  float wheel = exp(-sq((abs(lat) - 0.25) / 0.08)) + exp(-sq((abs(lat) - 0.73) / 0.08));
  albedo *= 1.0 - wheel * 0.28;
  float rough = clamp(roadGloss + (g2 - 0.5) * 0.2 * fade - wheel * 0.22 + (1.0 - fade) * 0.18 - dt.x * 0.3, 0.28, 0.95);

  float period = 15.0;
  float ph = fract(arc / period);
  float aaP = aaS / period;
  float dashOn = smoothstep(0.0, aaP + 1e-4, ph) * (1.0 - smoothstep(0.52, 0.52 + aaP + 1e-4, ph));
  float lanes = max(lineMask(lat, 0.0, 0.0075, aaL), max(lineMask(lat, 0.48, 0.0075, aaL), lineMask(lat, -0.48, 0.0075, aaL)));
  float paint = clamp(lanes * dashOn, 0.0, 1.0) * (0.75 + 0.25 * g1 * fade + 0.25 * (1.0 - fade));
  albedo = mix(albedo, lineColor, paint);
  rough = mix(rough, 0.5, paint);

  float curb = smoothstep(0.952 - aaL, 0.952 + aaL, abs(lat));
  float rumble = step(0.5, fract(arc / 3.0));
  albedo = mix(albedo, mix(vec3(0.34, 0.33, 0.31), vec3(0.5, 0.18, 0.14), rumble * 0.6), curb);
  rough = mix(rough, 0.85, curb);
  float neon = max(lineMask(lat, 0.915, 0.021, aaL), lineMask(lat, -0.915, 0.021, aaL));
  albedo = mix(albedo, glowColor * 0.35, neon);
  vec3 emis = glowColor * neon * 2.6;

  vec3 N = normalize(normalize(vNormal) + vec3(dt.y, 0.0, -dt.z) * 1.2 * (1.0 - paint) * (1.0 - curb));
  vec2 dl = vWorld.xz - carPos.xz;
  float along = dot(dl, carDir);
  float side = dl.x * carDir.y - dl.y * carDir.x;
  float beam = smoothstep(0.5, 4.0, along) * exp(-along / 44.0) * exp(-sq(side / (1.5 + along * 0.2))) * beamAmt;
  float tail = step(along, 0.0) * exp(along / 7.0) * exp(-sq(side / 2.2)) * beamAmt * 0.25;
  emis += albedo * vec3(1.0, 0.92, 0.75) * beam * 2.6 + vec3(1.0, 0.1, 0.05) * tail * 0.5;

  gSunShadow = a3dSunShadowAuto(vWorld, N);
  vec3 lit = lightSurface(albedo, N, V, rough, 0.0, emis);
  outColor = vec4(finish(fogIt(lit, vWorld)), 1.0);
}`;

export const WATER_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const WATER_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${ATMOS}
void main() {
  vec2 p = vWorld.xz;
  vec3 dv = cameraPosition - vWorld;
  float dist = length(dv);
  vec3 V = dv / max(dist, 0.001);
  float foot = length(fwidth(p)) + 1e-4;
  vec2 g = vec2(0.0);
  float lost = 0.0;
  float crest = 0.0;
  vec2 pw = p + 7.0 * vec2(sin(p.y * 0.021 + u_time * 0.05), cos(p.x * 0.017 - u_time * 0.04));
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float wl = 170.0 / pow(1.8, fi);
    float ang = 0.35 + fi * 2.399;
    vec2 dir = vec2(cos(ang), sin(ang));
    float k = 6.2831853 / wl;
    float w = sqrt(9.8 * k) * 0.55;
    float steep = (0.018 + 0.0065 * fi) * 6.2831853 * 0.55;
    float vis = clamp(wl / (foot * 5.0) - 0.4, 0.0, 1.0);
    float c = cos(k * dot(dir, pw) + w * u_time + fi * 2.1);
    g += dir * (steep * c) * vis;
    lost += (1.0 - vis) * 0.5 * steep * steep;
    crest += c * vis * (1.0 / 7.0);
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float ndv = max(dot(N, V), 0.0);
  float F = (0.02 + 0.98 * pow(clamp(1.0 - ndv, 0.0, 1.0), 5.0)) * 0.9;
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.005;
  R = normalize(R);
  vec3 reflected = skyAt(R);

  float alpha = clamp(sqrt(0.0025 + lost * 2.0 + sq(foot / max(dist, 1.0)) * 3.0), 0.07, 0.6);
  vec3 H = normalize(sunDir + V);
  float glitter = ggx(max(dot(N, H), 0.0), alpha) * F * 0.25 * max(sunDir.y + 0.15, 0.0);
  vec3 sunSpec = sunColor * min(glitter, 30.0);

  float depthMix = clamp(0.5 + crest * 1.4, 0.0, 1.0);
  // GU47 RH47-06 depth colour: slow shoals of shallow teal over the deep body (whitecaps 0 keeps today's water)
  float shoal = smoothstep(0.45, 0.8, rhFbm(p * 0.0032 + 3.7)) * min(whitecaps * 2.0, 1.0);
  vec3 body = mix(deepWater, shallowWater, clamp(depthMix * 0.6 + shoal * 0.45, 0.0, 1.0));
  float sss = pow(clamp(dot(-V, sunDir), 0.0, 1.0), 3.0) * smoothstep(-0.2, 0.9, crest) * 0.45;
  vec3 lit = body * (ambSky * 1.5 + sunColor * 0.22 * max(sunDir.y, 0.0)) + shallowWater * sunColor * sss * 0.3;
  // GU47 RH47-06 sun glitter path: a broad lobe toward the sun's azimuth on top of the sharp highlight
  vec3 Rg = reflect(-V, N);
  float path = pow(max(dot(Rg, sunDir), 0.0), 48.0) * min(whitecaps * 1.5, 1.0) * max(sunDir.y + 0.1, 0.0);
  sunSpec += sunColor * path * 0.6;
  vec3 col = mix(lit, reflected, clamp(F, 0.0, 1.0)) + sunSpec;
  // GU47 RH47-06 wind whitecaps: foam caps on the crests, streaked along the wind, faded by the pixel footprint
  if (whitecaps > 0.0) {
    vec2 wdir = normalize(windVec + vec2(1e-4, 0.0));
    vec2 fq = vec2(dot(p, wdir) * 0.05, dot(p, vec2(-wdir.y, wdir.x)) * 0.16) + windVec * u_time * 0.02;
    float caps = smoothstep(0.62, 0.86, rhFbm(fq) + crest * 0.55);
    caps *= clamp(9.0 / (foot * 40.0 + 1.0), 0.15, 1.0);
    vec3 foamLit = vec3(0.92, 0.93, 0.9) * (ambSky * 1.6 + sunColor * 0.32 * max(sunDir.y, 0.0) + 0.04);
    col = mix(col, foamLit, caps * whitecaps * 0.85);
  }
  outColor = vec4(finish(fogIt(col, vWorld)), 1.0);
}`;

/**
 * GU47 RH47-06 (Halo): the city carpet under the skyway, drawn on the ocean plane in place of the dark sea. Blocks of
 * mercury-white and sea-glass lit roofs on a slate street grid, streetlight lines and sparse blinking red beacons; no amber
 * and no neon. Every term fades by the pixel footprint so the far carpet resolves to its average glow without moire.
 */
export const CITY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${ATMOS}
void main() {
  vec2 p = vWorld.xz;
  float foot = length(fwidth(p)) + 1e-4;
  vec2 cell = p / 64.0;
  vec2 id = floor(cell);
  vec2 f = fract(cell);
  float h = rhHash(id + 11.0);
  float h2 = rhHash(id + 37.0);
  // streets: 8 m of every 64 m block, with a streetlight line down the middle
  vec2 edge = min(f, 1.0 - f) * 64.0;
  float street = 1.0 - smoothstep(3.5, 4.5 + foot, min(edge.x, edge.y));
  float lamp = (1.0 - smoothstep(0.0, 0.6 + foot, abs(min(edge.x, edge.y) - 0.0))) * street;
  // roofs: windows as a fine grid, faded to their mean as the footprint grows
  vec2 w = fract(p / 3.0);
  float win = step(0.35, w.x) * step(0.35, w.y) * step(0.45, rhHash(floor(p / 3.0)));
  float fine = clamp(1.0 - foot / 3.0, 0.0, 1.0);
  float lit = mix(0.28, win, fine);
  vec3 mercury = vec3(0.86, 0.9, 0.92);
  vec3 seaGlass = vec3(0.55, 0.82, 0.77);
  vec3 roofTone = mix(mercury, seaGlass, step(0.55, h));
  vec3 roof = mix(vec3(0.03, 0.04, 0.06), roofTone * (0.55 + 0.9 * h2), lit * step(0.18, h));
  vec3 col = mix(roof, vec3(0.02, 0.025, 0.035), street) + mercury * lamp * 1.6;
  // red beacons on the tallest roofs, blinking out of phase
  float beacon = step(0.9, h2) * (1.0 - smoothstep(0.0, 1.6 + foot, length((f - 0.5) * 64.0)));
  float blink = step(0.5, fract(u_time * 0.5 + h * 7.0));
  col += vec3(0.78, 0.16, 0.1) * beacon * blink * 5.0;
  col *= cityGain;
  outColor = vec4(finish(fogIt(col, vWorld)), 1.0);
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${ATMOS}
void main() {
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 col = skyAt(v);
  if (mountainAmt > 0.0 && v.y > -0.02) {
    float az = atan(v.x, v.z);
    float ridge = 0.018 + 0.05 * rhFbm(vec2(az * 1.9, 3.0)) + 0.025 * rhFbm(vec2(az * 6.0, 9.0));
    float edge = smoothstep(ridge + 0.002, ridge - 0.002, v.y);
    vec3 rock = mix(horizonColor, zenithColor * 0.7, 0.45) * mix(0.8, 1.15, rhFbm(vec2(az * 9.0, v.y * 40.0)));
    col = mix(col, rock, edge * mountainAmt * (1.0 - smoothstep(0.0, 0.12, v.y - ridge) ));
  }
  // GU47 RH47-05: low sea-side band (salt haze by day, city glow at blue hour); bandSide 1 = sea side only, 0 = all round.
  if (bandAmt > 0.0) {
    float side = mix(1.0, smoothstep(-0.35, 0.75, v.x * seaSign), bandSide);
    float low = exp(-max(v.y, 0.0) * 9.0) * smoothstep(-0.12, 0.0, v.y);
    col = mix(col, bandColor, clamp(low * side * bandAmt, 0.0, 1.0));
    // sun-side glow: a broad warm lift along the horizon under the sun's azimuth
    vec2 sh = normalize(sunDir.xz + vec2(1e-4));
    float az = max(dot(normalize(v.xz + vec2(1e-4)), sh), 0.0);
    col += sunColor * pow(az, 6.0) * exp(-max(v.y, 0.0) * 5.0) * 0.05 * bandAmt * (1.0 - nightAmt);
  }
  // GU47 RH47-05: high cirrus streaks stretched along the wind (second cloud layer)
  if (v.y > 0.01 && cloudHigh > 0.0) {
    vec2 wdir = normalize(windVec + vec2(1e-4, 0.0));
    vec2 qh = v.xz / (v.y + 0.3) * 0.9 + windVec * u_time * 0.0009;
    vec2 st = vec2(dot(qh, wdir) * 0.35, dot(qh, vec2(-wdir.y, wdir.x)) * 2.4);
    float nh = rhFbm(st * 1.6);
    float coverH = smoothstep(0.5, 0.78, nh) * smoothstep(0.02, 0.25, v.y) * cloudHigh;
    float sah = max(dot(v, sunDir), 0.0);
    vec3 cirrus = mix(horizonColor, vec3(1.0), 0.35) + sunColor * 0.12 * pow(sah, 3.0);
    col = mix(col, cirrus * mix(1.0, 0.35, nightAmt), coverH * 0.7);
  }
  if (v.y > 0.005 && cloudAmt > 0.0) {
    vec2 q = v.xz / (v.y + 0.14) * 1.15 + vec2(u_time * 0.006, u_time * 0.002) + windVec * u_time * 0.0012;
    float n = rhFbm(q * 1.2);
    float cover = smoothstep(0.46, 0.8, n) * smoothstep(0.005, 0.14, v.y) * cloudAmt;
    float sa = max(dot(v, sunDir), 0.0);
    float edge = smoothstep(0.46, 0.62, n) * (1.0 - smoothstep(0.62, 0.85, n));
    vec3 belly = mix(zenithColor * 0.55 + horizonColor * 0.55, horizonColor * 0.9, 0.4);
    vec3 top = horizonColor * 0.9 + sunColor * 0.35 * (0.25 + pow(clamp(sa, 0.0, 1.0), 2.0));
    vec3 cloud = mix(belly, top, clamp(0.35 + edge * 0.8 + pow(clamp(sa, 0.0, 1.0), 3.0), 0.0, 1.0));
    col = mix(col, cloud, cover * (1.0 - nightAmt));
  }
  if (nightAmt > 0.0 && v.y > 0.0) {
    vec2 sq = vec2(atan(v.x, v.z) * 140.0, v.y * 220.0);
    float star = step(0.9965, rhHash(floor(sq))) * smoothstep(0.02, 0.3, v.y);
    col += vec3(0.8, 0.85, 1.0) * star * nightAmt * (0.6 + 0.8 * rhHash(floor(sq) + 3.0));
  }
  outColor = vec4(finish(col), 1.0);
}`;

export const TERRAIN_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const TERRAIN_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${ATMOS}
${detailChunk}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;
  float dAlb = 0.0;
  if (detailAmt > 0.0) {
    vec3 tw = pow(abs(N), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
    vec3 dx = rhDetail(rockDetail, vWorld.zy, detailTiles), dy = rhDetail(rockDetail, vWorld.xz, detailTiles), dz = rhDetail(rockDetail, vWorld.xy, detailTiles);
    dAlb = (dx.x * tw.x + dy.x * tw.y + dz.x * tw.z) * detailAmt;
    N = normalize(N + (vec3(0.0, dx.z, dx.y) * tw.x + vec3(dy.y, 0.0, -dy.z) * tw.y + vec3(dz.y, dz.z, 0.0) * tw.z) * 1.4 * detailAmt);
  }
  float foot = length(fwidth(vWorld)) + 1e-4;
  float fade = 1.0 - smoothstep(0.5, 6.0, foot);
  float blotch = rhFbm(vWorld.xz * 0.03 + vWorld.y * 0.02);
  float warp = rhFbm(vec2(vWorld.x * 0.02 + vWorld.z * 0.017, vWorld.y * 0.05));
  float strata = 0.5 + 0.5 * sin(vWorld.y * 0.42 + warp * 9.0 + blotch * 4.0);
  float bands = smoothstep(0.3, 0.7, strata);
  vec3 rock = mix(rockA, rockB, clamp(bands * 0.5 + blotch * 0.55 - 0.08, 0.0, 1.0));
  float fine = rhNoise(vWorld.xz * 1.3 + vWorld.y * 0.9);
  float fine2 = rhNoise(vec2(vWorld.x + vWorld.z, vWorld.y) * 2.6);
  rock *= 1.0 + ((fine - 0.5) * 0.32 + (fine2 - 0.5) * 0.18) * fade;
  float flat_ = smoothstep(0.55, 0.88, N.y);
  float high = smoothstep(3.0, 9.0, vWorld.y);
  vec3 turf = grass * (0.75 + 0.5 * blotch);
  vec3 albedo = mix(rock, turf, flat_ * high * 0.85);
  albedo = mix(albedo, sand, flat_ * (1.0 - high) * 0.9);
  albedo *= 1.0 + dAlb * 0.9;
  float ao = mix(0.62, 1.0, smoothstep(-2.0, 14.0, vWorld.y)) * (0.8 + 0.2 * blotch);
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  vec3 lit = lightSurface(albedo * ao, N, V, 0.9, 0.0, vec3(0.0));
  outColor = vec4(finish(fogIt(lit, vWorld)), 1.0);
}`;

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
${ATMOS}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;
  float flicker = glowAmount * (0.85 + 0.15 * sin(u_time * 4.0 + vWorld.z * 0.05));
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  vec3 lit = lightSurface(baseColor, N, V, surfaceRough, surfaceMetal, glowColor * flicker);
  outColor = vec4(finish(fogIt(lit, vWorld)), 1.0);
}`;

export const TOWER_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${ATMOS}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;
  float foot = length(fwidth(vWorld)) + 1e-4;
  float fade = 1.0 - smoothstep(0.8, 6.0, foot);
  vec2 uvw = abs(N.x) > abs(N.z) ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
  vec2 cellSize = vec2(3.2, 3.6);
  vec2 cell = floor(uvw / cellSize);
  vec2 f = fract(uvw / cellSize);
  float on = step(0.62, rhHash(cell + 3.0)) * (0.55 + 0.45 * rhHash(cell + 11.0));
  float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.2, f.y) * step(f.y, 0.8);
  vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.55, 0.78, 1.0), rhHash(cell + 7.0));
  float facade = step(abs(N.y), 0.5);
  vec3 sharp = warm * win * on * 1.25 * facade;
  vec3 avg = warm * 0.5 * 0.38 * 0.6 * 1.25 * facade;
  vec3 emis = mix(avg, sharp, fade);
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  vec3 lit = lightSurface(vec3(0.035, 0.042, 0.07), N, V, 0.6, 0.25, emis);
  outColor = vec4(finish(fogIt(lit, vWorld)), 1.0);
}`;


/** Additive headlight cone: soft silhouette from the facing term, fading along the beam (uv.y = 0 at the lamp, 1 at the far end). */
export const BEAM_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const BEAM_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = pow(clamp(abs(dot(normalize(vNormal), V)), 0.0, 1.0), 1.5);
  float along = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.35) * smoothstep(0.0, 0.04, vUv.y);
  float a = facing * along * beamGain;
  outColor = vec4(beamColor * a, a);
}`;


/** Kicker / shortcut deck: dark steel with forward-pointing hazard chevrons. uv.x = lateral (-1..1), uv.y = arc length in metres. */
/**
 * GU47 RH47-03: soft contact shadow under the roadster (a plane on the road under the car, alpha-blended). `blobFade` is
 * 1 on the ground and falls to 0 with ride height, so the car reads as planted between the cascade texels and lifts off
 * the road visibly on a jump.
 */
export const BLOB_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec2 q = (vUv - 0.5) * 2.0;
  float r = length(q * vec2(1.0, 0.62));
  float a = (1.0 - smoothstep(0.35, 1.0, r)) * blobFade * blobStrength;
  outColor = vec4(0.0, 0.0, 0.0, clamp(a, 0.0, 0.9));
}`;

export const RAMP_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${ATMOS}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;
  float aa = fwidth(vUv.y) * 0.6 + 1e-4;
  float phase = vUv.y / 2.4 + abs(vUv.x) * 1.15;
  float band = smoothstep(0.46 - aa, 0.46 + aa, fract(phase)) - smoothstep(0.96 - aa, 0.96 + aa, fract(phase));
  float fadeBand = 1.0 - smoothstep(0.4, 1.6, length(fwidth(vWorld.xz)));
  vec3 steel = vec3(0.07, 0.075, 0.085) * (0.9 + 0.2 * rhNoise(vWorld.xz * 6.0));
  vec3 yellow = vec3(0.85, 0.55, 0.06);
  float edge = smoothstep(0.9, 0.97, abs(vUv.x));
  vec3 albedo = mix(steel, yellow, band * mix(0.35, 1.0, fadeBand));
  albedo = mix(albedo, vec3(0.9, 0.9, 0.85), edge);
  vec3 emis = yellow * band * 0.1 + glowColor * edge * 0.2;
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  vec3 lit = lightSurface(albedo, N, V, 0.5, 0.15, emis);
  outColor = vec4(finish(fogIt(lit, vWorld)), 1.0);
}`;


export const TOWN_VERTEX = /* glsl */ `
out vec2 vUv;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Plaster cubes with recessed windows; uv.x integer part is the building id (tint), uv fraction unused. */
export const TOWN_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${ATMOS}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;
  float id = floor(vUv.x);
  vec3 plaster = mix(vec3(0.74, 0.7, 0.62), vec3(0.9, 0.88, 0.82), rhHash(vec2(id, 1.0)));
  plaster = mix(plaster, vec3(0.64, 0.4, 0.3), step(0.82, rhHash(vec2(id, 2.0))) * 0.85);
  float facade = step(abs(N.y), 0.5);
  float foot = length(fwidth(vWorld)) + 1e-4;
  float fade = 1.0 - smoothstep(0.8, 6.0, foot);
  vec2 uvw = abs(N.x) > abs(N.z) ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
  vec2 f = fract(uvw / vec2(3.0, 3.2));
  float win = step(0.22, f.x) * step(f.x, 0.6) * step(0.3, f.y) * step(f.y, 0.76) * facade;
  float shutter = step(0.6, f.x) * step(f.x, 0.74) * step(0.3, f.y) * step(f.y, 0.76) * facade;
  vec3 albedo = plaster;
  albedo = mix(albedo, vec3(0.05, 0.08, 0.11), win * fade);
  albedo = mix(albedo, vec3(0.2, 0.34, 0.4), shutter * fade * 0.7);
  albedo = mix(albedo, vec3(0.52, 0.31, 0.24), (1.0 - facade) * 0.75);
  vec3 emis = vec3(1.0, 0.75, 0.4) * win * fade * nightAmt * 1.2;
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  vec3 lit = lightSurface(albedo, N, V, 0.82, 0.0, emis);
  outColor = vec4(finish(fogIt(lit, vWorld)), 1.0);
}`;


/**
 * GPU point-sprite plume (dust, smoke, sparks) behind the car with no per-particle CPU work. `position` only carries each
 * particle's random seed (spread over +-10 km so the geometry is never frustum-culled); the world position is rebuilt from the
 * emitter uniforms: a puff of age `a` sits where the car was `a` seconds ago (along `ptBack`), then spreads and rises.
 */
export const PLUME_VERTEX = /* glsl */ `
out float vAlpha;
out float vHeat;
float ph1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
void main() {
  vec3 sd = position / 20000.0 + 0.5;
  float life = mix(ptLife.x, ptLife.y, sd.x);
  float rate = (0.75 + 0.5 * sd.y) / life;
  float cyc = floor(u_time * rate + sd.z * 7.0);
  float ph = fract(u_time * rate + sd.z * 7.0);
  float age = ph * life;
  vec3 r = vec3(ph1(sd.x * 13.0 + cyc * 1.31), ph1(sd.y * 17.0 + cyc * 2.17), ph1(sd.z * 19.0 + cyc * 3.07));
  vec3 side = vec3(ptBack.z, 0.0, -ptBack.x);
  vec3 wp = ptPos
    + ptBack * (ptSpeed * age * ptTrail + (r.y - 0.2) * 1.2)
    + side * ((r.x - 0.5) * (ptWidth + age * ptSpread * 2.0))
    + vec3(0.0, age * ptLift + r.z * 0.35, 0.0)
    + vec3(ph1(r.x * 5.0) - 0.5, 0.0, ph1(r.z * 7.0) - 0.5) * age * ptSpread;
  vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  gl_Position = clip;
  float size = ptSize.x + (ptSize.y - ptSize.x) * ph;
  gl_PointSize = clamp(size * (0.7 + 0.6 * r.y) * projectionMatrix[1][1] * u_resolution.y * 0.5 / max(clip.w, 0.1), 1.0, 220.0);
  vAlpha = ptAmount * pow(clamp(1.0 - ph, 0.0, 1.0), 1.4) * smoothstep(0.0, 0.06, ph);
  vHeat = 1.0 - ph;
}`;

export const PLUME_FRAGMENT = /* glsl */ `
in float vAlpha;
in float vHeat;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float soft = (1.0 - d) * (1.0 - d);
  vec3 col = ptColor * (0.8 + 0.5 * vHeat * ptGlow);
  outColor = vec4(col, vAlpha * soft);
}`;
