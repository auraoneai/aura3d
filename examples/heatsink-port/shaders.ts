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
vec3 gWorld = vec3(0.0); // fragment world position, set next to gSun (IC-02 glow pools)
// GU47 IC-02: the 4 nearest pad / gate glow pools (poolPos column = xyz + radius, poolCol column = rgb + intensity).
// All-zero under ?look=original, so the term adds exactly 0 there.
vec3 glowPools(vec3 albedo, vec3 N) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 p = poolPos[i];
    vec4 c = poolCol[i];
    vec3 d = p.xyz - gWorld;
    float f = clamp(1.0 - length(d) / max(p.w, 1e-3), 0.0, 1.0);
    float facing = 0.35 + 0.65 * max(dot(N, normalize(d + vec3(0.0, 1e-3, 0.0))), 0.0);
    sum += c.rgb * (c.a * f * f * facing);
  }
  return sum * (albedo * 2.0 + 0.04);
}
// GU47 IC-01: twilight terms. bounceColor is the warm sunset light thrown back off the horizon on the sun side,
// topFill the violet sky above; both are zero and litScale is 0.26 under ?look=original (today's lit()).
vec3 lit(vec3 albedo, vec3 N) {
  vec3 hemi = mix(groundAmbient, skyAmbient, N.y * 0.5 + 0.5);
  float ndl = max(dot(N, normalize(sunDir)), 0.0);
  vec3 sunFlat = normalize(vec3(sunDir.x, 0.0, sunDir.z) + vec3(1e-4, 0.0, 0.0));
  float bounceW = max(dot(N, sunFlat), 0.0) * (1.0 - abs(N.y)) + 0.25 * max(-N.y, 0.0);
  float topW = max(N.y, 0.0);
  return albedo * (hemi + sunColor * ndl * gSun + bounceColor * bounceW + topFill * topW) * litScale + glowPools(albedo, N);
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
  vec3 asphalt = vec3(0.20, 0.23, 0.29) * (roadAlbedo / 0.23) * (0.62 + 0.55 * mottle) * (0.9 + 0.2 * grain);
  // cyan neon tracery: thin iso-lines of a slow noise field, strongest mid-road, glowing a little
  float field = fbm(vec2(u * 2.4 + 3.0, s * 0.028));
  float vein = 1.0 - smoothstep(0.0, 0.007, abs(field - 0.52));
  vein *= 1.0 - smoothstep(0.72, 0.96, abs(u));
  float field2 = fbm(vec2(u * 4.1 - 5.0, s * 0.045));
  vein += (1.0 - smoothstep(0.0, 0.005, abs(field2 - 0.47))) * 0.5 * (1.0 - smoothstep(0.6, 0.95, abs(u)));
  // long pale dashed lane lines near the edges, short centre dashes
  float edgeLine = (1.0 - smoothstep(0.0, 0.018, abs(abs(u) - 0.80))) * step(0.22, fract(s / 55.0));
  float dash = step(0.5, fract(s / 14.0)) * (1.0 - smoothstep(0.0, 0.025, abs(u)));
  // GU47 phase 3 (glass = 0 under ?look=original): the near centre dash read as a hard white slab next to the drone;
  // on the obsidian causeway the dashes get soft ends and a narrower soft core and fade out over the first 18 m
  float dashSoft = smoothstep(0.5, 0.56, fract(s / 14.0)) * (1.0 - smoothstep(0.94, 1.0, fract(s / 14.0))) * (1.0 - smoothstep(0.004, 0.018, abs(u)));
  dash = mix(dash, dashSoft * smoothstep(8.0, 26.0, length(vWorld - cameraPosition)), glass);
  float curb = smoothstep(0.93, 0.985, abs(u));
  vec3 neon = mix(vRoad, vec3(0.80, 0.95, 1.0), 0.7);
  gSun = a3dSunShadowAuto(vWorld, N);
  gWorld = vWorld;
  vec3 color = lit(asphalt, N) * 1.55;
  // GU47 IC-10 obsidian glass (glass = 0 under ?look=original): darker base, fresnel reflection of the twilight sky,
  // lit hex seams and an ion pulse running along the veins at the drone's speed
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  vec3 Rv = reflect(-V, N);
  vec3 mirror = mix(vec3(0.04, 0.12, 0.14), mix(vec3(0.36, 0.16, 0.30), vec3(0.12, 0.09, 0.30), smoothstep(0.0, 0.3, Rv.y)), smoothstep(-0.05, 0.08, Rv.y));
  vec2 hx = vec2(u * 9.0, s * 0.22);
  vec2 hc = abs(fract(vec2(hx.x + 0.5 * floor(hx.y), hx.y)) - 0.5);
  float seam = (1.0 - smoothstep(0.0, 0.035, 0.5 - max(hc.x, hc.y))) * (1.0 - smoothstep(0.7, 0.92, abs(u)));
  float pulse = 0.5 + 0.5 * sin(s * 0.09 - u_time * ionSpeed * 0.09);
  // GU47 phase 2: the reflection was mirror * (0.35 + 1.6 * fres) over color * 0.55, which turned the chase view of the
  // causeway into a flat lavender sheet (software WebGL2 frames); obsidian now stays dark with a dimmer grazing sky sheen
  // GU47 phase 3: darker obsidian (0.34 / 0.10 + 0.5 fres) and a warm grazing glint of the sunset band along the sun azimuth
  float glint = pow(max(dot(Rv, normalize(sunDir)), 0.0), 18.0);
  // round g19p3-r1 (panel 3/0/0 better, but a touch pastel at chase height where fres is high): about 60% of that sheen;
  // round g19p3-r3 lifts the near floor a little (r2 bottom corner cells 39.5 vs the IC-01 floor of 40)
  color = mix(color, color * 0.32 + mirror * (0.095 + 0.42 * fres) + vec3(0.9, 0.42, 0.12) * glint * 0.4, glass);
  color += vRoad * seam * 0.12 * seams;
  color += mix(vec3(0.10, 0.85, 0.80), vRoad, 0.25) * clamp(vein, 0.0, 1.0) * veinHdr * (0.6 + 0.6 * pulse) * glass; // cyan veins (were half the district colour: white squiggles)
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
  gWorld = vWorld;
  vec3 color = lit(mix(baseColor, hot * 0.8, heat * 0.55), N);
  // GU47 IC-21 arch light chase: a travelling bright band through the glow (chase = 0 keeps today's flicker)
  float chaseWave = 0.55 + 0.9 * pow(0.5 + 0.5 * sin(length(vWorld.xz) * 0.35 - u_time * 6.0), 3.0);
  color += glowColor * glow * (0.85 + 0.15 * sin(u_time * 5.0)) * mix(1.0, chaseWave, chase);
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
  // GU47 IC-05 (twilight = 0 under ?look=original): violet zenith, a magenta-to-amber band centred on the sun azimuth,
  // teal haze below the horizon
  vec3 sd = normalize(sunDir);
  float sunAz = cos(az - atan(sd.z, sd.x)) * 0.5 + 0.5;
  float bandW = pow(sunAz, 2.2) * (1.0 - smoothstep(0.0, 0.32, h)) * smoothstep(-0.06, 0.02, h);
  vec3 band = mix(bandLow, bandHigh, smoothstep(0.0, 0.2, h));
  // GU47 phase 3: the teal-to-violet turn was smoothstep(-0.02, 0.18, h); the teal-fogged cliffs then stood as pale ghosts on
  // violet (round g19p3-r1). The sky now stays teal behind the canyon walls and turns violet above them
  vec3 twSky = mix(vec3(0.05, 0.16, 0.18), mix(vec3(0.09, 0.07, 0.26), vec3(0.03, 0.02, 0.10), smoothstep(0.35, 0.95, h)), smoothstep(0.08, 0.42, h));
  // GU47 phase 3: the lavender lift was vec3(0.10, 0.08, 0.22) over |h| < 0.5 and washed the planet into the sky; it now
  // hugs the horizon (|h| < 0.22) so the violet upper sky stays deep and the planet and aurora read against it
  twSky += band * bandW * 0.95 + vec3(0.04, 0.06, 0.10) * (1.0 - smoothstep(0.0, 0.22, abs(h)));
  sky = mix(sky, twSky, twilight);
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
  vec3 aur = (vec3(0.60, 0.24, 0.85) * r1 * tex * 1.0 + vec3(0.12, 0.80, 0.68) * r2 * tex * 0.8 + vec3(0.2, 0.75, 0.65) * r1 * 0.14) * auroraGain;
  // ringed planet
  vec3 pd = normalize(planetDir);
  vec3 pr = normalize(cross(vec3(0.0, 1.0, 0.0), pd));
  vec3 pu = cross(pd, pr);
  vec2 pp = vec2(dot(d, pr), dot(d, pu)) / (0.17 * planetScale);
  float facing = step(0.0, dot(d, pd));
  float disk = (1.0 - smoothstep(0.96, 1.0, length(pp))) * facing;
  vec2 q = mat2(0.94, -0.34, 0.34, 0.94) * pp;
  float ringR = length(vec2(q.x, q.y * 3.4));
  float ring = (1.0 - smoothstep(0.0, 0.16, abs(ringR - 1.85))) * facing * (1.0 - disk * 0.6);
  // twilight: a lit crescent on the sun side of the disk and the planet's shadow across the far ring
  vec2 sunP = normalize(vec2(dot(sd, pr), dot(sd, pu)) + vec2(1e-4, 0.0));
  float crescent = mix(1.0, 0.25 + 1.4 * smoothstep(-0.2, 0.7, dot(pp, sunP)), twilight);
  float ringShadow = mix(1.0, 1.0 - 0.7 * step(q.y, 0.0) * (1.0 - smoothstep(0.7, 1.05, abs(q.x))), twilight);
  vec3 planet = mix(vec3(0.12, 0.08, 0.22), vec3(0.50, 0.34, 0.52), fbm(pp * 3.0 + 4.0)) * disk * 0.95 * crescent * (1.0 + 0.45 * twilight) + vec3(0.55, 0.50, 0.62) * ring * 0.55 * ringShadow * (1.0 + 0.35 * twilight);
  float moonMask = 1.0 - smoothstep(0.022, 0.026, acos(clamp(dot(d, normalize(moonDir)), -1.0, 1.0)));
  float sun = pow(max(dot(d, normalize(sunDir)), 0.0), 160.0);
  vec2 g = floor(d.xz * 700.0 + d.y * 300.0);
  float star = step(0.9988, hash21(g)) * smoothstep(0.1, 0.4, h) * (1.0 - twilight * 0.5 * (0.5 + 0.5 * sin(u_time * 3.0 + hash21(g + 7.0) * 40.0)));
  // twilight: the planet disk occludes the aurora behind it (additive, it washed out into the violet band)
  vec3 behind = mix(sky + aur, sky * 0.35, disk * twilight * 0.85);
  vec3 color = behind + planet + vec3(1.0, 1.1, 1.5) * moonMask + sunColor * sun * 0.3 + vec3(star) * 0.9 + glowColor * 0.08 * (1.0 - abs(h));
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
  gWorld = vWorld;
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

/** GU47 IC-18 ion wake: a camera-facing ribbon with a per-vertex colour ramp, additive and above HDR white at the head. */
export const WAKE_VERTEX = /* glsl */ `
attribute vec3 wakeColor;
attribute float wakeAlpha;
out vec2 vUv;
out vec3 vColor;
out float vAlpha;
void main() {
  vUv = uv;
  vColor = wakeColor;
  vAlpha = wakeAlpha;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const WAKE_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float core = pow(across, 0.6) + 1.4 * pow(across, 6.0);
  float a = clamp(core * vAlpha * wakeGain, 0.0, 4.0);
  outColor = vec4(vColor * a, min(a, 1.0));
}`;

/** GU47 IC-24 lane beacons: a dark post whose upper half glows in its district colour (per-vertex `beaconColor`) */
export const BEACON_VERTEX = /* glsl */ `
attribute vec3 beaconColor;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vBeacon;
out vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  vBeacon = beaconColor;
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const BEACON_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vBeacon;
in vec2 vUv;
out vec4 outColor;
${COMMON}
void main() {
  vec3 N = normalize(vNormal);
  gSun = 1.0;
  gWorld = vWorld;
  vec3 color = lit(vec3(0.08, 0.09, 0.12), N);
  float band = smoothstep(0.62, 0.7, vUv.y);
  color += vBeacon * band * beaconGlow * (0.8 + 0.2 * sin(u_time * 3.0 + vWorld.x * 0.05));
  outColor = vec4(applyFog(color, vWorld), 1.0);
}`;
