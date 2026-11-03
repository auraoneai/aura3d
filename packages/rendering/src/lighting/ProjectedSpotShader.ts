/**
 * Standalone GLSL ES 3.00 helper for one admitted projected spot image.
 *
 * The caller selects the matching packed direct-light slot and passes the
 * world-space point minus light position, the light's forward direction, its
 * outer half-angle in radians, and the authored image transform. Multiply the
 * returned linear RGB by that light's radiance; shadow, cone, range and BRDF
 * terms remain independent. A disabled or unselected light must bypass this
 * helper rather than using its black outside-projection result.
 *
 * The bound 2D texture must expose top-left-oriented source rows at v=0 and
 * return linear RGB (sRGB storage is decoded by the texture unit). Alpha is
 * ignored. Clamp-to-edge, linear filtering and a complete base level are
 * required. Explicit LOD zero is defined in divergent light/border control
 * flow and avoids requiring a mip chain; minification can alias. This helper
 * is not registered with a renderer or a public material on its own.
 */
export const PROJECTED_SPOT_GLSL = /* glsl */ `
bool a3dProjectedSpotFinite(float value) {
  return !isnan(value) && !isinf(value);
}

// Returns false behind the emitter, for invalid input, or outside the image.
// UV border coordinates themselves are included; the sampler clamps there.
bool a3dProjectedSpotUV(vec3 lightToPoint, vec3 lightForward, float spotAngle,
                        vec2 offset, vec2 scale, float rotation, out vec2 uv) {
  uv = vec2(0.0);
  if (!a3dProjectedSpotFinite(lightToPoint.x) || !a3dProjectedSpotFinite(lightToPoint.y) ||
      !a3dProjectedSpotFinite(lightToPoint.z) || !a3dProjectedSpotFinite(lightForward.x) ||
      !a3dProjectedSpotFinite(lightForward.y) || !a3dProjectedSpotFinite(lightForward.z) ||
      !a3dProjectedSpotFinite(spotAngle) || !a3dProjectedSpotFinite(offset.x) ||
      !a3dProjectedSpotFinite(offset.y) || !a3dProjectedSpotFinite(scale.x) ||
      !a3dProjectedSpotFinite(scale.y) || !a3dProjectedSpotFinite(rotation)) return false;
  if (!(spotAngle > 0.0) || !(spotAngle < 1.5707963267948966) || scale.x == 0.0 || scale.y == 0.0) return false;

  // Scaling before normalization avoids overflowing when components are large.
  float forwardScale = max(max(abs(lightForward.x), abs(lightForward.y)), abs(lightForward.z));
  float deltaScale = max(max(abs(lightToPoint.x), abs(lightToPoint.y)), abs(lightToPoint.z));
  if (!(forwardScale > 0.0) || !(deltaScale > 0.0)) return false;
  float fx = lightForward.x / forwardScale;
  float fy = lightForward.y / forwardScale;
  float fz = lightForward.z / forwardScale;
  float forwardLength = sqrt(fx * fx + fy * fy + fz * fz);
  if (!(forwardLength > 0.0)) return false;
  fx /= forwardLength;
  fy /= forwardLength;
  fz /= forwardLength;

  // right = normalize(cross(forward, reference)); use +Z at either pole.
  float rx = abs(fy) < 0.99 ? -fz : fy;
  float ry = abs(fy) < 0.99 ? 0.0 : -fx;
  float rz = abs(fy) < 0.99 ? fx : 0.0;
  float rightLength = sqrt(rx * rx + ry * ry + rz * rz);
  if (!(rightLength > 0.0)) return false;
  rx /= rightLength;
  ry /= rightLength;
  rz /= rightLength;
  float ux = ry * fz - rz * fy;
  float uy = rz * fx - rx * fz;
  float uz = rx * fy - ry * fx;

  float dx = lightToPoint.x / deltaScale;
  float dy = lightToPoint.y / deltaScale;
  float dz = lightToPoint.z / deltaScale;
  float z = dx * fx + dy * fy + dz * fz;
  if (!(z > 0.0)) return false;
  float width = 2.0 * tan(spotAngle) * z;
  if (!(width > 0.0) || !a3dProjectedSpotFinite(width)) return false;
  float qx = (dx * rx + dy * ry + dz * rz) / width;
  // Top-left image origin: world-space up moves toward decreasing v.
  float qy = -(dx * ux + dy * uy + dz * uz) / width;
  float c = cos(rotation);
  float s = sin(rotation);
  // Aura's image contract rotates around the center, then scales, then offsets.
  float u = 0.5 + (c * qx - s * qy) * scale.x + offset.x;
  float v = 0.5 + (s * qx + c * qy) * scale.y + offset.y;
  if (!a3dProjectedSpotFinite(u) || !a3dProjectedSpotFinite(v)) return false;
  uv = vec2(u, v);
  return u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0;
}

vec3 a3dProjectedSpotImage(highp sampler2D source, vec3 lightToPoint, vec3 lightForward,
                           float spotAngle, vec2 offset, vec2 scale, float rotation) {
  vec2 uv;
  if (!a3dProjectedSpotUV(lightToPoint, lightForward, spotAngle, offset, scale, rotation, uv)) return vec3(0.0);
  return textureLod(source, uv, 0.0).rgb;
}
`;
