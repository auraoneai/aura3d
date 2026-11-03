/**
 * View-space surface normals for postprocess passes that declare the
 * `"normal"` input. The forward path does not keep a geometry-normal
 * attachment, so the normal is derived from the frame's signed linear depth
 * (`linZ.r`, already decoded from the active standard, reversed or
 * logarithmic depth convention) and the active inverse projection.
 *
 * Each pixel is placed on its own view ray: two finite points on the ray are
 * obtained from the inverse projection and the point whose view distance
 * equals the stored linear depth is selected. This holds for perspective,
 * orthographic, off-axis and infinite-far projections in either clip range
 * because no particular depth coefficient is assumed. On each axis the
 * one-sided difference with the smaller depth step is used so silhouettes do
 * not blend foreground and background surfaces.
 *
 * Output (rgba16f): `.xyz` = unit view-space normal facing the camera,
 * `.w` = 1 for a covered surface and 0 for cleared (sky) pixels, whose
 * `.xyz` is zero. Nothing here is a world-space normal.
 */
const HEADER = `#version 300 es
precision highp float;
`;

export const NORMAL_FROM_DEPTH_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_linearDepth;
uniform mat4 u_invProjMatrix;
uniform bool u_ortho;
out vec4 o_normal;

// The depth preparation pass writes 3e38 for cleared and unbounded pixels.
const float AURA_NORMAL_SKY = 1e37;

bool auraViewPoint(ivec2 pixel, ivec2 size, out vec3 point) {
  float distanceAlongView = texelFetch(u_linearDepth, pixel, 0).r;
  point = vec3(0.0);
  if (!(abs(distanceAlongView) < AURA_NORMAL_SKY)) return false;
  vec2 ndc = (vec2(pixel) + 0.5) / vec2(size) * 2.0 - 1.0;
  vec4 a = u_invProjMatrix * vec4(ndc, -0.5, 1.0);
  vec4 b = u_invProjMatrix * vec4(ndc, 0.5, 1.0);
  if (abs(a.w) < 1e-20 || abs(b.w) < 1e-20) return false;
  vec3 pa = a.xyz / a.w;
  vec3 pb = b.xyz / b.w;
  float dz = pb.z - pa.z;
  if (abs(dz) < 1e-20) return false;
  // Linear depth is the positive distance along -Z.
  point = pa + (pb - pa) * ((-distanceAlongView - pa.z) / dz);
  return true;
}

vec3 auraSmallerStep(vec3 center, bool hasBefore, vec3 before, bool hasAfter, vec3 after, out bool ok) {
  ok = hasBefore || hasAfter;
  if (hasBefore && hasAfter) {
    return abs(center.z - before.z) <= abs(after.z - center.z) ? center - before : after - center;
  }
  return hasBefore ? center - before : after - center;
}

void main() {
  ivec2 size = textureSize(u_linearDepth, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 last = size - ivec2(1);
  vec3 c, l, r, d, u;
  if (!auraViewPoint(p, size, c)) { o_normal = vec4(0.0); return; }
  bool hasL = p.x > 0 && auraViewPoint(p - ivec2(1, 0), size, l);
  bool hasR = p.x < last.x && auraViewPoint(p + ivec2(1, 0), size, r);
  bool hasD = p.y > 0 && auraViewPoint(p - ivec2(0, 1), size, d);
  bool hasU = p.y < last.y && auraViewPoint(p + ivec2(0, 1), size, u);
  bool okX, okY;
  vec3 dx = auraSmallerStep(c, hasL, l, hasR, r, okX);
  vec3 dy = auraSmallerStep(c, hasD, d, hasU, u, okY);
  vec3 n = cross(dx, dy);
  float len = length(n);
  if (!okX || !okY || !(len > 1e-30)) {
    // A single isolated pixel has no measurable slope; face the camera.
    o_normal = vec4(0.0, 0.0, 1.0, 1.0);
    return;
  }
  n /= len;
  // Face the viewer: the view direction from the surface is -c (perspective)
  // or +Z (orthographic, where c may lie anywhere on a parallel ray).
  vec3 toViewer = u_ortho ? vec3(0.0, 0.0, 1.0) : -c;
  if (dot(n, toViewer) < 0.0) n = -n;
  o_normal = vec4(n, 1.0);
}
`;
