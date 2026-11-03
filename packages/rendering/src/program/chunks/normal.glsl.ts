/**
 * `normal` chunk — shading-normal helpers for generated programs.
 * `FLAT_SHADING` derives the geometric normal with dFdx/dFdy; normal maps use
 * the tangent frame (a_tangent when present, else the screen-space derivative
 * fallback used by three.js perturbNormal2Arb).
 */

export const NORMAL_CHUNK_GLSL = /* glsl */ `
vec3 a3dFlatNormal(vec3 pos) {
  vec3 fdx = dFdx(pos);
  vec3 fdy = dFdy(pos);
  return normalize(cross(fdx, fdy));
}

#ifdef USE_NORMAL_MAP
uniform sampler2D u_normalMap;
uniform float u_normalScale;
// three r185 perturbNormal2Arb: screen-space derivative tangent frame.
// The source note above records the prior fallback. This implementation solves
// the transformed UV Jacobian directly. T and B follow increasing U and V;
// the caller supplies a surface normal already oriented for the current face.
vec3 a3dTangentNormal(vec3 pos, vec3 surfaceNormal, vec2 mapUv) {
  // Keep derivatives and the implicit-LOD sample outside all divergent branches.
  vec3 positionX = dFdx(pos);
  vec3 positionY = dFdy(pos);
  vec2 uvX = dFdx(mapUv);
  vec2 uvY = dFdy(mapUv);
  vec3 sampled = texture(u_normalMap, mapUv).xyz * 2.0 - 1.0;

  float normalMagnitude = max(max(abs(surfaceNormal.x), abs(surfaceNormal.y)), abs(surfaceNormal.z));
  if (!(normalMagnitude > 0.0)) return vec3(0.0, 0.0, 1.0);
  vec3 normal = surfaceNormal / normalMagnitude;
  normal *= inversesqrt(dot(normal, normal));

  // Relative conditioning is unchanged by a uniform UV scale, including tiny
  // but valid scales. A rank-deficient mapping has no defined tangent frame.
  float uvMagnitudeX = max(abs(uvX.x), abs(uvX.y));
  float uvMagnitudeY = max(abs(uvY.x), abs(uvY.y));
  if (!(uvMagnitudeX > 0.0) || !(uvMagnitudeY > 0.0)) return normal;
  vec2 conditionedX = uvX / uvMagnitudeX;
  vec2 conditionedY = uvY / uvMagnitudeY;
  float determinantUv = conditionedX.x * conditionedY.y - conditionedX.y * conditionedY.x;
  float derivativeProduct = length(conditionedX) * length(conditionedY);
  if (!(derivativeProduct > 0.0) || abs(determinantUv) <= 0.000001 * derivativeProduct) return normal;

  // The determinant sign is sufficient here because only directions are used.
  float orientation = determinantUv < 0.0 ? -1.0 : 1.0;
  // Scale each numerator independently, so a small valid UV axis is not lost
  // merely because the other axis is much larger.
  float tangentUvMagnitude = max(abs(uvY.y), abs(uvX.y));
  float bitangentUvMagnitude = max(abs(uvX.x), abs(uvY.x));
  if (!(tangentUvMagnitude > 0.0) || !(bitangentUvMagnitude > 0.0)) return normal;
  vec3 tangentRaw = (positionX * (uvY.y / tangentUvMagnitude)
    - positionY * (uvX.y / tangentUvMagnitude)) * orientation;
  vec3 bitangentRaw = (positionY * (uvX.x / bitangentUvMagnitude)
    - positionX * (uvY.x / bitangentUvMagnitude)) * orientation;
  float tangentMagnitude = max(max(abs(tangentRaw.x), abs(tangentRaw.y)), abs(tangentRaw.z));
  float bitangentMagnitude = max(max(abs(bitangentRaw.x), abs(bitangentRaw.y)), abs(bitangentRaw.z));
  if (!(tangentMagnitude > 0.0) || !(bitangentMagnitude > 0.0)) return normal;
  vec3 tangentCandidate = tangentRaw / tangentMagnitude;
  vec3 tangentPlane = tangentCandidate - normal * dot(normal, tangentCandidate);
  float tangentLengthSquared = dot(tangentPlane, tangentPlane);
  if (!(tangentLengthSquared > 0.000000000001)) return normal;
  vec3 tangent = tangentPlane * inversesqrt(tangentLengthSquared);
  vec3 bitangentAxis = cross(normal, tangent);
  vec3 bitangentDirection = bitangentRaw / bitangentMagnitude;
  float handedness = dot(bitangentAxis, bitangentDirection);
  if (abs(handedness) <= 0.000001 * length(bitangentDirection)) return normal;
  vec3 bitangent = bitangentAxis * (handedness < 0.0 ? -1.0 : 1.0);

  sampled.xy *= u_normalScale;
  float sampleMagnitude = max(max(abs(sampled.x), abs(sampled.y)), abs(sampled.z));
  if (!(sampleMagnitude > 0.0)) return normal;
  sampled /= sampleMagnitude;
  vec3 mapped = tangent * sampled.x + bitangent * sampled.y + normal * sampled.z;
  float mappedMagnitude = max(max(abs(mapped.x), abs(mapped.y)), abs(mapped.z));
  if (!(mappedMagnitude > 0.0)) return normal;
  mapped /= mappedMagnitude;
  return mapped * inversesqrt(dot(mapped, mapped));
}
#endif
`;
