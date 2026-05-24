export type Vec3 = readonly [number, number, number];

export interface PbrDirectLightInput {
  readonly normal: Vec3;
  readonly viewDirection: Vec3;
  readonly lightDirection: Vec3;
  readonly lightColor: Vec3;
  readonly lightIntensity: number;
  readonly albedo: Vec3;
  readonly metallic: number;
  readonly roughness: number;
  readonly specularFactor?: number;
  readonly specularColorFactor?: Vec3;
}

export interface PbrEnvironmentLightInput {
  readonly normal: Vec3;
  readonly viewDirection: Vec3;
  readonly diffuseIrradiance: Vec3;
  readonly specularRadiance: Vec3;
  readonly albedo: Vec3;
  readonly metallic: number;
  readonly roughness: number;
  readonly specularFactor?: number;
  readonly specularColorFactor?: Vec3;
}

export type PbrPhotometricConformanceCategory =
  | "direct-material-response"
  | "environment-response"
  | "fresnel-response"
  | "specular-extension-response"
  | "caustics-response";

export interface PbrPhotometricConformanceSample {
  readonly id: string;
  readonly category: PbrPhotometricConformanceCategory;
  readonly rgb: Vec3;
  readonly luminance: number;
}

export interface PbrPhotometricConformanceCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly metric: number;
  readonly threshold: number;
}

export interface PbrPhotometricConformanceReport {
  readonly ok: boolean;
  readonly samples: readonly PbrPhotometricConformanceSample[];
  readonly checks: readonly PbrPhotometricConformanceCheck[];
  readonly metrics: {
    readonly sampleCount: number;
    readonly checkCount: number;
    readonly failedCheckCount: number;
    readonly finiteNonNegativeSamples: number;
    readonly directRoughnessDelta: number;
    readonly directMetalDielectricDelta: number;
    readonly environmentMetalDielectricDelta: number;
    readonly grazingFresnelGain: number;
    readonly specularFactorGain: number;
    readonly specularTintRedBias: number;
    readonly irradianceGain: number;
  };
}

export interface PbrTransmissionVolumeInput {
  readonly baseColor: Vec3;
  readonly transmissionFactor?: number;
  readonly diffuseTransmissionFactor?: number;
  readonly diffuseTransmissionColorFactor?: Vec3;
  readonly transmissionFallbackEnergy?: number;
  readonly volumeThicknessFactor?: number;
  readonly volumeAttenuationDistance?: number;
  readonly volumeAttenuationColor?: Vec3;
  readonly ior?: number;
  readonly specularFactor?: number;
  readonly specularColorFactor?: Vec3;
  readonly dispersion?: number;
}

export interface PbrTransmissionVolumeResponse {
  readonly color: Vec3;
  readonly transmitted: Vec3;
  readonly volumeAttenuation: Vec3;
  readonly dispersionTint: Vec3;
  readonly specularLobe: Vec3;
  readonly luminance: number;
}

export interface PbrTransmissionVolumeConformanceReport {
  readonly ok: boolean;
  readonly samples: readonly PbrPhotometricConformanceSample[];
  readonly checks: readonly PbrPhotometricConformanceCheck[];
  readonly metrics: {
    readonly sampleCount: number;
    readonly checkCount: number;
    readonly failedCheckCount: number;
    readonly finiteNonNegativeSamples: number;
    readonly thickGlassAttenuationLoss: number;
    readonly attenuationBlueBias: number;
    readonly diffuseTransmissionGreenBias: number;
    readonly iorSpecularGain: number;
    readonly dispersionRedBlueSpread: number;
  };
}

export interface PbrCausticsTransmissionInput {
  readonly incidentColor: Vec3;
  readonly transmittedColor: Vec3;
  readonly ior: number;
  readonly curvature: number;
  readonly thickness: number;
  readonly roughness: number;
  readonly receiverDistance: number;
  readonly attenuationDistance?: number;
  readonly attenuationColor?: Vec3;
  readonly dispersion?: number;
}

export interface PbrCausticsTransmissionResponse {
  readonly color: Vec3;
  readonly attenuation: Vec3;
  readonly dispersionTint: Vec3;
  readonly footprintRadius: number;
  readonly focusStrength: number;
  readonly peakIntensity: number;
  readonly luminance: number;
}

export interface PbrCausticsConformanceReport {
  readonly ok: boolean;
  readonly samples: readonly PbrPhotometricConformanceSample[];
  readonly checks: readonly PbrPhotometricConformanceCheck[];
  readonly metrics: {
    readonly sampleCount: number;
    readonly checkCount: number;
    readonly failedCheckCount: number;
    readonly finiteNonNegativeSamples: number;
    readonly focusedPeakGain: number;
    readonly roughnessPeakLoss: number;
    readonly focusedFootprintContraction: number;
    readonly attenuationRedBias: number;
    readonly dispersionRedBlueSpread: number;
  };
}

export const PBR_REFERENCE_PI = Math.PI;
export const PBR_REFERENCE_INV_PI = 1 / Math.PI;
export const PBR_REFERENCE_EPSILON = 0.00001;
export const PBR_REFERENCE_MIN_ROUGHNESS = 0.045;

export function pbrSaturate(value: number): number {
  return clampFinite(value, 0, 1);
}

export function pbrFresnelSchlick(f0: Vec3, vDotH: number): Vec3 {
  const f = Math.pow(pbrSaturate(1 - vDotH), 5);
  return add(f0, multiplyScalar(subtract([1, 1, 1], f0), f));
}

export function pbrFresnelSchlickSpecular(f0: Vec3, vDotH: number, specularFactor: number): Vec3 {
  const f = Math.pow(pbrSaturate(1 - vDotH), 5);
  const f90 = Math.max(pbrSaturate(specularFactor), ...f0);
  return add(f0, multiplyScalar(subtract([f90, f90, f90], f0), f));
}

export function pbrFresnelSchlickRoughness(f0: Vec3, nDotV: number, roughness: number): Vec3 {
  const smoothness = 1 - pbrSaturate(roughness);
  return add(f0, multiplyScalar(subtract(maxVec([smoothness, smoothness, smoothness], f0), f0), Math.pow(pbrSaturate(1 - nDotV), 5)));
}

export function pbrFresnelSchlickRoughnessSpecular(f0: Vec3, nDotV: number, roughness: number, specularFactor: number): Vec3 {
  const smoothness = 1 - pbrSaturate(roughness);
  const f90 = Math.max(pbrSaturate(smoothness * specularFactor), ...f0);
  return add(f0, multiplyScalar(subtract([f90, f90, f90], f0), Math.pow(pbrSaturate(1 - nDotV), 5)));
}

export function pbrDistributionGgx(nDotH: number, roughness: number): number {
  let alpha = Math.max(roughness, PBR_REFERENCE_MIN_ROUGHNESS);
  alpha *= alpha;
  const alpha2 = alpha * alpha;
  const nDotH2 = nDotH * nDotH;
  const denom = nDotH2 * (alpha2 - 1) + 1;
  return alpha2 / Math.max(PBR_REFERENCE_PI * denom * denom, PBR_REFERENCE_EPSILON);
}

export function pbrGeometrySmithGgxCorrelated(nDotV: number, nDotL: number, roughness: number): number {
  let alpha = Math.max(roughness, PBR_REFERENCE_MIN_ROUGHNESS);
  alpha *= alpha;
  const alpha2 = alpha * alpha;
  const lambdaV = nDotL * Math.sqrt(Math.max((nDotV - alpha2 * nDotV) * nDotV + alpha2, PBR_REFERENCE_EPSILON));
  const lambdaL = nDotV * Math.sqrt(Math.max((nDotL - alpha2 * nDotL) * nDotL + alpha2, PBR_REFERENCE_EPSILON));
  return 0.5 / Math.max(lambdaV + lambdaL, PBR_REFERENCE_EPSILON);
}

export function pbrDiffuseBurley(nDotV: number, nDotL: number, lDotH: number, roughness: number): number {
  const clampedRoughness = pbrSaturate(roughness);
  const energyBias = mix(0, 0.5, clampedRoughness);
  const energyFactor = mix(1, 1 / 1.51, clampedRoughness);
  const fd90 = energyBias + 2 * lDotH * lDotH * clampedRoughness;
  const lightScatter = 1 + (fd90 - 1) * Math.pow(pbrSaturate(1 - nDotL), 5);
  const viewScatter = 1 + (fd90 - 1) * Math.pow(pbrSaturate(1 - nDotV), 5);
  return lightScatter * viewScatter * energyFactor;
}

export function pbrF0(albedo: Vec3, metallic: number, specularFactor = 1, specularColorFactor: Vec3 = [1, 1, 1]): Vec3 {
  const dielectricF0 = multiply(multiplyScalar([0.04, 0.04, 0.04], pbrSaturate(specularFactor)), clampVec(specularColorFactor));
  return mixVec(dielectricF0, clampVec(albedo), pbrSaturate(metallic));
}

export function pbrDirectLight(input: PbrDirectLightInput): Vec3 {
  const normal = normalize(input.normal);
  const view = normalize(input.viewDirection);
  const light = normalize(input.lightDirection);
  const halfVector = normalize(add(view, light));
  const nDotL = pbrSaturate(dot(normal, light));
  const nDotV = Math.max(pbrSaturate(dot(normal, view)), PBR_REFERENCE_EPSILON);
  const nDotH = pbrSaturate(dot(normal, halfVector));
  const vDotH = pbrSaturate(dot(view, halfVector));
  const lDotH = pbrSaturate(dot(light, halfVector));
  const specularFactor = input.specularFactor ?? 1;
  const specularColorFactor = input.specularColorFactor ?? [1, 1, 1];
  const f0 = pbrF0(input.albedo, input.metallic, specularFactor, specularColorFactor);
  const fresnel = pbrFresnelSchlickSpecular(f0, vDotH, specularFactor);
  const distribution = pbrDistributionGgx(nDotH, input.roughness);
  const geometry = pbrGeometrySmithGgxCorrelated(nDotV, nDotL, input.roughness);
  const specular = multiplyScalar(fresnel, distribution * geometry);
  const kd = multiplyScalar(subtract([1, 1, 1], fresnel), 1 - pbrSaturate(input.metallic));
  const diffuse = multiplyScalar(
    multiply(kd, input.albedo),
    PBR_REFERENCE_INV_PI * pbrDiffuseBurley(nDotV, nDotL, lDotH, input.roughness)
  );
  return multiplyScalar(multiply(add(diffuse, specular), input.lightColor), input.lightIntensity * nDotL);
}

export function pbrEnvironmentLight(input: PbrEnvironmentLightInput): Vec3 {
  const normal = normalize(input.normal);
  const view = normalize(input.viewDirection);
  const nDotV = Math.max(pbrSaturate(dot(normal, view)), PBR_REFERENCE_EPSILON);
  const specularFactor = input.specularFactor ?? 1;
  const specularColorFactor = input.specularColorFactor ?? [1, 1, 1];
  const f0 = pbrF0(input.albedo, input.metallic, specularFactor, specularColorFactor);
  const fresnel = pbrFresnelSchlickRoughnessSpecular(f0, nDotV, input.roughness, specularFactor);
  const kd = multiplyScalar(subtract([1, 1, 1], fresnel), 1 - pbrSaturate(input.metallic));
  const diffuse = multiply(multiply(kd, input.albedo), input.diffuseIrradiance);
  const specular = multiply(input.specularRadiance, fresnel);
  return add(diffuse, specular);
}

export function pbrReferenceLuminance(value: Vec3): number {
  return value[0] * 0.2126 + value[1] * 0.7152 + value[2] * 0.0722;
}

export function pbrReferenceFinite(value: Vec3): boolean {
  return value.every((channel) => Number.isFinite(channel) && channel >= 0);
}

export function pbrPhotometricConformanceSuite(): PbrPhotometricConformanceReport {
  const directBase = {
    normal: [0, 0, 1] as const,
    viewDirection: [0.18, -0.12, 1] as const,
    lightDirection: [-0.32, 0.44, 1] as const,
    lightColor: [1, 0.94, 0.82] as const,
    lightIntensity: 2.75,
    albedo: [0.78, 0.42, 0.18] as const,
  };
  const environmentBase = {
    normal: [0, 0, 1] as const,
    viewDirection: [0.16, 0.1, 1] as const,
    diffuseIrradiance: [0.28, 0.32, 0.38] as const,
    specularRadiance: [1.65, 1.4, 1.12] as const,
    albedo: [0.78, 0.42, 0.18] as const,
  };
  const directDielectricRough = pbrDirectLight({ ...directBase, metallic: 0, roughness: 0.82 });
  const directDielectricSmooth = pbrDirectLight({ ...directBase, metallic: 0, roughness: 0.18 });
  const directMetalRough = pbrDirectLight({ ...directBase, metallic: 1, roughness: 0.82 });
  const directMetalSmooth = pbrDirectLight({ ...directBase, metallic: 1, roughness: 0.18 });
  const environmentDielectric = pbrEnvironmentLight({ ...environmentBase, metallic: 0, roughness: 0.48 });
  const environmentMetal = pbrEnvironmentLight({ ...environmentBase, metallic: 1, roughness: 0.48 });
  const environmentLowIrradiance = pbrEnvironmentLight({
    ...environmentBase,
    diffuseIrradiance: [0.08, 0.09, 0.1],
    specularRadiance: [0.42, 0.38, 0.32],
    metallic: 0,
    roughness: 0.48,
  });
  const environmentHighIrradiance = pbrEnvironmentLight({
    ...environmentBase,
    diffuseIrradiance: [0.48, 0.54, 0.62],
    specularRadiance: [2.2, 1.85, 1.48],
    metallic: 0,
    roughness: 0.48,
  });
  const specularLow = pbrDirectLight({ ...directBase, metallic: 0, roughness: 0.28, specularFactor: 0.18 });
  const specularHigh = pbrDirectLight({ ...directBase, metallic: 0, roughness: 0.28, specularFactor: 1 });
  const specularTinted = pbrDirectLight({
    ...directBase,
    metallic: 0,
    roughness: 0.22,
    specularFactor: 1,
    specularColorFactor: [1, 0.34, 0.16],
  });
  const facingFresnel = pbrFresnelSchlickRoughness([0.04, 0.04, 0.04], 0.92, 0.36);
  const grazingFresnel = pbrFresnelSchlickRoughness([0.04, 0.04, 0.04], 0.18, 0.36);
  const samples: readonly PbrPhotometricConformanceSample[] = [
    sample("direct-dielectric-rough", "direct-material-response", directDielectricRough),
    sample("direct-dielectric-smooth", "direct-material-response", directDielectricSmooth),
    sample("direct-metal-rough", "direct-material-response", directMetalRough),
    sample("direct-metal-smooth", "direct-material-response", directMetalSmooth),
    sample("environment-dielectric-balanced", "environment-response", environmentDielectric),
    sample("environment-metal-balanced", "environment-response", environmentMetal),
    sample("environment-low-irradiance", "environment-response", environmentLowIrradiance),
    sample("environment-high-irradiance", "environment-response", environmentHighIrradiance),
    sample("specular-factor-low", "specular-extension-response", specularLow),
    sample("specular-factor-high", "specular-extension-response", specularHigh),
    sample("specular-color-red-tint", "specular-extension-response", specularTinted),
    sample("fresnel-facing", "fresnel-response", facingFresnel),
    sample("fresnel-grazing", "fresnel-response", grazingFresnel),
  ];
  const finiteNonNegativeSamples = samples.filter((entry) => pbrReferenceFinite(entry.rgb)).length;
  const directRoughnessDelta = Math.abs(pbrReferenceLuminance(directDielectricSmooth) - pbrReferenceLuminance(directDielectricRough));
  const directMetalDielectricDelta = Math.abs(pbrReferenceLuminance(directMetalSmooth) - pbrReferenceLuminance(directDielectricSmooth));
  const environmentMetalDielectricDelta = Math.abs(pbrReferenceLuminance(environmentMetal) - pbrReferenceLuminance(environmentDielectric));
  const grazingFresnelGain = pbrReferenceLuminance(grazingFresnel) - pbrReferenceLuminance(facingFresnel);
  const specularFactorGain = pbrReferenceLuminance(specularHigh) - pbrReferenceLuminance(specularLow);
  const specularTintRedBias = specularTinted[0] - Math.max(specularTinted[1], specularTinted[2]);
  const irradianceGain = pbrReferenceLuminance(environmentHighIrradiance) - pbrReferenceLuminance(environmentLowIrradiance);
  const checks = [
    check("all-samples-finite-non-negative", finiteNonNegativeSamples, samples.length),
    check("direct-roughness-response", directRoughnessDelta, 0.01),
    check("direct-metal-dielectric-response", directMetalDielectricDelta, 0.05),
    check("environment-metal-dielectric-response", environmentMetalDielectricDelta, 0.02),
    check("grazing-fresnel-increases-reflectance", grazingFresnelGain, 0.1),
    check("specular-factor-increases-response", specularFactorGain, 0.0005),
    check("specular-color-factor-tints-response", specularTintRedBias, 0.01),
    check("ibl-irradiance-increases-response", irradianceGain, 0.1),
  ] as const;
  const failedCheckCount = checks.filter((entry) => !entry.passed).length;
  return {
    ok: failedCheckCount === 0,
    samples,
    checks,
    metrics: {
      sampleCount: samples.length,
      checkCount: checks.length,
      failedCheckCount,
      finiteNonNegativeSamples,
      directRoughnessDelta: roundedConformanceMetric(directRoughnessDelta),
      directMetalDielectricDelta: roundedConformanceMetric(directMetalDielectricDelta),
      environmentMetalDielectricDelta: roundedConformanceMetric(environmentMetalDielectricDelta),
      grazingFresnelGain: roundedConformanceMetric(grazingFresnelGain),
      specularFactorGain: roundedConformanceMetric(specularFactorGain),
      specularTintRedBias: roundedConformanceMetric(specularTintRedBias),
      irradianceGain: roundedConformanceMetric(irradianceGain),
    },
  };
}

export function pbrTransmissionVolumeResponse(input: PbrTransmissionVolumeInput): PbrTransmissionVolumeResponse {
  const baseColor = clampVec(input.baseColor);
  const transmission = pbrSaturate(input.transmissionFactor ?? 0);
  const diffuseTransmission = pbrSaturate(input.diffuseTransmissionFactor ?? 0) * (1 - transmission);
  const diffuseTransmissionColorFactor = clampVec(input.diffuseTransmissionColorFactor ?? [1, 1, 1]);
  const volumeThickness = Math.max(input.volumeThicknessFactor ?? 0, 0);
  const volumeAttenuationDistance = Math.max(input.volumeAttenuationDistance ?? 1_000_000, PBR_REFERENCE_EPSILON);
  const volumeTravel = clampFinite(volumeThickness / volumeAttenuationDistance, 0, 16);
  const rawAttenuationColor = input.volumeAttenuationColor ?? [1, 1, 1];
  const attenuationColor = [
    clampFinite(rawAttenuationColor[0], 0.0001, 1),
    clampFinite(rawAttenuationColor[1], 0.0001, 1),
    clampFinite(rawAttenuationColor[2], 0.0001, 1),
  ] as const;
  const volumeAttenuation = [
    Math.pow(attenuationColor[0], volumeTravel),
    Math.pow(attenuationColor[1], volumeTravel),
    Math.pow(attenuationColor[2], volumeTravel),
  ] as const;
  const iorBoost = pbrSaturate(((input.ior ?? 1.5) - 1) / 1.5);
  const baseLuminance = pbrReferenceLuminance(baseColor);
  let transmitted = mixVec(baseColor, [baseLuminance, baseLuminance, baseLuminance], transmission * 0.35);
  transmitted = mixVec(transmitted, diffuseTransmissionColorFactor, diffuseTransmission);
  transmitted = mixVec(transmitted, multiply(transmitted, volumeAttenuation), transmission * pbrSaturate(volumeThickness));
  const fallbackEnergy = pbrSaturate(input.transmissionFallbackEnergy ?? 0.08);
  const fallbackTransmissionEnergy = 1 * (1 - transmission) + fallbackEnergy * transmission;
  const boundedFallbackSpecular = Math.max(fallbackEnergy < 0.079 ? Math.max(0, Math.min(1, fallbackEnergy * 8)) : fallbackEnergy, 0.35);
  const fallbackSpecularEnergy = 1 * (1 - transmission) + boundedFallbackSpecular * transmission;
  transmitted = multiplyScalar(transmitted, fallbackTransmissionEnergy);
  const specularLobe = multiplyScalar(multiply(clampVec(input.specularColorFactor ?? [1, 1, 1]), [1, 1, 1]), pbrSaturate(input.specularFactor ?? 1) * (0.08 + iorBoost * 0.08) * fallbackSpecularEnergy);
  const dispersionAmount = pbrSaturate((input.dispersion ?? 0) / 100) * transmission;
  const dispersionTint = mixVec([1, 1, 1], [1.04, 0.98, 0.94], dispersionAmount);
  const color = maxVec([0, 0, 0], add(multiply(transmitted, dispersionTint), specularLobe));
  return {
    color: roundedVec(color),
    transmitted: roundedVec(transmitted),
    volumeAttenuation: roundedVec(volumeAttenuation),
    dispersionTint: roundedVec(dispersionTint),
    specularLobe: roundedVec(specularLobe),
    luminance: roundedConformanceMetric(pbrReferenceLuminance(color)),
  };
}

export function pbrTransmissionVolumeConformanceSuite(): PbrTransmissionVolumeConformanceReport {
  const clearGlass = pbrTransmissionVolumeResponse({
    baseColor: [0.72, 0.88, 1],
    transmissionFactor: 0.72,
    volumeThicknessFactor: 0.08,
    volumeAttenuationDistance: 8,
    volumeAttenuationColor: [0.94, 0.98, 1],
    ior: 1.45,
  });
  const thickBlueGlass = pbrTransmissionVolumeResponse({
    baseColor: [0.72, 0.88, 1],
    transmissionFactor: 0.72,
    volumeThicknessFactor: 0.9,
    volumeAttenuationDistance: 1.1,
    volumeAttenuationColor: [0.42, 0.68, 1],
    ior: 1.45,
  });
  const diffuseGreenPanel = pbrTransmissionVolumeResponse({
    baseColor: [0.62, 0.82, 0.58],
    transmissionFactor: 0.12,
    diffuseTransmissionFactor: 0.62,
    diffuseTransmissionColorFactor: [0.32, 1, 0.54],
    volumeThicknessFactor: 0.24,
    volumeAttenuationDistance: 2.6,
    volumeAttenuationColor: [0.7, 1, 0.78],
  });
  const lowIor = pbrTransmissionVolumeResponse({
    baseColor: [0.72, 0.88, 1],
    transmissionFactor: 0.65,
    ior: 1.05,
    specularFactor: 1,
  });
  const highIor = pbrTransmissionVolumeResponse({
    baseColor: [0.72, 0.88, 1],
    transmissionFactor: 0.65,
    ior: 2.2,
    specularFactor: 1,
  });
  const dispersed = pbrTransmissionVolumeResponse({
    baseColor: [0.72, 0.88, 1],
    transmissionFactor: 0.8,
    volumeThicknessFactor: 0.28,
    volumeAttenuationDistance: 3,
    volumeAttenuationColor: [0.88, 0.95, 1],
    ior: 1.5,
    dispersion: 42,
  });
  const samples: readonly PbrPhotometricConformanceSample[] = [
    sample("transmission-clear-glass", "specular-extension-response", clearGlass.color),
    sample("transmission-thick-blue-glass", "specular-extension-response", thickBlueGlass.color),
    sample("diffuse-transmission-green-panel", "specular-extension-response", diffuseGreenPanel.color),
    sample("transmission-low-ior", "specular-extension-response", lowIor.color),
    sample("transmission-high-ior", "specular-extension-response", highIor.color),
    sample("transmission-dispersion-prism", "specular-extension-response", dispersed.color),
  ];
  const finiteNonNegativeSamples = samples.filter((entry) => pbrReferenceFinite(entry.rgb)).length;
  const thickGlassAttenuationLoss = clearGlass.luminance - thickBlueGlass.luminance;
  const attenuationBlueBias = thickBlueGlass.volumeAttenuation[2] - thickBlueGlass.volumeAttenuation[0];
  const diffuseTransmissionGreenBias = diffuseGreenPanel.transmitted[1] - Math.max(diffuseGreenPanel.transmitted[0], diffuseGreenPanel.transmitted[2]);
  const iorSpecularGain = pbrReferenceLuminance(highIor.specularLobe) - pbrReferenceLuminance(lowIor.specularLobe);
  const dispersionRedBlueSpread = dispersed.dispersionTint[0] - dispersed.dispersionTint[2];
  const checks = [
    check("all-transmission-samples-finite-non-negative", finiteNonNegativeSamples, samples.length),
    check("volume-thickness-attenuates-luminance", thickGlassAttenuationLoss, 0.04),
    check("attenuation-color-tints-volume", attenuationBlueBias, 0.2),
    check("diffuse-transmission-color-tints-response", diffuseTransmissionGreenBias, 0.08),
    check("ior-increases-specular-lobe", iorSpecularGain, 0.03),
    check("dispersion-tints-transmitted-response", dispersionRedBlueSpread, 0.02),
  ] as const;
  const failedCheckCount = checks.filter((entry) => !entry.passed).length;
  return {
    ok: failedCheckCount === 0,
    samples,
    checks,
    metrics: {
      sampleCount: samples.length,
      checkCount: checks.length,
      failedCheckCount,
      finiteNonNegativeSamples,
      thickGlassAttenuationLoss: roundedConformanceMetric(thickGlassAttenuationLoss),
      attenuationBlueBias: roundedConformanceMetric(attenuationBlueBias),
      diffuseTransmissionGreenBias: roundedConformanceMetric(diffuseTransmissionGreenBias),
      iorSpecularGain: roundedConformanceMetric(iorSpecularGain),
      dispersionRedBlueSpread: roundedConformanceMetric(dispersionRedBlueSpread),
    },
  };
}

export function pbrCausticsTransmissionResponse(input: PbrCausticsTransmissionInput): PbrCausticsTransmissionResponse {
  const incidentColor = clampVec(input.incidentColor);
  const transmittedColor = clampVec(input.transmittedColor);
  const iorContrast = Math.max(input.ior - 1, 0);
  const curvature = Math.max(input.curvature, 0);
  const thickness = Math.max(input.thickness, 0);
  const roughness = pbrSaturate(input.roughness);
  const receiverDistance = Math.max(input.receiverDistance, 0.05);
  const attenuationDistance = Math.max(input.attenuationDistance ?? 1_000_000, PBR_REFERENCE_EPSILON);
  const attenuationTravel = pbrSaturate(thickness / attenuationDistance);
  const attenuation = mixVec([1, 1, 1], clampVec(input.attenuationColor ?? [1, 1, 1]), attenuationTravel);
  const roughnessDamping = 1 / (1 + roughness * 8);
  const focusStrength = pbrSaturate((iorContrast * curvature * thickness * 1.8) / receiverDistance) * roughnessDamping;
  const footprintRadius = Math.max(0.015, receiverDistance / (1 + iorContrast * curvature * thickness * 9)) * (1 + roughness * 3.5);
  const peakIntensity = (1 + focusStrength * 3.8) / Math.max(0.45 + footprintRadius, PBR_REFERENCE_EPSILON);
  const dispersionAmount = pbrSaturate((input.dispersion ?? 0) / 100) * focusStrength;
  const dispersionTint = [1 + dispersionAmount * 0.28, 1, Math.max(0, 1 - dispersionAmount * 0.22)] as const;
  const color = multiplyScalar(multiply(multiply(multiply(incidentColor, transmittedColor), attenuation), dispersionTint), peakIntensity);
  return {
    color: roundedVec(color),
    attenuation: roundedVec(attenuation),
    dispersionTint: roundedVec(dispersionTint),
    footprintRadius: roundedConformanceMetric(footprintRadius),
    focusStrength: roundedConformanceMetric(focusStrength),
    peakIntensity: roundedConformanceMetric(peakIntensity),
    luminance: roundedConformanceMetric(pbrReferenceLuminance(color)),
  };
}

export function pbrCausticsConformanceSuite(): PbrCausticsConformanceReport {
  const diffuseGlass = pbrCausticsTransmissionResponse({
    incidentColor: [1, 0.96, 0.86],
    transmittedColor: [0.86, 0.94, 1],
    ior: 1.08,
    curvature: 0.15,
    thickness: 0.08,
    roughness: 0.16,
    receiverDistance: 1.1,
  });
  const focusedGlass = pbrCausticsTransmissionResponse({
    incidentColor: [1, 0.96, 0.86],
    transmittedColor: [0.86, 0.94, 1],
    ior: 1.62,
    curvature: 1.15,
    thickness: 0.92,
    roughness: 0.02,
    receiverDistance: 0.7,
  });
  const roughGlass = pbrCausticsTransmissionResponse({
    incidentColor: [1, 0.96, 0.86],
    transmittedColor: [0.86, 0.94, 1],
    ior: 1.62,
    curvature: 1.15,
    thickness: 0.92,
    roughness: 0.72,
    receiverDistance: 0.7,
  });
  const amberBlock = pbrCausticsTransmissionResponse({
    incidentColor: [1, 0.96, 0.86],
    transmittedColor: [1, 0.72, 0.3],
    ior: 1.5,
    curvature: 0.82,
    thickness: 1.1,
    roughness: 0.08,
    receiverDistance: 0.82,
    attenuationDistance: 1.1,
    attenuationColor: [1, 0.46, 0.18],
  });
  const dispersedPrism = pbrCausticsTransmissionResponse({
    incidentColor: [1, 0.96, 0.86],
    transmittedColor: [0.86, 0.94, 1],
    ior: 1.58,
    curvature: 1.05,
    thickness: 0.74,
    roughness: 0.04,
    receiverDistance: 0.66,
    dispersion: 48,
  });
  const samples: readonly PbrPhotometricConformanceSample[] = [
    sample("caustic-diffuse-glass", "caustics-response", diffuseGlass.color),
    sample("caustic-focused-glass", "caustics-response", focusedGlass.color),
    sample("caustic-rough-glass", "caustics-response", roughGlass.color),
    sample("caustic-amber-attenuation", "caustics-response", amberBlock.color),
    sample("caustic-dispersed-prism", "caustics-response", dispersedPrism.color),
  ];
  const finiteNonNegativeSamples = samples.filter((entry) => pbrReferenceFinite(entry.rgb)).length;
  const focusedPeakGain = focusedGlass.peakIntensity - diffuseGlass.peakIntensity;
  const roughnessPeakLoss = focusedGlass.peakIntensity - roughGlass.peakIntensity;
  const focusedFootprintContraction = diffuseGlass.footprintRadius - focusedGlass.footprintRadius;
  const attenuationRedBias = amberBlock.color[0] - Math.max(amberBlock.color[1], amberBlock.color[2]);
  const dispersionRedBlueSpread = dispersedPrism.dispersionTint[0] - dispersedPrism.dispersionTint[2];
  const checks = [
    check("all-caustic-samples-finite-non-negative", finiteNonNegativeSamples, samples.length),
    check("curved-transmissive-surface-focuses-energy", focusedPeakGain, 1.5),
    check("surface-roughness-reduces-caustic-peak", roughnessPeakLoss, 1),
    check("focused-caustic-footprint-contracts", focusedFootprintContraction, 0.5),
    check("attenuation-color-tints-caustic", attenuationRedBias, 0.5),
    check("dispersion-splits-caustic-response", dispersionRedBlueSpread, 0.08),
  ] as const;
  const failedCheckCount = checks.filter((entry) => !entry.passed).length;
  return {
    ok: failedCheckCount === 0,
    samples,
    checks,
    metrics: {
      sampleCount: samples.length,
      checkCount: checks.length,
      failedCheckCount,
      finiteNonNegativeSamples,
      focusedPeakGain: roundedConformanceMetric(focusedPeakGain),
      roughnessPeakLoss: roundedConformanceMetric(roughnessPeakLoss),
      focusedFootprintContraction: roundedConformanceMetric(focusedFootprintContraction),
      attenuationRedBias: roundedConformanceMetric(attenuationRedBias),
      dispersionRedBlueSpread: roundedConformanceMetric(dispersionRedBlueSpread),
    },
  };
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function sample(id: string, category: PbrPhotometricConformanceCategory, rgb: Vec3): PbrPhotometricConformanceSample {
  return {
    id,
    category,
    rgb: roundedVec(rgb),
    luminance: roundedConformanceMetric(pbrReferenceLuminance(rgb)),
  };
}

function check(id: string, metric: number, threshold: number): PbrPhotometricConformanceCheck {
  return {
    id,
    metric: roundedConformanceMetric(metric),
    threshold,
    passed: metric >= threshold,
  };
}

function clampVec(value: Vec3): Vec3 {
  return [pbrSaturate(value[0]), pbrSaturate(value[1]), pbrSaturate(value[2])];
}

function mix(left: number, right: number, amount: number): number {
  return left * (1 - amount) + right * amount;
}

function mixVec(left: Vec3, right: Vec3, amount: number): Vec3 {
  return [mix(left[0], right[0], amount), mix(left[1], right[1], amount), mix(left[2], right[2], amount)];
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(left: Vec3, right: Vec3): Vec3 {
  return [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
}

function multiplyScalar(value: Vec3, amount: number): Vec3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function roundedVec(value: Vec3): Vec3 {
  return [roundedConformanceMetric(value[0]), roundedConformanceMetric(value[1]), roundedConformanceMetric(value[2])];
}

function roundedConformanceMetric(value: number): number {
  return Number(value.toFixed(6));
}

function maxVec(left: Vec3, right: Vec3): Vec3 {
  return [Math.max(left[0], right[0]), Math.max(left[1], right[1]), Math.max(left[2], right[2])];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= PBR_REFERENCE_EPSILON) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}
