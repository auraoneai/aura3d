/**
 * PRD-10 T3.5 §8.4 — octahedral-impostor program for the far LOD band. The
 * vertex stage builds a camera-facing billboard at the instance's bounding-
 * sphere centre, maps the object-space view direction onto the 8×8
 * hemi-octahedral grid, and emits the 3 frame UVs + barycentric weights; the
 * fragment samples the baked albedo+alpha / normal+depth atlases through the
 * `a3d_prd10_impostor` chunk, applies per-frame parallax, alpha-tests, and
 * (High+) writes `gl_FragDepth` from the depth channel.
 */
import type { ShaderSources } from "../../RenderDevice.js";
import { a3d_prd10_impostor } from "./shaders/impostor.js";
import { a3d_prd10_foliage } from "./shaders/foliage.js"; // bayer4x4 crossfade

const IMPOSTOR_VERT = /* glsl */ `#version 300 es
precision highp float;
// billboard quad in [-1,1]
in vec2 a_position;
in vec3 a_instancePosition;      // bounding-sphere centre (world)
in float a_instanceScale;
in float a_instanceYaw;          // unorm 0..1
uniform mat4 u_viewProjection;
uniform vec3 u_cameraPosition;
uniform float u_impostorRadius;  // bounding-sphere radius at scale 1
uniform vec4 u_atlasGrid;        // views, views, tilePx, atlasPx
uniform vec3 u_lodDistances;     // lod1, impostor, cull
out vec3 v_uv0;
out vec3 v_uv1;
out vec3 v_uv2;                  // frame uv in xy, barycentric weight in z
out vec2 v_parallax0;
out vec2 v_parallax1;
out vec2 v_parallax2;
out float v_fade;

// octahedral encode of a unit view direction into hemi grid coords
vec2 a3dOctaCell(vec3 dirObj) {
  dirObj.y = abs(dirObj.y); // hemisphere: fold down
  vec2 oct = dirObj.xz / (abs(dirObj.x) + abs(dirObj.y) + abs(dirObj.z));
  return oct * 0.5 + 0.5;
}
vec3 a3dOctaDir(vec2 cell, float grid) {
  vec2 oct = (cell + 0.5) / grid * 2.0 - 1.0;
  vec3 d = vec3(oct.x, 1.0 - abs(oct.x) - abs(oct.y), oct.y);
  return normalize(d);
}
vec2 a3dFrameUv(vec2 cell, vec2 corner, float grid) {
  return (corner + fract(cell)) / grid; // uv in [0,1] atlas
}
void main() {
  vec3 center = a_instancePosition;
  float radius = u_impostorRadius * a_instanceScale;
  // object-space view dir (undo yaw)
  float yaw = a_instanceYaw * 6.28318530718;
  float cy = cos(-yaw); float sy = sin(-yaw);
  vec3 viewWorld = u_cameraPosition - center;
  vec3 viewObj = vec3(viewWorld.x * cy + viewWorld.z * sy, viewWorld.y, -viewWorld.x * sy + viewWorld.z * cy);
  vec2 cell = a3dOctaCell(normalize(viewObj)) * (u_atlasGrid.x - 1.0);
  ivec2 i0 = ivec2(floor(cell));
  vec2 f = cell - vec2(i0);
  ivec2 c0 = clamp(i0,               ivec2(0), ivec2(u_atlasGrid.x - 2));
  ivec2 c1 = clamp(i0 + ivec2(1, 0), ivec2(0), ivec2(u_atlasGrid.x - 2));
  ivec2 c2 = clamp(i0 + ivec2(0, 1), ivec2(0), ivec2(u_atlasGrid.x - 2));
  ivec2 c3 = clamp(i0 + ivec2(1, 1), ivec2(0), ivec2(u_atlasGrid.x - 2));
  // triangulate the quad: nearest 3 frames + barycentric weights
  vec2 fc = f;
  ivec2 a = c0; ivec2 b; ivec2 c;
  vec3 w;
  if (fc.x + fc.y < 1.0) { b = c1; c = c2; w = vec3(1.0 - fc.x - fc.y, fc.x, fc.y); }
  else { a = c3; b = c2; c = c1; w = vec3(fc.x + fc.y - 1.0, 1.0 - fc.x, 1.0 - fc.y); }
  v_uv0 = vec3((vec2(a) + 0.5) / u_atlasGrid.x, w.x);
  v_uv1 = vec3((vec2(b) + 0.5) / u_atlasGrid.x, w.y);
  v_uv2 = vec3((vec2(c) + 0.5) / u_atlasGrid.x, w.z);
  // per-frame parallax direction (frame view dir xy in object space)
  v_parallax0 = a3dOctaDir(vec2(a), u_atlasGrid.x).xz;
  v_parallax1 = a3dOctaDir(vec2(b), u_atlasGrid.x).xz;
  v_parallax2 = a3dOctaDir(vec2(c), u_atlasGrid.x).xz;
  // camera-facing billboard
  vec3 fwd = normalize(vec3(viewWorld.x, 0.0, viewWorld.z));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 world = center + right * a_position.x * radius + up * a_position.y * radius;
  float d = length(viewWorld);
  v_fade = 1.0 - smoothstep(u_lodDistances.z * 0.9, u_lodDistances.z, d);
  gl_Position = u_viewProjection * vec4(world, 1.0);
}
`;

const IMPOSTOR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_uv0;
in vec3 v_uv1;
in vec3 v_uv2;
in vec2 v_parallax0;
in vec2 v_parallax1;
in vec2 v_parallax2;
in float v_fade;
out vec4 o_color;
uniform sampler2D u_impostorAlbedo;      // atlas, albedo+alpha
uniform sampler2D u_impostorNormalDepth; // atlas, normal.xyz + linear depth
uniform float u_impostorParallax;
uniform float u_alphaCutoff;
uniform float u_nearPlane;
uniform float u_farPlane;
uniform int u_writeDepth;                // High+ only
${a3d_prd10_impostor.glsl}
void main() {
  if (a3dBayer4x4(gl_FragCoord.xy) > v_fade) discard;
  float wSum = v_uv0.z + v_uv1.z + v_uv2.z;
  vec4 a0 = texture(u_impostorAlbedo, v_uv0.xy + (texture(u_impostorNormalDepth, v_uv0.xy).a - 0.5) * v_parallax0 * u_impostorParallax);
  vec4 a1 = texture(u_impostorAlbedo, v_uv1.xy + (texture(u_impostorNormalDepth, v_uv1.xy).a - 0.5) * v_parallax1 * u_impostorParallax);
  vec4 a2 = texture(u_impostorAlbedo, v_uv2.xy + (texture(u_impostorNormalDepth, v_uv2.xy).a - 0.5) * v_parallax2 * u_impostorParallax);
  vec4 albedo = (a0 * v_uv0.z + a1 * v_uv1.z + a2 * v_uv2.z) / max(wSum, 1e-5);
  if (albedo.a < u_alphaCutoff) discard;
  vec4 n0 = texture(u_impostorNormalDepth, v_uv0.xy);
  vec4 n1 = texture(u_impostorNormalDepth, v_uv1.xy);
  vec4 n2 = texture(u_impostorNormalDepth, v_uv2.xy);
  vec3 nObj = normalize((n0.xyz * v_uv0.z + n1.xyz * v_uv1.z + n2.xyz * v_uv2.z) * 2.0 - 1.0);
  o_color = vec4(albedo.rgb * max(dot(nObj, normalize(vec3(0.4, 0.8, 0.3))), 0.2), 1.0);
  if (u_writeDepth == 1) {
    float depth = (n0.a * v_uv0.z + n1.a * v_uv1.z + n2.a * v_uv2.z) / max(wSum, 1e-5);
    float z = mix(u_nearPlane, u_farPlane, clamp(depth, 0.0, 1.0));
    // approximate linear-depth -> clip depth for the impostor plane distance
    float viewZ = gl_FragCoord.z * u_farPlane;
    gl_FragDepth = clamp(viewZ / u_farPlane + (depth - 0.5) * 0.02, 0.0, 1.0);
  }
}
`;

/** Full sources for the standalone Path S impostor program. */
export function impostorShaderSources(): ShaderSources {
  return {
    label: "prd10-impostor",
    marker: "prd10-impostor",
    vertex: IMPOSTOR_VERT,
    fragment: IMPOSTOR_FRAG
  };
}
