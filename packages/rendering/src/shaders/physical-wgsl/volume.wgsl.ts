/**
 * Aura volume transmission, expressed as Beer–Lambert attenuation: the color
 * specifies transmittance after one attenuation distance. This implementation
 * was authored from that definition and matches the companion GLSL contract.
 */
const wgsl = /* wgsl */ `
fn a3dVolumeAttenuation(pathLength: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec3f {
  // A zero path length transmits all channels, including zero-colored media.
  // The largest finite f32 is indistinguishable from infinity for practical
  // path lengths and also gives an explicit no-attenuation sentinel.
  if (pathLength <= 0.0 || attenuationDistance >= 3.4028234663852886e38) {
    return vec3f(1.0);
  }
  if (attenuationDistance <= 0.0) {
    return vec3f(0.0);
  }
  let color = clamp(attenuationColor, vec3f(0.0), vec3f(1.0));
  let transmittance = pow(max(color, vec3f(1e-8)), vec3f(pathLength / attenuationDistance));
  return select(transmittance, vec3f(0.0), color <= vec3f(0.0));
}

fn a3dPrd04VolumeInit(lobes: ptr<function, A3DPrd04Lobes>, transmissionFactor: f32,
  thicknessFactor: f32, attenuationDistanceFactor: f32, attenuationColorFactor: vec3f,
  transmissionTex: vec4f, thicknessTex: vec4f) {
  (*lobes).transmission = clamp(transmissionFactor * transmissionTex.r, 0.0, 1.0);
  (*lobes).thickness = max(thicknessFactor * thicknessTex.g, 0.0);
  (*lobes).attenuationDistance = attenuationDistanceFactor;
  (*lobes).attenuationColor = clamp(attenuationColorFactor, vec3f(0.0), vec3f(1.0));
}
`;

export const A3D_PRD04_VOLUME_WGSL = wgsl;
export default wgsl;
