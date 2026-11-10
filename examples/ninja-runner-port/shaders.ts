/**
 * GLSL for the port's `material.custom` surfaces. The original's seven raw `ShaderMaterial`s (sky dome,
 * river, valley veil, Spiralorb ball, Spiralorb sparks, leaf spirit flames, particles) are ported
 * here (GLSL 300 es, `outColor`); its patched `MeshStandardMaterial`s (wind-swept grass, carved cliffs,
 * ink-washed Beast) become two self-contained lit shaders (`GROUND`, `SOLID`) that evaluate the
 * original's hemisphere + sun lights and distance fog inline. Uniform names avoid `time`/`opacity`
 * collisions with the engine prelude (`u_time`).
 */

const NOISE = /* glsl */ `
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

/** Hemisphere (sky #d3ebf3 / ground #80715b, 1.2) + sun (#ffe3b1, 3.0) and the original's linear fog. */
const LIGHT_AND_FOG = /* glsl */ `
vec3 shade(vec3 albedo, vec3 N) {
  vec3 sunDir = normalize(vec3(-40.0, 67.0, 31.0));
  vec3 skyC = vec3(0.651, 0.831, 0.896);
  vec3 groundC = vec3(0.216, 0.165, 0.105);
  vec3 hemi = mix(groundC, skyC, N.y * 0.5 + 0.5) * 1.2;
  vec3 sun = vec3(1.0, 0.768, 0.440) * 3.0 * max(dot(N, sunDir), 0.0);
  return albedo * (hemi + sun) * (1.0 / 3.14159265);
}
vec3 applyFog(vec3 color, vec3 world) {
  vec3 fogC = mix(vec3(0.462, 0.578, 0.552), vec3(0.216, 0.323, 0.246), fogMix);
  float near = mix(135.0, 75.0, fogMix);
  float far = mix(510.0, 320.0, fogMix);
  float f = clamp((length(cameraPosition - world) - near) / (far - near), 0.0, 1.0);
  return mix(color, fogC, f);
}
`;

export const GROUND_VERTEX = /* glsl */ `
attribute vec3 tone;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTone;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  vTone = tone;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const GROUND_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTone;
out vec4 outColor;
${NOISE}
${LIGHT_AND_FOG}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float n = fbm(vWorld.xz * 0.42);
  float speck = vnoise(vWorld.xz * 3.1);
  float moss = smoothstep(0.54, 0.78, fbm(vWorld.xz * 0.19 + vec2(3.7, -5.1))) * smoothstep(0.65, 0.95, N.y);
  vec3 base = mix(vTone, vTone * vec3(0.72, 0.88, 0.68), moss * 0.42);
  vec3 albedo = base * (0.78 + 0.34 * n) * (0.94 + 0.12 * speck);
  float wet = pow(1.0 - max(0.0, dot(N, V)), 3.0) * 0.08 * smoothstep(0.4, 0.9, n);
  outColor = vec4(applyFog(shade(albedo, N) + vec3(0.72, 0.82, 0.96) * wet, vWorld), 1.0);
}`;

export const SOLID_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out vec3 vObject;
void main() {
  vObject = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SOLID_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vObject;
out vec4 outColor;
${NOISE}
${LIGHT_AND_FOG}
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  float grain = 0.9 + 0.2 * vnoise(vObject.xz * 7.0 + vObject.y * 3.0);
  vec3 lit = shade(baseColor * grain, N) + glowColor * glow;
  outColor = vec4(applyFog(lit, vWorld), solidAlpha);
}`;

/** Original sky dome: gradient, three-octave clouds, sun disc (`sunDirection`). */
export const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  // GU47 NR-05: zenith / horizon / glow / cloud tints come from the district look table; the defaults in
  // materials.ts (ORIGINAL_SKY) are the original constants, so ?look=original renders unchanged.
  vec3 c = mix(skyHorizon, skyZenith, pow(up, 0.45));
  vec2 q = d.xz / max(0.08, d.y) * 1.2;
  float cl = vnoise(q) + vnoise(q * 2.1) * 0.5 + vnoise(q * 4.5) * 0.2;
  float cloud = smoothstep(0.87, 1.16, cl) * smoothstep(0.02, 0.16, up);
  c = mix(c, skyCloud, cloud * 0.80);
  float sd = max(0.0, dot(d, sunDirection));
  float s = pow(sd, 700.0);
  c += skyGlow * s * 1.5;
  // Low-sun horizon glow (zero at the original's default strength).
  c += skyGlow * pow(sd, 6.0) * skyGlowWide * (1.0 - up);
  // Stars above 15 degrees, thinned by the clouds; a moon disc with a soft halo.
  float above = smoothstep(0.22, 0.4, d.y);
  vec2 sq = floor(d.xz / max(0.2, d.y) * 260.0);
  float star = step(0.9965, hash21(sq)) * (0.55 + 0.45 * hash21(sq + 7.3));
  c += vec3(0.85, 0.9, 1.0) * star * skyStars * above * (1.0 - cloud);
  float md = max(0.0, dot(d, moonDirection));
  c += vec3(0.92, 0.95, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.6 + pow(md, 90.0) * 0.18) * skyMoon;
  outColor = vec4(c, 1.0);
}`;

/** Original river: wave-displaced plane, fresnel, sun glint, caustics. */
export const WATER_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vec3 p = position;
  p.y += sin(p.z * 1.7 + waterTime * 1.4) * 0.025 + sin(p.x * 2.6 + p.z * 0.8 - waterTime) * 0.025;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

export const WATER_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
void main() {
  float a = sin(vWorld.z * 0.81 + vWorld.x * 0.47 + waterTime * 2.0);
  float b = sin(vWorld.x * 1.4 - vWorld.z * 0.68 - waterTime * 1.6);
  vec3 n = normalize(vec3(a * 0.035, 1.0, b * 0.045));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(0.0, dot(n, v)), 3.0);
  vec3 sun = normalize(mix(vec3(-0.5, 0.8, 0.3), waterKey, waterSky));
  float spec = pow(max(0.0, dot(reflect(-sun, n), v)), 160.0);
  float caustic = pow(max(0.0, sin(vWorld.x * 3.0 + a) * sin(vWorld.z * 2.5 + b)), 9.0);
  // GU47 NR-20: the river takes the sky colours (waterSky = 0 keeps the original water).
  vec3 col = mix(vec3(0.022, 0.095, 0.07), vec3(0.14, 0.28, 0.31), fres);
  col = mix(col, mix(waterZenith * 0.35, waterHorizon * 0.9, fres), waterSky);
  // GU47 phase 6 (waterLake, valley only): a deep teal lake with the peach sky caught only at grazing angles and
  // low-sun ripple glints, so it reads as water instead of a flat sky-coloured plane; 0 keeps the river as before.
  float rip = 0.5 + 0.5 * sin(vWorld.z * 0.37 + vWorld.x * 0.11 + a * 1.6 + waterTime * 0.8);
  vec3 lake = mix(vec3(0.02, 0.09, 0.105), waterHorizon * 0.3, fres * 0.35) * (0.92 + 0.12 * rip);
  lake += waterHorizon * pow(rip, 18.0) * 0.08;
  col = mix(col, lake, waterLake);
  col += caustic * 0.025 + spec * 0.4;
  outColor = vec4(col, 0.94);
}`;

/** Original valley waterfall veil (additive-free translucent sheet). */
export const FALLS_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const FALLS_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
${NOISE}
void main() {
  vec2 q = vec2(vUv.x * 52.0, vUv.y * 7.0 + fallsTime * 2.7);
  float n = vnoise(q) + vnoise(q * 2.13) * 0.35 + vnoise(q * 5.1) * 0.13;
  float veins = pow(vnoise(vec2(vUv.x * 140.0, vUv.y * 3.0 + fallsTime * 1.5)), 2.0);
  // GU47 phase 6 (fallsSoft = 1, evening only): ragged side edges, a white lip at the crest and a mist foot instead of
  // the hard-edged 4.6.2 card; fallsSoft = 0 keeps the 4.6.2 sheet exactly.
  float rag = (vnoise(vec2(vUv.y * 9.0 + fallsTime * 1.2, 3.0)) - 0.5) * 0.08 * fallsSoft;
  float ew = mix(0.04, 0.16, fallsSoft);
  float edge = smoothstep(0.0, ew, vUv.x + rag) * smoothstep(0.0, ew, 1.0 - vUv.x + rag);
  float foot = mix(1.0, smoothstep(0.0, 0.22, vUv.y), fallsSoft);
  float lip = fallsSoft * smoothstep(0.93, 0.99, vUv.y);
  vec3 c = mix(vec3(0.24, 0.48, 0.51), vec3(0.90, 0.97, 0.96), clamp(n * 0.64 + veins * 0.4, 0.0, 1.0));
  c = mix(c, vec3(0.96, 0.98, 0.97), lip * 0.7 + fallsSoft * (1.0 - foot) * 0.5);
  float top = mix(1.0, 1.0 - smoothstep(0.985, 1.0, vUv.y) * 0.6, fallsSoft);
  outColor = vec4(c, edge * top * mix(1.0, 0.35 + 0.65 * foot, fallsSoft) * (0.88 + 0.1 * veins));
}`;

/** Original Spiralorb ball: banded swirl + rim, additive. */
export const BALL_VERTEX = /* glsl */ `
out vec3 vP;
out vec3 vN;
out vec3 vV;
void main() {
  vP = position;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const BALL_FRAGMENT = /* glsl */ `
in vec3 vP;
in vec3 vN;
in vec3 vV;
out vec4 outColor;
void main() {
  float bands = sin(atan(vP.z, vP.x) * 7.0 + vP.y * 37.0 - ballTime * 24.0);
  float swirl = pow(0.5 + 0.5 * bands, 5.0);
  float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
  vec3 col = mix(vec3(0.015, 0.23, 1.0), vec3(0.65, 1.0, 1.0), swirl * 0.85 + rim * 0.4);
  outColor = vec4(col * (1.2 + swirl), (0.48 + swirl * 0.4 + rim * 0.12) * ballOpacity);
}`;

/** Form aura: a rim-lit flickering shell (the interior stays clear so the runner shows through), additive. */
export const AURA_FRAGMENT = /* glsl */ `
in vec3 vP;
in vec3 vN;
in vec3 vV;
out vec4 outColor;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 2.4);
  float flame = 0.5 + 0.5 * sin(vP.y * 9.0 - auraTime * 7.0 + sin(atan(vP.z, vP.x) * 5.0 + auraTime * 2.0) * 1.7);
  float k = (0.25 + 0.75 * rim) * (0.55 + 0.45 * flame) * auraStrength;
  outColor = vec4(auraColor * (0.7 + 0.6 * flame), clamp(k * rim * 1.5 + k * 0.08, 0.0, 1.0));
}`;

/** Original Spiralorb sparks: points orbiting the hand, seeded by `seed`. */
export const SPARKS_VERTEX = /* glsl */ `
attribute vec3 seed;
out float vAlpha;
void main() {
  float a = seed.x * 6.283 + sparkTime * 9.0;
  float r = 0.1 + seed.y * 0.24;
  // position is all zeros for this pool; reading it keeps a_position active so the draw is not skipped (5.0.2 binding validation).
  vec3 p = vec3(cos(a) * r, (seed.z - 0.5) * 0.35, sin(a) * r) + position;
  vAlpha = (1.0 - seed.y) * sparkStrength;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(8.0, (3.0 + seed.z * 5.0) * 70.0 / max(0.5, -mv.z));
}`;

export const SPARKS_FRAGMENT = /* glsl */ `
in float vAlpha;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  outColor = vec4(0.3, 0.8, 1.0, max(0.0, 1.0 - d) * vAlpha);
}`;

/** Original leaf spirit flames: textured billboards fading with distance to the runner. */
export const FLAME_VERTEX = /* glsl */ `
attribute float aAlive;
attribute float aDistance;
out float vFade;
void main() {
  float d = aDistance - runnerS;
  vFade = aAlive * smoothstep(-3.0, 0.0, d) * (1.0 - smoothstep(90.0, 120.0, d));
  vec3 p = position;
  p.y += sin(flameTime * 3.0 + aDistance) * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(150.0 * (0.9 + 0.04 * sin(flameTime * 4.0 + aDistance)) / max(1.0, -mv.z), 2.0, 64.0);
}`;

export const FLAME_FRAGMENT = /* glsl */ `
in float vFade;
out vec4 outColor;
void main() {
  vec4 tex = texture(flameMap, gl_PointCoord);
  float a = tex.a * vFade;
  if (a < 0.02) discard;
  outColor = vec4(tex.rgb, a);
}`;

/** Original particle pool: round soft points with per-point size, colour and alpha, additive. */
export const PARTICLE_VERTEX = /* glsl */ `
attribute vec3 tone;
attribute float aSize;
attribute float aAlpha;
out vec3 vColor;
out float vAlpha;
void main() {
  vColor = tone;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(95.0, aSize * pixelRatio * 320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

export const PARTICLE_FRAGMENT = /* glsl */ `
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 1.6) * vAlpha;
  if (a < 0.005) discard;
  outColor = vec4(vColor, a);
}`;

/** Katana / gale-blade crescent slash ribbon: sumi-indigo body with forged-steel outer edge glint. */
export const SLASH_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SLASH_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
${NOISE}
void main() {
  float head = clamp(slashProgress * 1.35, 0.0, 1.25);
  float sweep = smoothstep(head - 0.78, head - 0.06, vUv.x) * (1.0 - smoothstep(head - 0.04, head + 0.06, vUv.x));
  float streak = 0.65 + 0.35 * vnoise(vec2(vUv.x * 14.0 - slashTime * 16.0, vUv.y * 5.0));
  float blade = smoothstep(0.24, 0.90, vUv.y) * (1.0 - smoothstep(0.93, 1.0, vUv.y));
  float glint = smoothstep(0.72, 0.94, vUv.y);
  vec3 col = mix(slashInk, slashEdge * 1.65, glint * 0.85 + 0.15 * streak);
  float alpha = clamp(sweep * blade * streak * (1.15 - slashProgress * 0.55), 0.0, 1.0);
  if (alpha < 0.01) discard;
  outColor = vec4(col, alpha);
}`;

/** Calligraphy seal targeting ring under the next lane rival (`threat-0`). */
export const THREAT_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const THREAT_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 p = (vUv - vec2(0.5)) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float brush = 0.78 + 0.22 * sin(ang * 4.0 + ringTime * 3.2) * cos(ang * 3.0 - ringTime * 1.8);
  float outer = smoothstep(0.68, 0.78, r) * (1.0 - smoothstep(0.88, 0.97, r));
  float inner = smoothstep(0.36, 0.42, r) * (1.0 - smoothstep(0.46, 0.52, r));
  float ticks = step(0.65, cos(ang * 4.0 - ringTime * 2.2)) * smoothstep(0.52, 0.58, r) * (1.0 - smoothstep(0.68, 0.74, r));
  float mask = clamp(outer * brush + inner * 0.65 + ticks * 0.75, 0.0, 1.0);
  if (mask < 0.04) discard;
  vec3 col = mix(inkColor, ringColor * (1.05 + 0.55 * glow), clamp(outer + ticks * 0.8, 0.0, 1.0));
  outColor = vec4(col, clamp(mask * (0.68 + 0.28 * glow), 0.0, 1.0));
}`;
