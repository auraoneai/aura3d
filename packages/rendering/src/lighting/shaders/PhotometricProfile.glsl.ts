/**
 * Independent Type-C measured-candela lookup for GLSL ES 3.00.
 *
 * The caller supplies a current PhotometricProfileAtlas R32F texture and the
 * integer/float vectors returned by shaderArguments(). This chunk is not
 * registered with the renderer. It returns absolute candela times the profile
 * scale; visibility, runtime dimming, distance falloff and light color remain
 * the caller's responsibility. Texture data are read by texelFetch, so no
 * floating-point linear-filtering extension is required.
 */
export const PHOTOMETRIC_PROFILE_GLSL = /* glsl */ `
struct A3DPhotometricBracket {
  int low;
  int high;
  float weight;
};

float a3dPhotometricFetch(highp sampler2D source, int width, int index) {
  return texelFetch(source, ivec2(index % width, index / width), 0).r;
}

bool a3dPhotometricRange(int offset, int count, int capacity) {
  return offset >= 0 && count > 0 && offset <= capacity && count <= capacity - offset;
}

A3DPhotometricBracket a3dPhotometricBracket(highp sampler2D source, int width, int offset, int count, float value) {
  if (count == 1 || value <= a3dPhotometricFetch(source, width, offset)) {
    return A3DPhotometricBracket(0, 0, 0.0);
  }
  int last = count - 1;
  if (value >= a3dPhotometricFetch(source, width, offset + last)) {
    return A3DPhotometricBracket(last, last, 0.0);
  }
  int low = 0;
  int high = last;
  // The atlas accepts at most 4096 angles on either axis.
  for (int iteration = 0; iteration < 12; ++iteration) {
    if (high - low <= 1) break;
    int middle = low + (high - low) / 2;
    if (a3dPhotometricFetch(source, width, offset + middle) <= value) low = middle;
    else high = middle;
  }
  float first = a3dPhotometricFetch(source, width, offset + low);
  float second = a3dPhotometricFetch(source, width, offset + high);
  return A3DPhotometricBracket(low, high, (value - first) / (second - first));
}

float a3dPhotometricSampleAngles(highp sampler2D source, ivec4 offsetsAndVerticalCount,
                                  ivec2 horizontalCountAndSymmetry, vec2 scaleRotation,
                                  float verticalDegrees, float azimuthDegrees) {
  ivec2 dimensions = textureSize(source, 0);
  if (dimensions.x <= 0 || dimensions.y <= 0 || dimensions.x > 4096 || dimensions.y > 4096) return 0.0;
  int verticalCount = offsetsAndVerticalCount.w;
  int horizontalCount = horizontalCountAndSymmetry.x;
  int symmetry = horizontalCountAndSymmetry.y;
  if (verticalCount <= 0 || verticalCount > 4096 || horizontalCount <= 0 || horizontalCount > 4096 ||
      symmetry < 0 || symmetry > 3 ||
      (symmetry == 0 && horizontalCount != 1) || (symmetry != 0 && horizontalCount < 2) ||
      !(scaleRotation.x >= 0.0)) return 0.0;
  if (verticalCount > 1048576 / horizontalCount) return 0.0;
  int capacity = dimensions.x * dimensions.y;
  if (!a3dPhotometricRange(offsetsAndVerticalCount.x, verticalCount, capacity) ||
      !a3dPhotometricRange(offsetsAndVerticalCount.y, horizontalCount, capacity) ||
      !a3dPhotometricRange(offsetsAndVerticalCount.z, verticalCount * horizontalCount, capacity)) return 0.0;
  if (offsetsAndVerticalCount.y != offsetsAndVerticalCount.x + verticalCount ||
      offsetsAndVerticalCount.z != offsetsAndVerticalCount.y + horizontalCount) return 0.0;
  float firstVertical = a3dPhotometricFetch(source, dimensions.x, offsetsAndVerticalCount.x);
  float lastVertical = a3dPhotometricFetch(source, dimensions.x, offsetsAndVerticalCount.x + verticalCount - 1);
  if (!(verticalDegrees >= firstVertical && verticalDegrees <= lastVertical)) return 0.0;
  float angle = azimuthDegrees - scaleRotation.y * 57.29577951308232;
  angle -= 360.0 * floor(angle / 360.0);
  if (symmetry == 1) {
    if (angle > 180.0) angle = 360.0 - angle;
    if (angle > 90.0) angle = 180.0 - angle;
  } else if (symmetry == 2 && angle > 180.0) {
    angle = 360.0 - angle;
  }
  A3DPhotometricBracket vertical = a3dPhotometricBracket(source, dimensions.x, offsetsAndVerticalCount.x, verticalCount, verticalDegrees);
  A3DPhotometricBracket horizontal = a3dPhotometricBracket(source, dimensions.x, offsetsAndVerticalCount.y, horizontalCount, angle);
  int firstRow = offsetsAndVerticalCount.z + horizontal.low * verticalCount;
  int secondRow = offsetsAndVerticalCount.z + horizontal.high * verticalCount;
  float a = a3dPhotometricFetch(source, dimensions.x, firstRow + vertical.low);
  float b = a3dPhotometricFetch(source, dimensions.x, firstRow + vertical.high);
  float c = a3dPhotometricFetch(source, dimensions.x, secondRow + vertical.low);
  float d = a3dPhotometricFetch(source, dimensions.x, secondRow + vertical.high);
  float first = a + (b - a) * vertical.weight;
  float second = c + (d - c) * vertical.weight;
  return (first + (second - first) * horizontal.weight) * scaleRotation.x;
}

float a3dPhotometricCandela(highp sampler2D source, ivec4 offsetsAndVerticalCount,
                             ivec2 horizontalCountAndSymmetry, vec2 scaleRotation,
                             vec3 lightToPoint, vec3 lightForward) {
  // Scale before normalization so finite, large/small directions do not
  // overflow/underflow a dot product. Invalid or zero vectors emit no light.
  float pointScale = max(max(abs(lightToPoint.x), abs(lightToPoint.y)), abs(lightToPoint.z));
  float forwardScale = max(max(abs(lightForward.x), abs(lightForward.y)), abs(lightForward.z));
  if (!(pointScale > 0.0) || !(forwardScale > 0.0)) return 0.0;
  vec3 pointUnit = lightToPoint / pointScale;
  vec3 forwardUnit = lightForward / forwardScale;
  float pointLength = length(pointUnit);
  float forwardLength = length(forwardUnit);
  if (!(pointLength > 0.0) || !(forwardLength > 0.0)) return 0.0;
  pointUnit /= pointLength;
  forwardUnit /= forwardLength;
  vec3 reference = abs(forwardUnit.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 right = normalize(cross(forwardUnit, reference));
  vec3 up = normalize(cross(right, forwardUnit));
  float x = dot(pointUnit, right);
  float y = dot(pointUnit, up);
  float azimuth = (x == 0.0 && y == 0.0) ? 0.0 : atan(y, x);
  float vertical = acos(clamp(dot(pointUnit, forwardUnit), -1.0, 1.0));
  return a3dPhotometricSampleAngles(source, offsetsAndVerticalCount, horizontalCountAndSymmetry,
                                    scaleRotation, vertical * 57.29577951308232,
                                    azimuth * 57.29577951308232);
}
`;
