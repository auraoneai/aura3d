import type { material } from "@aura3d/engine";

type CustomSpec = Parameters<typeof material.custom>[0];

const VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vW;
out vec4 outColor;
void main() {
  float dist = length(vW - cameraPosition);
  float fogK = 1.0 - exp(-dist * groundFogDensity);
  vec3 col = mix(a3dSrgbToLinear(groundColor), a3dSrgbToLinear(groundFogColor), a3dSaturate(fogK));
  outColor = vec4(a3dFinite(col), 1.0);
}`;

/** The outer terrain: flat dark ground that melts into the sky's horizon colour with distance, so there is no hard horizon line. */
export function groundSpec(): CustomSpec {
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      groundColor: { type: "vec3", value: [0.1, 0.06, 0.14] },
      groundFogColor: { type: "vec3", value: [0.6, 0.3, 0.3] },
      groundFogDensity: { type: "f32", value: 0.0055 }
    }
  };
}
