/**
 * Load-only consumer of VoxelIndirectLighting.renderData(). `levels` contains
 * at most seven vec4s (dimensions xyz, flat-texel offset), with scale 2^level.
 * The caller validates the complete pyramid, bounds, quality limits and live
 * RGBA32F 2D resource before invoking this function. Texels contain linear
 * radiance premultiplied by opacity; no hardware float filtering is required.
 *
 * Matches the bounded CPU hemisphere-cone approximation, including weighted
 * odd-sized mip-cell centers, anisotropic cells and front-to-back composition.
 * The result converts unit-albedo exit radiance to irradiance (E = pi * L).
 * Its alpha is an independent spatial influence, not voxel opacity.
 */
export const NATIVE_VOXEL_GLSL = /* glsl */ `
vec4 a3dNativeVoxelLoad(sampler2D source, ivec3 index, vec4 level) {
  ivec3 dims = ivec3(level.xyz);
  int flatIndex = int(level.w) + ((index.z * dims.y + index.y) * dims.x + index.x);
  int width = textureSize(source, 0).x;
  return texelFetch(source, ivec2(flatIndex % width, flatIndex / width), 0);
}

float a3dNativeVoxelCenter(int index, float scale, int resolution) {
  return (float(index) * scale + min(float(index + 1) * scale, float(resolution))) * 0.5;
}

vec4 a3dNativeVoxelLevel(sampler2D source, vec3 point, vec3 boundsMin, vec3 boundsMax,
                          ivec3 resolution, vec4 level, int levelIndex) {
  ivec3 dims = ivec3(level.xyz);
  float scale = exp2(float(levelIndex));
  vec3 p = (point - boundsMin) / (boundsMax - boundsMin) * vec3(resolution);
  ivec3 lo = ivec3(0), hi = ivec3(0);
  vec3 f = vec3(0.0);
  for (int axis = 0; axis < 3; axis += 1) {
    int last = dims[axis] - 1;
    if (last == 0 || p[axis] <= a3dNativeVoxelCenter(0, scale, resolution[axis])) {
      lo[axis] = 0; hi[axis] = 0;
    } else if (p[axis] >= a3dNativeVoxelCenter(last, scale, resolution[axis])) {
      lo[axis] = last; hi[axis] = last;
    } else {
      int raw = clamp(int(floor(p[axis] / scale - 0.5)), 0, last - 1);
      lo[axis] = raw; hi[axis] = raw + 1;
      float first = a3dNativeVoxelCenter(raw, scale, resolution[axis]);
      float second = a3dNativeVoxelCenter(raw + 1, scale, resolution[axis]);
      f[axis] = (p[axis] - first) / (second - first);
    }
  }
  vec4 a = mix(a3dNativeVoxelLoad(source, ivec3(lo.x, lo.y, lo.z), level), a3dNativeVoxelLoad(source, ivec3(hi.x, lo.y, lo.z), level), f.x);
  vec4 b = mix(a3dNativeVoxelLoad(source, ivec3(lo.x, hi.y, lo.z), level), a3dNativeVoxelLoad(source, ivec3(hi.x, hi.y, lo.z), level), f.x);
  vec4 c = mix(a3dNativeVoxelLoad(source, ivec3(lo.x, lo.y, hi.z), level), a3dNativeVoxelLoad(source, ivec3(hi.x, lo.y, hi.z), level), f.x);
  vec4 d = mix(a3dNativeVoxelLoad(source, ivec3(lo.x, hi.y, hi.z), level), a3dNativeVoxelLoad(source, ivec3(hi.x, hi.y, hi.z), level), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

vec3 a3dNativeVoxelCone(sampler2D source, vec3 origin, vec3 direction, vec3 boundsMin, vec3 boundsMax,
                        ivec3 resolution, vec4 levels[7], int levelCount, int maxSteps,
                        float maxDistance, float halfAngle) {
  vec3 cell = (boundsMax - boundsMin) / vec3(resolution);
  direction = normalize(direction);
  float distance = min(maxDistance, min(cell.x, min(cell.y, cell.z)) * 0.5);
  float exitDistance = maxDistance;
  for (int axis = 0; axis < 3; axis += 1) {
    if (abs(direction[axis]) < 1e-12) {
      if (origin[axis] < boundsMin[axis] || origin[axis] > boundsMax[axis]) return vec3(0.0);
    } else {
      float d0 = (boundsMin[axis] - origin[axis]) / direction[axis];
      float d1 = (boundsMax[axis] - origin[axis]) / direction[axis];
      distance = max(distance, min(d0, d1));
      exitDistance = min(exitDistance, max(d0, d1));
    }
  }
  if (distance > exitDistance) return vec3(0.0);
  float base = 1.0 / length(direction / cell);
  float transmittance = 1.0;
  vec3 radiance = vec3(0.0);
  for (int step = 0; step < 128; step += 1) {
    if (step >= maxSteps || distance > exitDistance || transmittance <= 1e-4) break;
    float diameter = max(base, 2.0 * distance * tan(halfAngle));
    float lod = clamp(log2(diameter / base), 0.0, float(levelCount - 1));
    int low = int(floor(lod));
    int high = min(levelCount - 1, low + 1);
    vec3 point = origin + direction * distance;
    vec4 a = a3dNativeVoxelLevel(source, point, boundsMin, boundsMax, resolution, levels[low], low);
    vec4 b = a3dNativeVoxelLevel(source, point, boundsMin, boundsMax, resolution, levels[high], high);
    vec4 sampleValue = mix(a, b, lod - float(low));
    radiance += transmittance * sampleValue.rgb;
    transmittance *= 1.0 - clamp(sampleValue.a, 0.0, 1.0);
    distance += max(base, diameter * 0.5);
  }
  return radiance;
}

vec4 a3dNativeVoxelIrradiance(sampler2D source, vec3 world, vec3 normal, vec3 boundsMin, vec3 boundsMax,
                              ivec3 resolution, vec4 levels[7], int levelCount, int maxSteps,
                              int hemisphereCones, float maxDistance) {
  if (any(lessThan(world, boundsMin)) || any(greaterThan(world, boundsMax))) return vec4(0.0);
  float length2 = dot(normal, normal);
  if (!(length2 > 1e-20)) return vec4(0.0);
  vec3 n = normal * inversesqrt(length2);
  vec3 up = abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, n));
  vec3 bitangent = cross(n, tangent);
  vec3 total = vec3(0.0);
  float weightSum = 0.0;
  for (int cone = 0; cone < 9; cone += 1) {
    if (cone >= hemisphereCones) break;
    float ring = cone == 0 ? 0.0 : 0.7071067811865476;
    float weight = cone == 0 ? 1.0 : 0.7071067811865476;
    float azimuth = 6.283185307179586 * float(cone - 1) / float(max(1, hemisphereCones - 1));
    vec3 direction = n * weight + tangent * (cos(azimuth) * ring) + bitangent * (sin(azimuth) * ring);
    float halfAngle = hemisphereCones == 1 ? 0.7853981633974483 : 0.5235987755982988;
    total += weight * a3dNativeVoxelCone(source, world, direction, boundsMin, boundsMax, resolution,
                                         levels, levelCount, maxSteps, maxDistance, halfAngle);
    weightSum += weight;
  }
  return vec4(3.141592653589793 * total / weightSum, 1.0);
}
`;
