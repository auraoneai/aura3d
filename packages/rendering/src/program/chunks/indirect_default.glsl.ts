/**
 * `indirect_default` chunk — default `fragment:indirect` body helpers.
 *
 * Ambient irradiance is `u_environmentColor * u_environmentIntensity` applied
 * as `irradiance · BRDF_Lambert(diffuseColor)` — the PRD-01 §6.6 1/π ambient
 * (no hemisphere factor). One environment sampler is declared by feature:
 *   - `ENVMAP_TYPE_EQUIRECT`: the renderer's 2D `environmentMapTexture`
 *     (`u_environmentMap`);
 *   - `ENVMAP_TYPE_CUBE_UV` (`environment: "pmrem-cube"`): the renderer's
 *     prefiltered `environmentCubeMapTexture` (`u_environmentCubeMap`). This is
 *     the lane-01 default for cube/PMREM environments; lane 02's C-09 probe
 *     chunk (`a3d_prd02_lighting_ibl`, SH irradiance) can replace it through
 *     a `fragment:indirect` contribution.
 * Both define `A3D_ENV_SAMPLE` and provide `a3dSampleEnvironment(dir, lod)`,
 * which the default indirect body and the C-03 lobe IBL calls use.
 *
 * Both match the flag-off sampling of the same textures (ForwardPass binds
 * them in `applyGeneratedEnvironmentMapUniforms`, #1140):
 *   - equirect: v = 0 at +Y, plus `u_environmentMapRotation` turns on u;
 *   - cube: Y-axis rotation by `u_environmentMapRotation` turns;
 *   - decode: `u_environmentMapEncoding` 0 srgb (hardware-decoded at upload),
 *     1 rgbe, 2 linear.
 * `lod` is on a normalized 0..8 roughness scale (`roughness * 8.0`, the same
 * scale the lane-04 lobe calls use); it is remapped onto the bound texture's
 * real mip range (`u_environmentMapMaxLod`). Diffuse irradiance samples the
 * roughest mip, as the flag-off path does.
 */

export const INDIRECT_DEFAULT_CHUNK_GLSL = /* glsl */ `
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
#ifdef A3D_ENV_SAMPLE
uniform float u_environmentMapIntensity;
uniform float u_environmentMapRotation;
uniform float u_environmentMapMaxLod;
uniform float u_environmentMapEncoding;
vec3 a3dDecodeEnvironment(vec4 texel) {
  if (u_environmentMapEncoding > 0.5 && u_environmentMapEncoding < 1.5) {
    float exponent = texel.a * 255.0;
    float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
    return max(texel.rgb * scale, vec3(0.0));
  }
  return max(texel.rgb, vec3(0.0));
}
float a3dEnvironmentMip(float lod) {
  return clamp(lod, 0.0, 8.0) * (u_environmentMapMaxLod / 8.0);
}
#endif
#if defined(ENVMAP_TYPE_CUBE_UV)
uniform samplerCube u_environmentCubeMap;
vec3 a3dEnvironmentCubeDirection(vec3 direction) {
  float angle = u_environmentMapRotation * 2.0 * PI;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dSampleEnvironment(vec3 direction, float lod) {
  return a3dDecodeEnvironment(textureLod(u_environmentCubeMap, a3dEnvironmentCubeDirection(direction), a3dEnvironmentMip(lod))) * u_environmentMapIntensity;
}
#elif defined(ENVMAP_TYPE_EQUIRECT)
uniform sampler2D u_environmentMap;
vec2 a3dEquirectUv(vec3 direction) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5 + u_environmentMapRotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dSampleEnvironment(vec3 direction, float lod) {
  return a3dDecodeEnvironment(textureLod(u_environmentMap, a3dEquirectUv(direction), a3dEnvironmentMip(lod))) * u_environmentMapIntensity;
}
#endif

// Ambient-only path (§6.6): irradiance · BRDF_Lambert(diffuseColor) — the 1/pi ambient.
vec3 a3dAmbientDiffuse(vec3 diffuseContribution) {
  vec3 irradiance = u_environmentColor * u_environmentIntensity;
  return irradiance * BRDF_Lambert(diffuseContribution);
}

#ifdef LIGHT_HEMISPHERE
// Procedural sky/horizon/ground environment (EnvironmentLightingOptions.proceduralMap),
// the flag-off shader's analytic IBL. Without it, generated programs dropped the
// whole term: scenes lit by a scene-category / parity-preset procedural map lost
// their fill (shadowed and back-facing surfaces went black). Same blends as the
// frozen library; distinct uniform names so the sampled map's
// u_environmentMapIntensity stays independent.
uniform vec3 u_a3dProceduralSkyColor;
uniform vec3 u_a3dProceduralHorizonColor;
uniform vec3 u_a3dProceduralGroundColor;
uniform vec3 u_a3dProceduralSpecularColor;
uniform float u_a3dProceduralIntensity;
uniform float u_a3dProceduralSpecularIntensity;
vec3 a3dProceduralDiffuseRadiance(vec3 n) {
  float skyBlend = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(u_a3dProceduralGroundColor, u_a3dProceduralSkyColor, skyBlend);
  c = mix(c, u_a3dProceduralHorizonColor, clamp(1.0 - abs(n.y), 0.0, 1.0) * 0.55);
  return c * u_a3dProceduralIntensity;
}
vec3 a3dProceduralSpecularRadiance(vec3 r, float roughness) {
  float rough = clamp(roughness, 0.0, 1.0);
  float band = pow(clamp(r.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, rough));
  float response = max(band, mix(0.04, 0.38, rough));
  float horizonStripe = pow(clamp(1.0 - abs(r.y), 0.0, 1.0), mix(14.0, 3.0, rough));
  float sideStripe = pow(clamp(abs(r.x), 0.0, 1.0), mix(10.0, 3.0, rough)) * smoothstep(0.0, 0.72, 1.0 - abs(r.y));
  float overheadStripe = pow(clamp(r.y * 0.5 + 0.5, 0.0, 1.0), mix(22.0, 4.0, rough));
  vec3 c = u_a3dProceduralSpecularColor * response
    + u_a3dProceduralHorizonColor * horizonStripe * 0.42
    + u_a3dProceduralSkyColor * overheadStripe * 0.28
    + u_a3dProceduralGroundColor * sideStripe * 0.22;
  return c * u_a3dProceduralSpecularIntensity;
}
#endif
`;
