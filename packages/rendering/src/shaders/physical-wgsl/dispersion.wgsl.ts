/**
 * Aura three-band refraction. The dispersion control offsets band indices
 * around the base IOR, and every band samples and attenuates its own path.
 * This WGSL implementation follows the independently authored GLSL contract.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04DispersionIors(ior: f32, dispersion: f32) -> vec3f {
  let center = max(ior, 1e-4);
  let spread = max(center - 1.0, 0.0) * 0.025 * max(dispersion, 0.0);
  return max(vec3f(center - spread, center, center + spread), vec3f(1e-4));
}

fn a3dGetIBLVolumeRefractionDispersion(n: vec3f, v: vec3f, roughness: f32, diffuseColor: vec3f,
  specularColor: vec3f, specularF90: f32, position: vec3f, modelMatrix: mat4x4f,
  dispersion: f32, ior: f32, thickness: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec4f {
  let iors = a3dPrd04DispersionIors(ior, dispersion);
  var transmitted = vec3f(0.0);
  var transmittance = vec3f(0.0);
  var alpha = 0.0;
  for (var band: u32 = 0u; band < 3u; band += 1u) {
    let ray = a3dVolumeTransmissionRay(n, v, thickness, iors[band], modelMatrix);
    let uv = a3dTransmissionCoords(position + ray, a3d_prd04_transmission.viewMatrix,
      a3d_prd04_transmission.projectionMatrix);
    let sampleColor = a3dTransmissionSample(uv, roughness, iors[band]);
    let attenuated = clamp(diffuseColor, vec3f(0.0), vec3f(1.0))
      * a3dVolumeAttenuation(length(ray), attenuationColor, attenuationDistance);
    transmitted[band] = sampleColor[band];
    transmittance[band] = attenuated[band];
    alpha += clamp(sampleColor.a, 0.0, 1.0) / 3.0;
  }
  let reflectance = a3dPrd04EnvironmentBRDF(n, v, specularColor, specularF90, roughness);
  let opacity = 1.0 - (1.0 - alpha) * dot(transmittance, vec3f(1.0 / 3.0));
  return vec4f((vec3f(1.0) - reflectance) * transmittance * transmitted, opacity);
}
`;

export const A3D_PRD04_DISPERSION_WGSL = wgsl;
export default wgsl;
