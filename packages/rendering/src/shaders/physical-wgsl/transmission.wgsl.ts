/**
 * Aura screen-space transmission in WGSL. The scene-color texture is supplied
 * by the caller; its mip chain provides rough transmission. The optional
 * Catmull–Rom reconstruction is evaluated from its piecewise cubic basis.
 */
const wgsl = /* wgsl */ `
struct A3DPrd04TransmissionUniforms {
  transmissionSamplerSize: vec2f,
  modelMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f,
}

@group(1) @binding(30) var<uniform> a3d_prd04_transmission: A3DPrd04TransmissionUniforms;
@group(1) @binding(31) var a3d_prd04_transmissionTex: texture_2d<f32>;
@group(1) @binding(32) var a3d_prd04_transmissionSmp: sampler;

// Pipeline creation can enable cubic reconstruction without changing bindings.
override a3dPrd04TransmissionBicubic: bool = false;

fn a3dPrd04CubicWeight(offset: f32) -> f32 {
  let x = abs(offset);
  if (x < 1.0) { return 1.5 * x * x * x - 2.5 * x * x + 1.0; }
  if (x < 2.0) { return -0.5 * x * x * x + 2.5 * x * x - 4.0 * x + 2.0; }
  return 0.0;
}

fn a3dPrd04SampleCubicLevel(uv: vec2f, level: f32) -> vec4f {
  let highest = f32(textureNumLevels(a3d_prd04_transmissionTex) - 1u);
  let mip = clamp(floor(level), 0.0, highest);
  let size = vec2f(textureDimensions(a3d_prd04_transmissionTex, u32(mip)));
  let pixel = uv * size - vec2f(0.5);
  let origin = floor(pixel);
  let fraction = pixel - origin;
  var result = vec4f(0.0);
  for (var y: i32 = -1; y <= 2; y += 1) {
    for (var x: i32 = -1; x <= 2; x += 1) {
      let sampleUv = (origin + vec2f(f32(x), f32(y)) + vec2f(0.5)) / size;
      let weight = a3dPrd04CubicWeight(f32(x) - fraction.x)
        * a3dPrd04CubicWeight(f32(y) - fraction.y);
      result += textureSampleLevel(a3d_prd04_transmissionTex, a3d_prd04_transmissionSmp,
        sampleUv, mip) * weight;
    }
  }
  return result;
}

fn a3dVolumeTransmissionRay(n: vec3f, v: vec3f, thickness: f32, ior: f32, modelMatrix: mat4x4f) -> vec3f {
  let normalLength = length(n);
  if (normalLength <= 1e-6 || thickness <= 0.0) { return vec3f(0.0); }
  var direction = refract(-v, n / normalLength, 1.0 / max(ior, 1e-4));
  let rayLength = length(direction);
  if (rayLength <= 1e-6) { return vec3f(0.0); }
  direction /= rayLength;

  // Inverse-transform a unit world ray without assuming uniform model scale.
  // For a column matrix [a b c], its inverse rows are cross(b,c),
  // cross(c,a), cross(a,b), divided by the scalar triple product.
  let a = modelMatrix[0].xyz;
  let b = modelMatrix[1].xyz;
  let c = modelMatrix[2].xyz;
  let row0 = cross(b, c);
  let row1 = cross(c, a);
  let row2 = cross(a, b);
  let determinantModel = dot(a, row0);
  if (abs(determinantModel) <= 1e-8) { return vec3f(0.0); }
  let localRay = vec3f(dot(row0, direction), dot(row1, direction), dot(row2, direction)) / determinantModel;
  return direction * (thickness / max(length(localRay), 1e-6));
}

fn a3dApplyIorToRoughness(roughness: f32, ior: f32) -> f32 {
  return clamp(roughness, 0.0, 1.0) * clamp((ior - 1.0) * 2.0, 0.0, 1.0);
}

fn a3dPrd04TransmissionLevel(roughness: f32, ior: f32) -> f32 {
  let size = a3d_prd04_transmission.transmissionSamplerSize;
  let sizeLevel = max(log2(max(max(size.x, size.y), 1.0)), 0.0);
  let availableLevel = f32(textureNumLevels(a3d_prd04_transmissionTex) - 1u);
  return min(sizeLevel * a3dApplyIorToRoughness(roughness, ior), availableLevel);
}

fn a3dTransmissionSampleBicubic(uv: vec2f, roughness: f32, ior: f32) -> vec4f {
  let level = a3dPrd04TransmissionLevel(roughness, ior);
  let low = floor(level);
  let high = min(low + 1.0, f32(textureNumLevels(a3d_prd04_transmissionTex) - 1u));
  return mix(a3dPrd04SampleCubicLevel(uv, low), a3dPrd04SampleCubicLevel(uv, high), fract(level));
}

fn a3dTransmissionSample(uv: vec2f, roughness: f32, ior: f32) -> vec4f {
  if (a3dPrd04TransmissionBicubic) {
    return a3dTransmissionSampleBicubic(uv, roughness, ior);
  }
  return textureSampleLevel(a3d_prd04_transmissionTex, a3d_prd04_transmissionSmp, uv,
    a3dPrd04TransmissionLevel(roughness, ior));
}

fn a3dTransmissionCoords(exitPosition: vec3f, viewMatrix: mat4x4f, projectionMatrix: mat4x4f) -> vec2f {
  let clip = projectionMatrix * viewMatrix * vec4f(exitPosition, 1.0);
  var divisor = clip.w;
  if (abs(divisor) <= 1e-6) {
    divisor = select(1e-6, -1e-6, divisor < 0.0);
  }
  return clip.xy / divisor * 0.5 + vec2f(0.5);
}

fn a3dGetIBLVolumeRefraction(n: vec3f, v: vec3f, roughness: f32, diffuseColor: vec3f,
  specularColor: vec3f, specularF90: f32, position: vec3f, modelMatrix: mat4x4f,
  ior: f32, thickness: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec4f {
  let ray = a3dVolumeTransmissionRay(n, v, thickness, ior, modelMatrix);
  let uv = a3dTransmissionCoords(position + ray, a3d_prd04_transmission.viewMatrix,
    a3d_prd04_transmission.projectionMatrix);
  let scene = a3dTransmissionSample(uv, roughness, ior);
  let transmittance = clamp(diffuseColor, vec3f(0.0), vec3f(1.0))
    * a3dVolumeAttenuation(length(ray), attenuationColor, attenuationDistance);
  let reflectance = a3dPrd04EnvironmentBRDF(n, v, specularColor, specularF90, roughness);
  let opacity = 1.0 - (1.0 - clamp(scene.a, 0.0, 1.0))
    * dot(transmittance, vec3f(1.0 / 3.0));
  return vec4f((vec3f(1.0) - reflectance) * transmittance * scene.rgb, opacity);
}
`;

export const A3D_PRD04_TRANSMISSION_WGSL = wgsl;
export default wgsl;
