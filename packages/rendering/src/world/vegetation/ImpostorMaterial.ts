/**
 * PRD-10 T3.5 §8.4 — octahedral-impostor program for the far LOD band. The
 * vertex stage builds a camera-facing (Y-up cylindrical) billboard at the
 * instance's bounding-sphere centre, maps the object-space view direction
 * onto the hemi-octahedral grid (`v_octUv`) and passes the billboard-local UV.
 * The fragment stage is the registered `a3d_prd10_impostor` chunk: it picks
 * the 3 nearest baked frames, blends them barycentrically with per-frame
 * parallax, alpha-tests, and (High+) writes `gl_FragDepth` from the depth
 * channel. The far-band crossfade uses the `a3d_prd10_foliage` Bayer dither.
 *
 * Bake contract (tools/impostor-bake): frame (i, j) is an orthographic view
 * from `impostorViewGrid` direction j*grid+i, basis right = normalize(cross(Y,
 * horizontal view)), up = cross(view, right), clip x/y = dot(p - centre,
 * right/up) / radius — the same basis this billboard spans, so tile UV (0..1)
 * maps 1:1 onto `a_position * 0.5 + 0.5`.
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
uniform vec3 u_lodDistances;     // lod1, impostor, cull
out vec2 v_octUv;
out vec2 v_localUv;
out float v_fade;

// hemi-octahedral encode (lower hemisphere folded up) — matches impostorViewGrid
vec2 a3dImpostorOctUv(vec3 dirObj) {
  dirObj.y = abs(dirObj.y);
  return dirObj.xz / (abs(dirObj.x) + dirObj.y + abs(dirObj.z)) * 0.5 + 0.5;
}

void main() {
  vec3 center = a_instancePosition;
  float radius = u_impostorRadius * a_instanceScale;
  // object-space view dir (undo yaw about +Y)
  float yaw = a_instanceYaw * 6.28318530718;
  float cy = cos(-yaw); float sy = sin(-yaw);
  vec3 viewWorld = u_cameraPosition - center;
  vec3 viewObj = vec3(viewWorld.x * cy + viewWorld.z * sy, viewWorld.y, -viewWorld.x * sy + viewWorld.z * cy);
  v_octUv = a3dImpostorOctUv(normalize(viewObj));
  v_localUv = a_position * 0.5 + 0.5;
  // camera-facing cylindrical billboard (same right/up the bake used)
  vec3 horiz = vec3(viewWorld.x, 0.0, viewWorld.z);
  vec3 fwd = dot(horiz, horiz) > 1e-12 ? normalize(horiz) : vec3(0.0, 0.0, 1.0);
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
in vec2 v_octUv;
in vec2 v_localUv;
in float v_fade;
out vec4 o_color;
${a3d_prd10_foliage.glsl}
${a3d_prd10_impostor.glsl}
void main() {
  if (a3dBayer4x4(gl_FragCoord.xy) > v_fade) discard;
  // per-frame parallax direction: the view's offset from each frame in grid space
  vec2 frames[3]; vec3 w;
  a3dImpostorFrames(v_octUv, frames, w);
  vec2 g = v_octUv * u_impostorGridDim - 0.5;
  vec2 parallax[3];
  for (int i = 0; i < 3; i++) parallax[i] = (g - frames[i]) / u_impostorGridDim;
  vec3 nXY; float depth;
  vec4 albedo = a3dImpostorShade(v_octUv, v_localUv, parallax, nXY, depth);
  vec3 n = vec3(nXY.xy, sqrt(max(1.0 - dot(nXY.xy, nXY.xy), 0.0)));
  o_color = vec4(albedo.rgb * max(dot(n, normalize(vec3(0.4, 0.8, 0.3))), 0.2), 1.0);
  // statically assigned on every path (GLSL ES 3.0): pass-through unless High+
  gl_FragDepth = u_impostorWriteDepth == 1
    ? clamp(gl_FragCoord.z - (depth - 0.5) * 0.02, 0.0, 1.0)
    : gl_FragCoord.z;
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
