/** WGSL twin of NATIVE_VOXEL_GLSL; the texture requires no sampler. */
export const NATIVE_VOXEL_WGSL = /* wgsl */ `
fn a3dNativeVoxelLoad(source: texture_2d<f32>, index: vec3i, level: vec4f) -> vec4f {
  let dims = vec3i(level.xyz);
  let flatIndex = i32(level.w) + ((index.z * dims.y + index.y) * dims.x + index.x);
  let width = i32(textureDimensions(source).x);
  return textureLoad(source, vec2i(flatIndex % width, flatIndex / width), 0);
}

fn a3dNativeVoxelCenter(index: i32, scale: f32, resolution: i32) -> f32 {
  return (f32(index) * scale + min(f32(index + 1) * scale, f32(resolution))) * 0.5;
}

fn a3dNativeVoxelLevel(source: texture_2d<f32>, point: vec3f, boundsMin: vec3f, boundsMax: vec3f,
                        resolution: vec3i, level: vec4f, levelIndex: i32) -> vec4f {
  let dims = vec3i(level.xyz);
  let scale = exp2(f32(levelIndex));
  let p = (point - boundsMin) / (boundsMax - boundsMin) * vec3f(resolution);
  var lo = vec3i(0); var hi = vec3i(0);
  var f = vec3f(0.0);
  for (var axis = 0; axis < 3; axis += 1) {
    let last = dims[axis] - 1;
    if (last == 0 || p[axis] <= a3dNativeVoxelCenter(0, scale, resolution[axis])) {
      lo[axis] = 0; hi[axis] = 0;
    } else if (p[axis] >= a3dNativeVoxelCenter(last, scale, resolution[axis])) {
      lo[axis] = last; hi[axis] = last;
    } else {
      let raw = clamp(i32(floor(p[axis] / scale - 0.5)), 0, last - 1);
      lo[axis] = raw; hi[axis] = raw + 1;
      let first = a3dNativeVoxelCenter(raw, scale, resolution[axis]);
      let second = a3dNativeVoxelCenter(raw + 1, scale, resolution[axis]);
      f[axis] = (p[axis] - first) / (second - first);
    }
  }
  let a = mix(a3dNativeVoxelLoad(source, vec3i(lo.x, lo.y, lo.z), level), a3dNativeVoxelLoad(source, vec3i(hi.x, lo.y, lo.z), level), f.x);
  let b = mix(a3dNativeVoxelLoad(source, vec3i(lo.x, hi.y, lo.z), level), a3dNativeVoxelLoad(source, vec3i(hi.x, hi.y, lo.z), level), f.x);
  let c = mix(a3dNativeVoxelLoad(source, vec3i(lo.x, lo.y, hi.z), level), a3dNativeVoxelLoad(source, vec3i(hi.x, lo.y, hi.z), level), f.x);
  let d = mix(a3dNativeVoxelLoad(source, vec3i(lo.x, hi.y, hi.z), level), a3dNativeVoxelLoad(source, vec3i(hi.x, hi.y, hi.z), level), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

fn a3dNativeVoxelCone(source: texture_2d<f32>, origin: vec3f, inputDirection: vec3f, boundsMin: vec3f, boundsMax: vec3f,
                       resolution: vec3i, levels: array<vec4f, 7>, levelCount: i32, maxSteps: i32,
                       maxDistance: f32, halfAngle: f32) -> vec3f {
  let cell = (boundsMax - boundsMin) / vec3f(resolution);
  let direction = normalize(inputDirection);
  var distance = min(maxDistance, min(cell.x, min(cell.y, cell.z)) * 0.5);
  var exitDistance = maxDistance;
  for (var axis = 0; axis < 3; axis += 1) {
    if (abs(direction[axis]) < 1e-12) {
      if (origin[axis] < boundsMin[axis] || origin[axis] > boundsMax[axis]) { return vec3f(0.0); }
    } else {
      let d0 = (boundsMin[axis] - origin[axis]) / direction[axis];
      let d1 = (boundsMax[axis] - origin[axis]) / direction[axis];
      distance = max(distance, min(d0, d1));
      exitDistance = min(exitDistance, max(d0, d1));
    }
  }
  if (distance > exitDistance) { return vec3f(0.0); }
  let base = 1.0 / length(direction / cell);
  var transmittance = 1.0;
  var radiance = vec3f(0.0);
  // A function-local variable permits runtime indexing on older Naga targets.
  var voxelLevels = levels;
  for (var step = 0; step < 128; step += 1) {
    if (step >= maxSteps || distance > exitDistance || transmittance <= 1e-4) { break; }
    let diameter = max(base, 2.0 * distance * tan(halfAngle));
    let lod = clamp(log2(diameter / base), 0.0, f32(levelCount - 1));
    let low = i32(floor(lod));
    let high = min(levelCount - 1, low + 1);
    let point = origin + direction * distance;
    let a = a3dNativeVoxelLevel(source, point, boundsMin, boundsMax, resolution, voxelLevels[low], low);
    let b = a3dNativeVoxelLevel(source, point, boundsMin, boundsMax, resolution, voxelLevels[high], high);
    let sampleValue = mix(a, b, lod - f32(low));
    radiance += transmittance * sampleValue.rgb;
    transmittance *= 1.0 - clamp(sampleValue.a, 0.0, 1.0);
    distance += max(base, diameter * 0.5);
  }
  return radiance;
}

fn a3dNativeVoxelIrradiance(source: texture_2d<f32>, world: vec3f, normal: vec3f, boundsMin: vec3f, boundsMax: vec3f,
                             resolution: vec3i, levels: array<vec4f, 7>, levelCount: i32, maxSteps: i32,
                             hemisphereCones: i32, maxDistance: f32) -> vec4f {
  if (any(world < boundsMin) || any(world > boundsMax)) { return vec4f(0.0); }
  let length2 = dot(normal, normal);
  if (!(length2 > 1e-20)) { return vec4f(0.0); }
  let n = normal * inverseSqrt(length2);
  let up = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(n.y) < 0.9);
  let tangent = normalize(cross(up, n));
  let bitangent = cross(n, tangent);
  var total = vec3f(0.0);
  var weightSum = 0.0;
  for (var cone = 0; cone < 9; cone += 1) {
    if (cone >= hemisphereCones) { break; }
    let ring = select(0.7071067811865476, 0.0, cone == 0);
    let weight = select(0.7071067811865476, 1.0, cone == 0);
    let azimuth = 6.283185307179586 * f32(cone - 1) / f32(max(1, hemisphereCones - 1));
    let direction = n * weight + tangent * (cos(azimuth) * ring) + bitangent * (sin(azimuth) * ring);
    let halfAngle = select(0.5235987755982988, 0.7853981633974483, hemisphereCones == 1);
    total += weight * a3dNativeVoxelCone(source, world, direction, boundsMin, boundsMax, resolution,
                                          levels, levelCount, maxSteps, maxDistance, halfAngle);
    weightSum += weight;
  }
  return vec4f(3.141592653589793 * total / weightSum, 1.0);
}
`;
