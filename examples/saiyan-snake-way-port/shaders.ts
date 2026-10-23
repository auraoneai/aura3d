/**
 * GLSL for the port's `material.custom` surfaces, hand-ported to GLSL 300 es (`out` varyings,
 * `outColor`) from the original's three ShaderMaterials: the Kaio-ken aura shell (verbatim
 * blade-tier maths), the sky/cloud-deck backdrop (gradient bands and a noise cloud deck; the
 * original ray-marches a height-field deck, see PORTING-NOTES.md) and, for the road and solid
 * props, the original's three-step toon ramp. Uniform names avoid the engine's built-ins
 * (`time` would lower to the reserved `u_time`, so the aura's `time` is `auraTime` here).
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

/** The original's toon ramp: three bands (0.92, 0.97, 1.0) under a sky/ground hemisphere tint. */
const TOON = /* glsl */ `
vec3 toon(vec3 albedo, vec3 N) {
  vec3 L = normalize(vec3(-0.45, 1.0, 0.6));
  float d = dot(N, L) * 0.5 + 0.5;
  float band = d < 0.34 ? 0.92 : (d < 0.67 ? 0.97 : 1.0);
  vec3 sky = mix(vec3(0.62, 0.52, 0.5), vec3(1.0, 0.93, 0.9), N.y * 0.5 + 0.5);
  return albedo * band * sky;
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
${TOON}
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  outColor = vec4(toon(baseColor, N) + glowColor * glow, 1.0);
}`;

/** Additive soft glow for ki orbs and power-ups. */
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
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - abs(dot(N, V)), 1.6);
  outColor = vec4(mix(glowCore, glowShell, rim), 0.55 + 0.4 * rim);
}`;

/** Road body: a scaled ring (u around the body, v along it) with joint lines, like the original's scale texture. */
export const ROAD_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const ROAD_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
${NOISE}
${TOON}
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  // scale cells: 6 across the walkable top, offset every other row like the original's brick-bond texture
  vec2 cell = vec2(vUv.x * 18.0, vUv.y * 0.9);
  float row = floor(cell.y);
  vec2 g = vec2(cell.x + mod(row, 2.0) * 0.5, cell.y);
  vec2 f = fract(g);
  float joint = smoothstep(0.0, 0.06, f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.94, f.x) * smoothstep(1.0, 0.92, f.y);
  float tint = fbm(floor(g) * 0.7 + 3.1);
  vec3 plate = mix(roadDark, roadTop, 0.55 + 0.45 * tint);
  float top = smoothstep(0.55, 0.85, N.y);
  vec3 body = mix(scaleColor, plate, top);
  vec3 albedo = mix(jointColor, body, joint);
  outColor = vec4(toon(albedo, N), 1.0);
}`;

/** Kaio-ken aura shell: the original's stacked blade tiers (ported verbatim), shaded with `auraTime` / `auraIntensity` / ... */
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

/** Sky: the original's ten-step gradient bands plus a noise cloud deck seen from above (no ray-march). */
export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${NOISE}
vec3 skyAt(float dy) {
  float t = clamp(dy / 0.80, 0.0, 1.0);
  float b = floor(t * 10.0) / 10.0 + fract(t * 10.0) * 0.10;
  return b < 0.46 ? mix(skyLo, skyMid, smoothstep(0.02, 0.48, b)) : mix(skyMid, skyHi, smoothstep(0.46, 0.94, b));
}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  vec3 col = skyAt(dir.y);
  if (dir.y < -0.0025) {
    float t = (deckBase - cameraPosition.y) / dir.y;
    if (t > 0.0 && t < 6000.0) {
      vec2 xz = cameraPosition.xz + dir.xz * t;
      float h = fbm(xz * 0.0012 + vec2(skyTime * 0.004, 0.0));
      h = h * h * (3.0 - 2.0 * h);
      vec3 cloud = mix(cloudDark, mix(cloudMid, cloudLit, smoothstep(0.35, 0.8, h)), 0.35 + 0.65 * h);
      float fade = 1.0 - smoothstep(1500.0, 5800.0, t);
      col = mix(col, cloud, fade);
    }
  }
  outColor = vec4(col, 1.0);
}`;
