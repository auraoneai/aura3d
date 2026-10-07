// PRD-07 P5-T6 — §8.7 froxel apply: fullscreen premultiplied-alpha-over blend
// (src.rgb = S, src.a = 1−T → dst = S + dst·T, equal to color·T + S).
// Slice lookup: k = log(viewZ/n)/log(f/n)·N with a 2-tile lerp (§6.7).
// GLSL ES 3.00.

import { PRD07_VOLUMETRIC_MARKER } from "./volumetric-inject.glsl";

const VERT = `
// ${PRD07_VOLUMETRIC_MARKER} apply vertex
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
// ${PRD07_VOLUMETRIC_MARKER} apply fragment
precision highp float;
uniform sampler2D u_integrateAtlas; // (S_acc, T_acc) per tile
uniform highp sampler2D u_sceneDepth;
uniform vec4 u_depthLinearize;     // near, far, orthographic, unused
uniform vec2 u_atlasSize;
uniform vec2 u_tileSize;
uniform float u_tilesX;
uniform float u_near;
uniform float u_far;
uniform float u_slices;
in vec2 v_uv;
layout(location=0) out vec4 o_apply;

float a3dSceneViewZ(float depth) {
  if (u_depthLinearize.z > 0.5) return mix(u_depthLinearize.x, u_depthLinearize.y, depth);
  return u_depthLinearize.x * u_depthLinearize.y /
    max(u_depthLinearize.y - depth * (u_depthLinearize.y - u_depthLinearize.x), 1e-4);
}

vec4 a3dSampleSlice(int k, vec2 uv) {
  if (k < 0 || k >= int(u_slices)) return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 tile = vec2(float(k % int(u_tilesX)), float(k / int(u_tilesX)));
  return texture(u_integrateAtlas, (tile * u_tileSize + uv * u_tileSize) / u_atlasSize);
}

void main() {
  float depth = texelFetch(u_sceneDepth, ivec2(gl_FragCoord.xy), 0).r;
  float viewZ = a3dSceneViewZ(depth);
  float fslice = clamp(log(viewZ / u_near) / log(u_far / u_near) * u_slices - 0.5, 0.0, u_slices - 1.0);
  int k0 = int(floor(fslice));
  int k1 = min(k0 + 1, int(u_slices) - 1);
  vec2 uv = v_uv;                    // tile-local uv equals screen uv (view-aligned grid)
  vec4 s0 = a3dSampleSlice(k0, uv);
  vec4 s1 = a3dSampleSlice(k1, uv);
  vec4 s = mix(s0, s1, fslice - float(k0));   // rgb = S, a = T
  o_apply = vec4(s.rgb, 1.0 - s.a);           // premultiplied-over encode
}
`;

export function volumetricApplyVertexSource(): string {
  return `#version 300 es\n${VERT}`;
}

export function volumetricApplyFragmentSource(): string {
  return `#version 300 es\n${FRAG}`;
}
