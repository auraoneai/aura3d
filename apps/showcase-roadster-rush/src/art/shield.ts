import type { material } from "@aura3d/engine";

type CustomSpec = Parameters<typeof material.custom>[0];

/** Half extents of the shield ellipsoid (primitives.sphere size / 2); the vertex shader rebuilds true ellipsoid normals from them. */
export const SHIELD_SIZE: [number, number, number] = [2.9, 1.6, 4.9];

const VERTEX = /* glsl */ `
out vec3 vN;
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec3 nLocal = position / (shieldRadii * shieldRadii);
  vN = mat3(modelMatrix) * nLocal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vN;
in vec3 vW;
out vec4 outColor;
void main() {
  vec3 n = a3dSafeNormalize(vN, vec3(0.0, 1.0, 0.0));
  vec3 v = a3dSafeNormalize(cameraPosition - vW, vec3(0.0, 0.0, 1.0));
  float rim = 1.0 - abs(dot(n, v));
  float rim3 = rim * rim * rim;
  float ripple = 0.5 + 0.5 * sin(vW.y * 8.0 - uTime * 3.2 + vW.z * 1.5);
  float alpha = a3dSaturate((0.025 + rim3 * 0.9 + ripple * rim * 0.12) * shieldPulse);
  vec3 col = a3dSrgbToLinear(shieldColor) * (0.55 + rim3 * 1.6);
  outColor = vec4(col, alpha);
}`;

/** A thin fresnel shell: the car stays fully visible, only the silhouette rim glows. */
export function shieldSpec(): CustomSpec {
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      shieldRadii: { type: "vec3", value: [SHIELD_SIZE[0] / 2, SHIELD_SIZE[1] / 2, SHIELD_SIZE[2] / 2] },
      shieldColor: { type: "vec3", value: [0.16, 0.78, 1.0] },
      shieldPulse: { type: "f32", value: 1 }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "front"
  };
}
