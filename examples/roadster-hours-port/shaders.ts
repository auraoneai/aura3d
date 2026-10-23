/**
 * GLSL 300 es for the port's `material.custom` surfaces. The original builds its look from a few
 * `ShaderMaterial`s and three's standard lighting; these programs are self-contained equivalents
 * (hemisphere + key light, distance fog, lane markings, animated water, pulsing relay glow).
 * Uniform names avoid `time`/`pulse` (they lower to `u_time`, which the prelude already declares) and no function parameter
 * reuses a uniform name (the prelude then skips that uniform's `#define` alias).
 */

const LIGHTING = /* glsl */ `
vec3 shade(vec3 albedo, vec3 N, vec3 emissive) {
  vec3 key = normalize(vec3(0.45, 0.8, -0.35));
  vec3 skyC = vec3(0.85, 0.9, 1.0);
  vec3 groundC = vec3(0.22, 0.2, 0.18);
  vec3 hemi = mix(groundC, skyC, N.y * 0.5 + 0.5) * 0.85;
  vec3 keyC = vec3(1.0, 0.93, 0.8) * 1.15 * max(dot(N, key), 0.0);
  return albedo * (hemi + keyC) + emissive;
}
vec3 applyFog(vec3 color, vec3 world, vec3 tint, float nearD, float farD) {
  float d = length(world - cameraPosition);
  float f = clamp((d - nearD) / (farD - nearD), 0.0, 1.0);
  return mix(color, tint, f * f);
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

/** uv.x = lateral position across the road (-1..1), uv.y = arc length in metres. */
export const ROAD_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${LIGHTING}
void main() {
  float lat = vUv.x;
  vec3 albedo = asphalt;
  float dash = step(fract(vUv.y / 14.0), 0.55);
  float centre = (1.0 - smoothstep(0.006, 0.014, abs(lat))) * dash;
  float lanes = (1.0 - smoothstep(0.006, 0.014, abs(abs(lat) - 0.48))) * dash;
  float edge = smoothstep(0.9, 0.93, abs(lat));
  albedo = mix(albedo, lineColor, clamp(centre + lanes, 0.0, 1.0));
  albedo = mix(albedo, glowColor, edge * 0.9);
  float grain = fract(sin(dot(floor(vec2(lat * 90.0, vUv.y * 2.0)), vec2(12.9898, 78.233))) * 43758.5453);
  albedo *= 0.94 + grain * 0.12;
  vec3 N = normalize(vNormal);
  vec3 lit = shade(albedo, N, glowColor * edge * 0.55);
  outColor = vec4(applyFog(lit, vWorld, fogColor, fogNear, fogFar), 1.0);
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
${LIGHTING}
void main() {
  vec2 p = vWorld.xz * 0.045;
  float w = sin(p.x * 3.0 + u_time * 0.9) * 0.5 + sin(p.y * 4.0 - u_time * 0.7) * 0.5 + sin((p.x + p.y) * 7.0 + u_time * 1.6) * 0.25;
  vec3 col = mix(baseColor * 0.65, baseColor * 1.35, w * 0.25 + 0.5);
  float sparkle = pow(max(0.0, sin((p.x - p.y) * 23.0 + u_time * 2.2)), 18.0) * 0.35;
  outColor = vec4(applyFog(col + sparkle, vWorld, fogColor, fogNear, fogFar), 1.0);
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
${LIGHTING}
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  float pulse = glowAmount * (0.8 + 0.2 * sin(u_time * 4.0 + vWorld.z * 0.05));
  outColor = vec4(applyFog(shade(baseColor, N, glowColor * pulse), vWorld, fogColor, fogNear, fogFar), 1.0);
}`;
