// PRD-07 P5-T6 — §8.7 froxel integrate: one draw covering the whole atlas;
// each fragment computes the front-to-back prefix sum for ITS tile's slice k
// (O(N²) texel reads total — spec-faithful "one pass that loops the slices").
// Writes (S_acc, T_acc) per slice; apply reads it with a 2-tile lerp.
// GLSL ES 3.00.

import { PRD07_VOLUMETRIC_MARKER } from "./volumetric-inject.glsl";

const VERT = `
// ${PRD07_VOLUMETRIC_MARKER} integrate vertex
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
// ${PRD07_VOLUMETRIC_MARKER} integrate fragment
precision highp float;
uniform sampler2D u_injectAtlas;  // (L, σ) per tile
uniform vec2 u_atlasSize;         // atlas pixels (tilesX*tileW, tilesY*tileH)
uniform vec2 u_tileSize;
uniform float u_tilesX;
uniform float u_near;
uniform float u_far;
uniform float u_slices;
layout(location=0) out vec4 o_integrate;

float a3dSliceZ(float k) {
  return u_near * pow(u_far / u_near, float(k) / u_slices);
}

void main() {
  vec2 tileF = floor(gl_FragCoord.xy / u_tileSize);
  int k = int(tileF.y) * int(u_tilesX) + int(tileF.x);
  vec2 uv = fract(gl_FragCoord.xy / u_tileSize);

  vec3 S = vec3(0.0);
  float T = 1.0;
  for (int j = 0; j <= k; j++) {
    vec2 tile = vec2(float(j % int(u_tilesX)), float(j / int(u_tilesX)));
    vec4 inj = texture(u_injectAtlas, (tile * u_tileSize + uv * u_tileSize) / u_atlasSize);
    float sigma = inj.a;
    float dz = a3dSliceZ(float(j) + 1.0) - a3dSliceZ(float(j));
    // energy-conserving step (Hillaire 2015): S += L·(1-e^{-σΔz})/σ · T
    S += inj.rgb * ((1.0 - exp(-sigma * dz)) / max(sigma, 1e-5)) * T;
    T *= exp(-sigma * dz);
  }
  o_integrate = vec4(S, T);
}
`;

export function volumetricIntegrateVertexSource(): string {
  return `#version 300 es\n${VERT}`;
}

export function volumetricIntegrateFragmentSource(): string {
  return `#version 300 es\n${FRAG}`;
}
