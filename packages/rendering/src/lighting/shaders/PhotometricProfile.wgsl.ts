/** WGSL counterpart of the independent Type-C measured-candela lookup. */
export const PHOTOMETRIC_PROFILE_WGSL = /* wgsl */ `
struct A3DPhotometricBracket {
  low: i32,
  high: i32,
  weight: f32,
}

fn a3dPhotometricFetch(source: texture_2d<f32>, width: i32, index: i32) -> f32 {
  return textureLoad(source, vec2<i32>(index % width, index / width), 0).r;
}

fn a3dPhotometricRange(offset: i32, count: i32, capacity: i32) -> bool {
  return offset >= 0 && count > 0 && offset <= capacity && count <= capacity - offset;
}

fn a3dPhotometricBracket(source: texture_2d<f32>, width: i32, offset: i32, count: i32, value: f32) -> A3DPhotometricBracket {
  if (count == 1 || value <= a3dPhotometricFetch(source, width, offset)) {
    return A3DPhotometricBracket(0, 0, 0.0);
  }
  let last = count - 1;
  if (value >= a3dPhotometricFetch(source, width, offset + last)) {
    return A3DPhotometricBracket(last, last, 0.0);
  }
  var low = 0;
  var high = last;
  for (var iteration = 0; iteration < 12; iteration += 1) {
    if (high - low <= 1) { break; }
    let middle = low + (high - low) / 2;
    if (a3dPhotometricFetch(source, width, offset + middle) <= value) { low = middle; }
    else { high = middle; }
  }
  let first = a3dPhotometricFetch(source, width, offset + low);
  let second = a3dPhotometricFetch(source, width, offset + high);
  return A3DPhotometricBracket(low, high, (value - first) / (second - first));
}

fn a3dPhotometricSampleAngles(source: texture_2d<f32>, offsetsAndVerticalCount: vec4<i32>,
                               horizontalCountAndSymmetry: vec2<i32>, scaleRotation: vec2<f32>,
                               verticalDegrees: f32, azimuthDegrees: f32) -> f32 {
  let dimensions = vec2<i32>(textureDimensions(source));
  if (dimensions.x <= 0 || dimensions.y <= 0 || dimensions.x > 4096 || dimensions.y > 4096) { return 0.0; }
  let verticalCount = offsetsAndVerticalCount.w;
  let horizontalCount = horizontalCountAndSymmetry.x;
  let symmetry = horizontalCountAndSymmetry.y;
  if (verticalCount <= 0 || verticalCount > 4096 || horizontalCount <= 0 || horizontalCount > 4096 ||
      symmetry < 0 || symmetry > 3 || (symmetry == 0 && horizontalCount != 1) ||
      (symmetry != 0 && horizontalCount < 2) || !(scaleRotation.x >= 0.0)) { return 0.0; }
  if (verticalCount > 1048576 / horizontalCount) { return 0.0; }
  let capacity = dimensions.x * dimensions.y;
  if (!a3dPhotometricRange(offsetsAndVerticalCount.x, verticalCount, capacity) ||
      !a3dPhotometricRange(offsetsAndVerticalCount.y, horizontalCount, capacity) ||
      !a3dPhotometricRange(offsetsAndVerticalCount.z, verticalCount * horizontalCount, capacity)) { return 0.0; }
  if (offsetsAndVerticalCount.y != offsetsAndVerticalCount.x + verticalCount ||
      offsetsAndVerticalCount.z != offsetsAndVerticalCount.y + horizontalCount) { return 0.0; }
  let firstVertical = a3dPhotometricFetch(source, dimensions.x, offsetsAndVerticalCount.x);
  let lastVertical = a3dPhotometricFetch(source, dimensions.x, offsetsAndVerticalCount.x + verticalCount - 1);
  if (!(verticalDegrees >= firstVertical && verticalDegrees <= lastVertical)) { return 0.0; }
  var angle = azimuthDegrees - scaleRotation.y * 57.29577951308232;
  angle -= 360.0 * floor(angle / 360.0);
  if (symmetry == 1) {
    if (angle > 180.0) { angle = 360.0 - angle; }
    if (angle > 90.0) { angle = 180.0 - angle; }
  } else if (symmetry == 2 && angle > 180.0) {
    angle = 360.0 - angle;
  }
  let vertical = a3dPhotometricBracket(source, dimensions.x, offsetsAndVerticalCount.x, verticalCount, verticalDegrees);
  let horizontal = a3dPhotometricBracket(source, dimensions.x, offsetsAndVerticalCount.y, horizontalCount, angle);
  let firstRow = offsetsAndVerticalCount.z + horizontal.low * verticalCount;
  let secondRow = offsetsAndVerticalCount.z + horizontal.high * verticalCount;
  let a = a3dPhotometricFetch(source, dimensions.x, firstRow + vertical.low);
  let b = a3dPhotometricFetch(source, dimensions.x, firstRow + vertical.high);
  let c = a3dPhotometricFetch(source, dimensions.x, secondRow + vertical.low);
  let d = a3dPhotometricFetch(source, dimensions.x, secondRow + vertical.high);
  let first = a + (b - a) * vertical.weight;
  let second = c + (d - c) * vertical.weight;
  return (first + (second - first) * horizontal.weight) * scaleRotation.x;
}

fn a3dPhotometricCandela(source: texture_2d<f32>, offsetsAndVerticalCount: vec4<i32>,
                          horizontalCountAndSymmetry: vec2<i32>, scaleRotation: vec2<f32>,
                          lightToPoint: vec3<f32>, lightForward: vec3<f32>) -> f32 {
  let pointScale = max(max(abs(lightToPoint.x), abs(lightToPoint.y)), abs(lightToPoint.z));
  let forwardScale = max(max(abs(lightForward.x), abs(lightForward.y)), abs(lightForward.z));
  if (!(pointScale > 0.0) || !(forwardScale > 0.0)) { return 0.0; }
  var pointUnit = lightToPoint / pointScale;
  var forwardUnit = lightForward / forwardScale;
  let pointLength = length(pointUnit);
  let forwardLength = length(forwardUnit);
  if (!(pointLength > 0.0) || !(forwardLength > 0.0)) { return 0.0; }
  pointUnit /= pointLength;
  forwardUnit /= forwardLength;
  var reference = vec3<f32>(0.0, 0.0, 1.0);
  if (abs(forwardUnit.y) < 0.99) { reference = vec3<f32>(0.0, 1.0, 0.0); }
  let right = normalize(cross(forwardUnit, reference));
  let up = normalize(cross(right, forwardUnit));
  let x = dot(pointUnit, right);
  let y = dot(pointUnit, up);
  var azimuth = 0.0;
  if (x != 0.0 || y != 0.0) { azimuth = atan2(y, x); }
  let vertical = acos(clamp(dot(pointUnit, forwardUnit), -1.0, 1.0));
  return a3dPhotometricSampleAngles(source, offsetsAndVerticalCount, horizontalCountAndSymmetry,
                                    scaleRotation, vertical * 57.29577951308232,
                                    azimuth * 57.29577951308232);
}
`;
