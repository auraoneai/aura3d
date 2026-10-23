/**
 * Drift & Deliver port: sky dome and distant city as `material.custom` shaders. A custom shader is used because the
 * built-in unlit/emissive PBR paths did not draw the sky in this app configuration (the dome came out black), while custom
 * programs are exercised by the headlight beam on the same page.
 */
import type { CustomSpec } from "./headlights";

export const SUN_DIR: readonly [number, number, number] = (() => {
  const v = [88, 38, 50];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();

export const SKY_VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const SKY_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec3 vW;
out vec4 outColor;
vec3 lin(vec3 c) { return a3dSrgbToLinear(c); }
void main() {
  vec3 dir = normalize(vW - cameraPosition);
  float h = max(dir.y, 0.0);
  vec3 horizon = lin(vec3(0.941, 0.863, 0.753));
  vec3 mid = lin(vec3(0.961, 0.835, 0.690));
  vec3 top = lin(vec3(0.914, 0.753, 0.549));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, top, smoothstep(0.18, 0.85, h));
  float s = max(dot(dir, normalize(sunDirection)), 0.0);
  col += lin(vec3(1.0, 0.82, 0.55)) * (0.55 * pow(s, 18.0) + 0.9 * pow(s, 220.0));
  outColor = vec4(col, 1.0);
}`;

export const skySpec = (): CustomSpec => ({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: { sunDirection: { type: "color3", value: [SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]] } },
  depthWrite: false,
  depthTest: true,
  side: "double"
});

export const FAR_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * vec4(position, 1.0));
}`;

export const FAR_FRAGMENT = /* glsl */ `
#include <colorspace_decode>
in vec2 vUv;
out vec4 outColor;
void main() {
  outColor = vec4(a3dSrgbToLinear(texture(farPalette, vUv).rgb), 1.0);
}`;

export const farCitySpec = (palette: unknown): CustomSpec => ({
  glsl: { vertex: FAR_VERTEX, fragment: FAR_FRAGMENT },
  uniforms: { farPalette: { type: "texture2d", value: palette as never } },
  side: "double"
});
