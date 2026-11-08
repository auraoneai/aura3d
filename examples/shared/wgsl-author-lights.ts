/**
 * WGSL halves of the `material.custom` author lighting chunks (`a3d_scene`, `a3d_shadow`, `a3d_lights`), for the hand-written
 * WebGPU twins of ports whose GLSL includes them (Craterline GP). Each function is the GLSL chunk in
 * packages/rendering/src/shaders/chunks/author/{shadow,lights}.glsl.ts line for line, over the same forward-pass bindings
 * (`aura.u_a3d*`, `aura.u_shadowMap*`, `aura.u_lightCount` / `aura.u_lightData`). WebGL2 never reads these: it keeps drawing
 * the GLSL, so its pixels are unchanged.
 *
 * Differences, all inherent to WebGPU:
 *   - The shadow-map tap flips v (WebGPU textures have a top-left origin), as the other shadowed twins do.
 *   - `a3dDirect` reads the packed direct lights only (up to 16, `u_lightData`). A scene with more than 16 direct lights
 *     switches the GLSL to the clustered lists (`u_cluster*` textures), which this chunk does not read; the ports that use
 *     it carry at most seven lights, so the clustered branch never runs for them.
 *   - The 4-argument `a3dDirect` (world position from `gl_FragCoord`) is not provided: the twins pass their world position.
 */

/** `a3d_scene` (hemisphere light, scene fog) and the adapter's vector `pow` wrappers. */
export const WGSL_A3D_SCENE = /* wgsl */ `
fn a3dPow2(x: vec2<f32>, y: vec2<f32>) -> vec2<f32> { return pow(max(abs(x), vec2<f32>(1e-30)), y); }
fn a3dPow3(x: vec3<f32>, y: vec3<f32>) -> vec3<f32> { return pow(max(abs(x), vec3<f32>(1e-30)), y); }
fn a3dSunRadiance() -> vec3<f32> {
  return aura.u_a3dSunColor * max(aura.u_a3dSunIntensity, 0.0);
}
fn a3dHemiLight(n: vec3<f32>) -> vec3<f32> {
  let up = clamp(n.y / max(length(n), 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  return mix(aura.u_a3dHemiGround, aura.u_a3dHemiSky, vec3<f32>(up));
}
fn a3dSceneFog(color: vec3<f32>, viewDistance: f32) -> vec3<f32> {
  let x = max(aura.u_a3dFogDensity, 0.0) * max(viewDistance, 0.0);
  return mix(color, aura.u_a3dFogColor, vec3<f32>(1.0 - exp(-x * x)));
}
`;

/** `a3d_shadow`: `a3dSunShadow` / `a3dSunShadowAuto` over the key light's shadow map (requires WGSL_A3D_SCENE). */
export const WGSL_A3D_SHADOW = /* wgsl */ `
fn a3dSunShadow(worldPosition: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> f32 {
  if (aura.u_shadowMapEnabled < 0.5) { return 1.0; }
  let receiverNormal = normal / max(length(normal), 0.0001);
  let receiverLightDirection = toLight / max(length(toLight), 0.0001);
  let lightPosition = aura.u_shadowMapMatrix * vec4<f32>(worldPosition + receiverNormal * aura.u_shadowMapNormalBias, 1.0);
  let projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  let normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  let slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  let slopeTexelBias = slopeTangent * aura.u_shadowMapSlopeBias * max(aura.u_shadowMapTexelSize.x, aura.u_shadowMapTexelSize.y);
  let projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  var shadowed = 0.0;
  var totalWeight = 0.0;
  let sampleCount = clamp(i32(aura.u_shadowPcfSampleCount), 1, 32);
  for (var i = 0; i < 32; i = i + 1) {
    if (i >= sampleCount) { break; }
    let sampleData = aura.u_shadowPcfSamples[u32(i)];
    let weight = max(sampleData.z, 0.0);
    let tapOffset = sampleData.xy * aura.u_shadowMapTexelSize;
    let storedDepth = textureSampleLevel(u_shadowMapTextureTexture, u_shadowMapTextureSampler, vec2<f32>(uv.x + tapOffset.x, 1.0 - uv.y - tapOffset.y), 0.0).r;
    let sampleTexelDistance = max(1.0, length(sampleData.xy));
    let receiverDepth = projectedDepth - aura.u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed = shadowed + select(0.0, 1.0, receiverDepth > storedDepth) * weight;
    totalWeight = totalWeight + weight;
  }
  let occlusion = select(0.0, shadowed / totalWeight, totalWeight > 0.0);
  return mix(1.0, 1.0 - occlusion, clamp(aura.u_shadowMapStrength, 0.0, 1.0));
}
fn a3dSunShadowAuto(worldPosition: vec3<f32>, normal: vec3<f32>) -> f32 {
  return a3dSunShadow(worldPosition, normal, aura.u_a3dSunDirection);
}
`;

/** `a3d_lights`: `a3dDirectLight` and the 5-argument `a3dDirect` over the packed direct lights (requires WGSL_A3D_SHADOW). */
export const WGSL_A3D_LIGHTS = /* wgsl */ `
fn a3dDirectLight(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, radiance: vec3<f32>, albedo: vec3<f32>, roughness: f32) -> vec3<f32> {
  let n = N / max(length(N), 1e-4);
  let v = V / max(length(V), 1e-4);
  let l = L / max(length(L), 1e-4);
  let nDotL = clamp(dot(n, l), 0.0, 1.0);
  let halfVector = v + l;
  let h = halfVector / max(length(halfVector), 1e-4);
  let nDotV = clamp(dot(n, v), 1e-4, 1.0);
  let nDotH = clamp(dot(n, h), 0.0, 1.0);
  let vDotH = clamp(dot(v, h), 0.0, 1.0);
  let alpha = max(clamp(roughness, 0.0, 1.0) * clamp(roughness, 0.0, 1.0), 0.002);
  let alpha2 = alpha * alpha;
  let denom = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
  let distribution = alpha2 / max(3.14159265 * denom * denom, 1e-6);
  let lambdaV = nDotL * sqrt(max(nDotV * nDotV * (1.0 - alpha2) + alpha2, 0.0));
  let lambdaL = nDotV * sqrt(max(nDotL * nDotL * (1.0 - alpha2) + alpha2, 0.0));
  let visibility = 0.5 / max(lambdaV + lambdaL, 1e-5);
  let edge = 1.0 - vDotH;
  let edge2 = edge * edge;
  let fresnel = 0.04 + 0.96 * edge2 * edge2 * edge;
  let diffuse = albedo * (1.0 - fresnel) * 0.31830989;
  return (diffuse + vec3<f32>(distribution * visibility * fresnel)) * radiance * nDotL;
}
fn a3dDirect(N: vec3<f32>, V: vec3<f32>, albedo: vec3<f32>, roughness: f32, worldPos: vec3<f32>) -> vec3<f32> {
  var total = vec3<f32>(0.0);
  let count = min(i32(aura.u_lightCount), 16);
  for (var i = 0; i < 16; i = i + 1) {
    if (i >= count) { break; }
    let base = u32(i * 6);
    let colorIntensity = aura.u_lightData[base];
    let positionRange = aura.u_lightData[base + 1u];
    let directionKind = aura.u_lightData[base + 2u];
    let spotShadow = aura.u_lightData[base + 3u];
    let areaRight = aura.u_lightData[base + 4u];
    let areaUp = aura.u_lightData[base + 5u];
    let kind = directionKind.w;
    if (kind > 2.5) {
      if (areaUp.w < 0.5) { continue; }
      let axis = directionKind.xyz / max(length(directionKind.xyz), 0.0001);
      let r = areaRight.xyz / max(length(areaRight.xyz), 0.0001);
      let u = areaUp.xyz / max(length(areaUp.xyz), 0.0001);
      let width = max(spotShadow.x, 0.0);
      let height = max(spotShadow.y, 0.0);
      for (var sampleIndex = 0; sampleIndex < 4; sampleIndex = sampleIndex + 1) {
        let sampleSign = vec2<f32>(select(1.0, -1.0, sampleIndex == 0 || sampleIndex == 2), select(1.0, -1.0, sampleIndex < 2));
        let samplePosition = positionRange.xyz + 0.28867513459 * (r * width * sampleSign.x + u * height * sampleSign.y);
        let delta = samplePosition - worldPos;
        let distanceToLight = length(delta);
        let l = select(-axis, delta / distanceToLight, distanceToLight > 0.0001);
        let areaRatio = distanceToLight / max(positionRange.w, 0.0001);
        let areaRatio2 = areaRatio * areaRatio;
        let areaWindow = select(clamp(1.0 - areaRatio2 * areaRatio2, 0.0, 1.0), 1.0, positionRange.w <= 0.0);
        let areaGeometry = width * height * 0.25 * abs(dot(axis, -l)) * areaWindow * areaWindow / max(distanceToLight * distanceToLight, 0.01);
        total = total + a3dDirectLight(N, V, l, colorIntensity.rgb * colorIntensity.a * areaGeometry, albedo, roughness);
      }
      continue;
    }
    var lightDirection = -directionKind.xyz;
    var attenuation = 1.0;
    if (kind > 0.5) {
      let toLight = positionRange.xyz - worldPos;
      let distanceToLight = length(toLight);
      lightDirection = select(-directionKind.xyz, toLight / distanceToLight, distanceToLight > 0.0001);
      let ratio = distanceToLight / max(positionRange.w, 0.0001);
      let ratio2 = ratio * ratio;
      var rangeFalloff = select(clamp(1.0 - ratio2 * ratio2, 0.0, 1.0), 1.0, positionRange.w <= 0.0);
      rangeFalloff = rangeFalloff * rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      let fromLight = worldPos - positionRange.xyz;
      let axis = directionKind.xyz / max(length(directionKind.xyz), 1e-4);
      var cone = dot(axis, fromLight / max(length(fromLight), 1e-4));
      if (areaUp.w > 0.5) { cone = abs(cone); }
      let outer = cos(spotShadow.x);
      let inner = cos(spotShadow.x * max(1.0 - spotShadow.y, 0.001));
      attenuation = attenuation * smoothstep(outer, inner, cone);
    }
    if (kind < 0.5 && spotShadow.z > 0.5) { attenuation = attenuation * a3dSunShadow(worldPos, N, lightDirection); }
    total = total + a3dDirectLight(N, V, lightDirection, colorIntensity.rgb * colorIntensity.a * attenuation, albedo, roughness);
  }
  return total;
}
`;
