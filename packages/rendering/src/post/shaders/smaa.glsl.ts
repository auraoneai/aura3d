/**
 * Aura3D's three-stage morphological antialiaser for the `smaa` mode.
 *
 * It detects local colour edges, measures bounded runs on either side of each
 * edge, and uses an original triangle-coverage table to blend across short
 * runs. Long, unbroken horizontal and vertical lines are left unchanged.
 * The method is an independently authored approximation, not a numerical
 * implementation of the reference SMAA lookup tables. Each pass writes the
 * whole destination, including pixels without an edge, so pooled targets do
 * not leak pixels from an earlier frame.
 */

export const SMAA_EDGES_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_color;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

float a3dColorDifference(vec4 a, vec4 b) {
  vec4 d = abs(a - b);
  return max(max(d.r, d.g), max(d.b, d.a));
}

vec4 SMAAColorEdgeDetectionPS(vec2 uv) {
  vec4 center = texture(u_color, uv);
  float left = a3dColorDifference(center, texture(u_color, uv - vec2(u_resolution.x, 0.0)));
  float right = a3dColorDifference(center, texture(u_color, uv + vec2(u_resolution.x, 0.0)));
  float down = a3dColorDifference(center, texture(u_color, uv - vec2(0.0, u_resolution.y)));
  float up = a3dColorDifference(center, texture(u_color, uv + vec2(0.0, u_resolution.y)));
  float localMax = max(max(left, right), max(down, up));
  vec2 contrast = vec2(left, down);
  vec2 strength = smoothstep(vec2(0.04), vec2(0.10), contrast);
  strength *= step(vec2(localMax * 0.35), contrast);
  return vec4(strength, 0.0, 1.0);
}

void main() {
  outColor = SMAAColorEdgeDetectionPS(v_uv);
}
`;

export const SMAA_WEIGHTS_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_edges;
uniform sampler2D u_area;
uniform sampler2D u_search;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

// Each edge run has a maximum of eight neighbors in either direction.
const int A3D_MAX_EDGE_RUN = 8;
bool a3dInside(vec2 uv) {
  return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}

float a3dEdge(vec2 uv, bool vertical) {
  if (!a3dInside(uv)) return 0.0;
  vec2 edge = textureLod(u_edges, uv, 0.0).rg;
  return vertical ? edge.r : edge.g;
}

float a3dEdgeWeight(vec2 uv, bool vertical) {
  float strength = a3dEdge(uv, vertical);
  if (strength <= 0.0) return 0.0;
  vec2 tangent = vertical ? vec2(0.0, u_resolution.y) : vec2(u_resolution.x, 0.0);
  int negative = 0;
  int positive = 0;
  for (int i = 1; i <= A3D_MAX_EDGE_RUN; ++i) {
    if (a3dEdge(uv - tangent * float(i), vertical) <= 0.0) break;
    negative = i;
  }
  for (int i = 1; i <= A3D_MAX_EDGE_RUN; ++i) {
    if (a3dEdge(uv + tangent * float(i), vertical) <= 0.0) break;
    positive = i;
  }
  // Infinite-looking axis-aligned edges already coincide with pixel borders.
  if (negative == A3D_MAX_EDGE_RUN && positive == A3D_MAX_EDGE_RUN) return 0.0;
  float index = float(negative + (A3D_MAX_EDGE_RUN + 1) * positive);
  float area = textureLod(u_area, vec2((index + 0.5) / 81.0, 0.5), 0.0).r;
  float response = textureLod(u_search, vec2((strength * 255.0 + 0.5) / 256.0, 0.5), 0.0).r;
  return 0.25 * area * response;
}

vec4 SMAABlendingWeightCalculationPS(vec2 uv) {
  // Store each boundary once. Its neighbour fetches the same weight, so
  // blending on the two sides is symmetric without repeating the run search.
  return vec4(a3dEdgeWeight(uv, true), a3dEdgeWeight(uv, false), 0.0, 0.0);
}

void main() {
  outColor = SMAABlendingWeightCalculationPS(v_uv);
}
`;

export const SMAA_BLEND_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_weights;
uniform sampler2D u_color;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

vec3 a3dToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 a3dToDisplay(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec4 SMAANeighborhoodBlendingPS(vec2 uv) {
  vec4 center = texture(u_color, uv);
  vec2 here = texture(u_weights, uv).rg;
  float right = texture(u_weights, uv + vec2(u_resolution.x, 0.0)).r;
  float up = texture(u_weights, uv + vec2(0.0, u_resolution.y)).g;
  float weight = here.r;
  vec2 offset = vec2(-u_resolution.x, 0.0);
  if (right > weight) { weight = right; offset = vec2(u_resolution.x, 0.0); }
  if (here.g > weight) { weight = here.g; offset = vec2(0.0, -u_resolution.y); }
  if (up > weight) { weight = up; offset = vec2(0.0, u_resolution.y); }
  if (weight <= 0.0) return center;
  vec4 other = texture(u_color, uv + offset);
  float alpha = mix(center.a, other.a, weight);
  if (alpha <= 1e-8) return vec4(0.0);
  // RGB is straight alpha on input/output. Interpolate associated linear
  // light so hidden colours in transparent texels cannot bleed into edges.
  vec3 premultiplied = mix(a3dToLinear(center.rgb) * center.a,
                           a3dToLinear(other.rgb) * other.a, weight);
  return vec4(a3dToDisplay(premultiplied / alpha), alpha);
}

void main() {
  outColor = SMAANeighborhoodBlendingPS(v_uv);
}
`;
