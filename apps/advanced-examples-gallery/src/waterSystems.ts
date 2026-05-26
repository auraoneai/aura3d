import {
  sampleOceanFixture,
  type OceanBuoyancySample,
  type OceanFixturePreset,
  type OceanFoamPatch,
  type OceanWaveDescriptor
} from "@aura3d/rendering";
import { resolveGalleryWaterFrameParameters } from "./showcaseShaders";

export interface WaterRippleInput {
  readonly x: number;
  readonly z: number;
  readonly startedAt: number;
  readonly strength: number;
}

export interface GalleryWaterTelemetry {
  readonly route: "water-lab" | "ocean-observatory";
  readonly source: string;
  readonly sourceFiles?: readonly string[];
  readonly preset: "marina-ripple" | OceanFixturePreset;
  readonly elapsedSeconds: number;
  readonly sampleCount: number;
  readonly activeRippleCount: number;
  readonly waveCount: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly averageHeight: number;
  readonly heightSpan: number;
  readonly averageFoam: number;
  readonly maxFoam: number;
  readonly surfaceRoughness: number;
  readonly motionEvidence: GalleryWaterMotionEvidence;
  readonly waveTelemetry: GalleryWaveTelemetry;
  readonly materialTelemetry: GalleryWaterMaterialTelemetry;
  readonly visualLayerTelemetry: GalleryWaterVisualTelemetry;
  readonly samples: readonly GalleryWaterSample[];
  readonly foamPatches: readonly OceanFoamPatch[];
  readonly buoyancy?: OceanBuoyancySample;
  readonly claimBoundary: string;
  readonly blockedClaims: readonly string[];
  readonly nativeGaps: readonly GalleryWaterNativeGap[];
}

export interface GalleryWaterSample {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly normal: readonly [number, number, number];
  readonly foam: number;
}

export interface GalleryWaveTelemetry {
  readonly samplePattern: "marina-crosshatch" | "gerstner-fixture-transect";
  readonly foamCoverageThreshold: number;
  readonly foamCoverage: number;
  readonly averageSlope: number;
  readonly maxSlope: number;
  readonly normalVariance: number;
  readonly crestCount: number;
  readonly troughCount: number;
  readonly energy: number;
  readonly dominantDirection: readonly [number, number];
  readonly dominantWavelength: number;
  readonly averagePeriod: number;
}

export interface GalleryWaterMotionEvidence {
  readonly method: "same-probe-temporal-delta";
  readonly sampleIntervalSeconds: number;
  readonly probeCount: number;
  readonly meanAbsHeightDelta: number;
  readonly maxAbsHeightDelta: number;
  readonly meanFoamDelta: number;
  readonly maxFoamDelta: number;
  readonly meanNormalAngleDeltaDegrees: number;
  readonly maxNormalAngleDeltaDegrees: number;
  readonly strongestCrestProbeShift: number;
  readonly temporalEnergyDelta: number;
  readonly rippleEvidence?: GalleryRippleMotionEvidence;
}

export interface GalleryRippleMotionEvidence {
  readonly source: "interaction-ripple-equation";
  readonly activeInteractionRippleCount: number;
  readonly proceduralRippleSourceCount: number;
  readonly totalRippleSourceCount: number;
  readonly averageAgeSeconds: number;
  readonly averageRingRadius: number;
  readonly maxRingRadius: number;
  readonly expectedRingExpansion: number;
  readonly injectedRippleEnergy: number;
  readonly ambientRippleEnergy: number;
}

export interface GalleryWaterMaterialTelemetry {
  readonly roughness: number;
  readonly roughnessBand: "glassy" | "balanced" | "wind-roughened";
  readonly foamThreshold: number;
  readonly foamGain: number;
  readonly foamSharpness: number;
  readonly choppiness: number;
  readonly specularIntensity: number;
  readonly causticBandStrength: number;
  readonly shaderDisplacementScale: number;
  readonly normalDetailScale: number;
  readonly fresnelSkyTintStrength: number;
  readonly reflectedHorizonBandStrength: number;
  readonly glintLobeCount: number;
  readonly materialPath: "single-pass-procedural-fresnel-water";
  readonly reflectionApproximation: "fresnel-sky-and-authored-horizon-tint-only";
  readonly refractionApproximation: "depth-tinted-translucency-only";
}

export type GalleryWaterVisualKind =
  | "crest-foam"
  | "shoreline-foam"
  | "specular-glint"
  | "ripple-ring"
  | "wake-line"
  | "spray-card"
  | "horizon-band"
  | "depth-band";

export interface GalleryWaterVisualCue {
  readonly id: string;
  readonly kind: GalleryWaterVisualKind;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly length: number;
  readonly thickness: number;
  readonly rotation: number;
  readonly intensity: number;
  readonly ageSeconds?: number;
}

export type GalleryFloatingObjectKind =
  | "lab-buoy"
  | "lab-skimmer"
  | "lab-service-boat"
  | "ocean-drone"
  | "ocean-buoy";

export interface GalleryFloatingObjectCue {
  readonly id: string;
  readonly kind: GalleryFloatingObjectKind;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly scale: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly intensity: number;
  readonly wakeLength: number;
}

export interface GalleryWaterVisualLayerSet {
  readonly surfaceCues: readonly GalleryWaterVisualCue[];
  readonly floatingObjects: readonly GalleryFloatingObjectCue[];
  readonly telemetry: GalleryWaterVisualTelemetry;
}

export interface GalleryWaterVisualTelemetry {
  readonly surfaceLayerCount: number;
  readonly shorelineFoamCueCount: number;
  readonly crestFoamCueCount: number;
  readonly specularCueCount: number;
  readonly rippleRingCueCount: number;
  readonly wakeCueCount: number;
  readonly sprayCueCount: number;
  readonly depthBandCueCount: number;
  readonly floatingObjectCount: number;
  readonly droneCueCount: number;
  readonly visualEvidenceBoundary: string;
}

export interface GalleryWaterNativeGap {
  readonly system: string;
  readonly currentFallback: string;
  readonly consequence: string;
  readonly evidenceBoundary: string;
}

export interface OceanRouteProfile {
  readonly telemetry: GalleryWaterTelemetry;
  readonly preset: OceanFixturePreset;
  readonly waves: readonly OceanWaveDescriptor[];
  readonly elapsedSeconds: number;
  readonly amplitudeScale: number;
  readonly spatialScale: number;
  readonly surfaceRoughness: number;
  readonly shaderWaveStrength: number;
  readonly materialTelemetry: GalleryWaterMaterialTelemetry;
}

const WATER_NATIVE_GAPS: readonly GalleryWaterNativeGap[] = [
  {
    system: "native GPGPU water heightfield",
    currentFallback: "CPU-sampled procedural ripple field rendered as a dense A3D mesh.",
    consequence: "The route can prove animated interaction ripples and measured foam probes, but not GPU solver parity.",
    evidenceBoundary: "Runtime telemetry reports CPU samples, active ripples, foam coverage, and blocked solver claims."
  },
  {
    system: "planar reflection/refraction water pass",
    currentFallback: "Single-pass translucent material with procedural normals, fresnel sky tint, horizon bands, and authored marina context.",
    consequence: "Specular glints are illustrative shader evidence, not a reflection/refraction renderer.",
    evidenceBoundary: "Material telemetry names fresnel/horizon approximations and keeps planar reflection/refraction blocked."
  },
  {
    system: "shoreline-aware foam simulation",
    currentFallback: "Crest/slope foam probes derived from the procedural height field.",
    consequence: "Foam patches show measurable crests, not physically simulated shoreline accumulation.",
    evidenceBoundary: "Telemetry exposes foamCoverage and foamCoverageThreshold instead of claiming shoreline parity."
  }
];

const OCEAN_NATIVE_GAPS: readonly GalleryWaterNativeGap[] = [
  {
    system: "production WebGPU ocean renderer",
    currentFallback: "WebGL2 procedural Gerstner mesh using deterministic fixture wave descriptors.",
    consequence: "The route can prove layered ocean motion and buoyancy/foam telemetry, but not WebGPU ocean parity.",
    evidenceBoundary: "Runtime telemetry names the fixture source and keeps WebGPU/FFT claims blocked."
  },
  {
    system: "FFT spectrum ocean simulation",
    currentFallback: "Finite Gerstner wave descriptors adapted from the local ocean fixture.",
    consequence: "Wave energy and crest evidence are deterministic samples, not spectral ocean simulation evidence.",
    evidenceBoundary: "waveTelemetry reports wave counts, dominant wavelength, and sample energy."
  },
  {
    system: "screen-space reflection, refraction, caustics, and underwater volume stack",
    currentFallback: "Transparent water shader with roughness-controlled normals, specular lobes, foam, fresnel tint, and caustic bands.",
    consequence: "The material can look richer in screenshots, but cannot claim the missing water-rendering stack.",
    evidenceBoundary: "blockedClaims and nativeGaps must remain present in screenshot JSON."
  }
];

export function evaluateWaterLabHeight(
  x: number,
  z: number,
  time: number,
  ripples: readonly WaterRippleInput[],
  intensity: number
): number {
  const scaledIntensity = Math.max(0, finiteOr(intensity, 1));
  let height = (
    Math.sin(x * 0.72 + time * 1.34) * 0.034
    + Math.sin(z * 1.08 + time * 1.02) * 0.029
    + Math.sin((x * 0.42 + z * 0.86) * 1.15 - time * 0.92) * 0.025
    + Math.sin((-x * 0.74 + z * 0.52) * 1.65 + time * 1.18) * 0.018
    + Math.sin((x * 1.76 - z * 0.44) + time * 1.86) * 0.011
    + Math.sin(x * 3.4 + z * 1.72 + time * 2.7) * 0.007
  ) * scaledIntensity;
  height += evaluateAmbientRipple(x, z, time, [2.1, -1.35], 4.6, 4.3, 0.018) * scaledIntensity;
  height += evaluateAmbientRipple(x, z, time, [-3.15, 1.7], 3.9, 3.65, 0.013) * scaledIntensity;
  height += evaluateShoreReboundWave(x, z, time, 4.74, 0.016) * scaledIntensity;
  height += evaluateShoreReboundWave(x, z, time, -5.05, 0.011) * scaledIntensity;
  for (const ripple of ripples) {
    const age = time - ripple.startedAt;
    if (age < 0 || age > 4.5) continue;
    const distance = Math.hypot(x - ripple.x, z - ripple.z);
    const wake = Math.sin((x - ripple.x) * 2.1 + (z - ripple.z) * 0.74 - age * 3.2)
      * Math.exp(-distance * 0.38)
      * Math.exp(-age * 1.15);
    const ring = Math.sin(distance * 5.5 - age * 5.8) * Math.exp(-distance * 0.6) * Math.exp(-age * 0.8);
    const tightRing = Math.sin(distance * 10.4 - age * 9.25) * Math.exp(-distance * 0.78) * Math.exp(-age * 0.95);
    const outgoingWake = Math.sin(distance * 2.25 - age * 3.05) * Math.exp(-Math.abs(distance - age * 1.05) * 0.72) * Math.exp(-age * 0.52);
    height += (ring * 0.25 + tightRing * 0.068 + wake * 0.06 + outgoingWake * 0.035) * ripple.strength * scaledIntensity;
  }
  return height;
}

export function createWaterLabVisualLayers(options: {
  readonly timeSeconds: number;
  readonly ripples: readonly WaterRippleInput[];
  readonly intensity: number;
  readonly roughness: number;
}): GalleryWaterVisualLayerSet {
  const cues: GalleryWaterVisualCue[] = [];
  const floatingObjects: GalleryFloatingObjectCue[] = [];
  const time = options.timeSeconds;
  const intensity = Math.max(0, finiteOr(options.intensity, 1));
  const roughness = clampNumber(finiteOr(options.roughness, 0.22), 0.03, 0.9);
  const activeRipples = options.ripples.filter((ripple) => {
    const age = time - ripple.startedAt;
    return age >= 0 && age <= 4.5;
  });

  for (let i = 0; i < 18; i += 1) {
    const x = -7.8 + i * 0.74 + Math.sin(i * 1.17 + time * 0.24) * 0.08;
    const nearZ = 4.56 + Math.sin(i * 0.77 + time * 0.18) * 0.18;
    const farZ = -5.03 + Math.cos(i * 0.63 + time * 0.13) * 0.11;
    cues.push(surfaceCue(
      `marina-near-shore-foam-${i}`,
      "shoreline-foam",
      x,
      nearZ,
      evaluateWaterLabHeight(x, nearZ, time, options.ripples, intensity),
      0.48 + hashUnit(i, 5) * 0.52,
      0.018 + hashUnit(i, 7) * 0.025,
      -0.08 + Math.sin(i * 0.4) * 0.18,
      0.48 + (1 - roughness) * 0.24
    ));
    if (i < 12) {
      cues.push(surfaceCue(
        `marina-far-shore-foam-${i}`,
        "shoreline-foam",
        x + 0.16,
        farZ,
        evaluateWaterLabHeight(x + 0.16, farZ, time, options.ripples, intensity),
        0.34 + hashUnit(i, 11) * 0.38,
        0.014 + hashUnit(i, 13) * 0.018,
        0.04 + Math.cos(i * 0.51) * 0.12,
        0.32 + (1 - roughness) * 0.18
      ));
    }
  }

  for (let i = 0; i < 50; i += 1) {
    const column = i % 25;
    const row = Math.floor(i / 25);
    const x = -7.45 + column * 0.62 + Math.sin(i * 2.11 + time * 0.17) * 0.08;
    const z = -4.28 + row * 2.05 + Math.sin(i * 1.31 + time * 0.21) * 0.18;
    const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
    const phase = Math.sin(x * 0.55 - z * 0.28 + time * 0.64);
    cues.push(surfaceCue(
      `marina-specular-glint-${i}`,
      "specular-glint",
      x,
      z,
      h,
      0.16 + hashUnit(i, 19) * 0.68 + Math.max(0, phase) * 0.26,
      0.012 + hashUnit(i, 23) * 0.02,
      -0.28 + Math.sin(time * 0.16 + i * 0.49) * 0.34,
      clampNumber(0.24 + Math.max(0, phase) * 0.42 + (1 - roughness) * 0.22, 0.12, 1.05)
    ));
  }

  for (let i = 0; i < 36; i += 1) {
    const column = i % 18;
    const band = Math.floor(i / 18);
    const x = -7.85 + column * 0.86 + Math.sin(i * 0.9 + time * 0.34) * 0.16;
    const z = -3.05 + band * 2.45 + Math.sin(i * 0.58 + time * 0.62) * 0.52;
    const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
    const rippleFoam = sampleRippleFoam(x, z, time, options.ripples);
    cues.push(surfaceCue(
      `marina-cross-crest-${i}`,
      rippleFoam > 0.12 ? "wake-line" : "crest-foam",
      x,
      z,
      h,
      0.34 + hashUnit(i, 31) * 0.72,
      0.012 + hashUnit(i, 37) * 0.028,
      -0.5 + Math.sin(i * 0.37 + time * 0.2) * 0.34,
      clampNumber(0.26 + rippleFoam * 0.42 + Math.max(0, h) * 3.2, 0.14, 1.2)
    ));
  }

  for (let i = 0; i < 8; i += 1) {
    const x = -6.85 + i * 1.86;
    const z = -5.32 + Math.sin(i * 0.48 + time * 0.12) * 0.12;
    const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
    cues.push(surfaceCue(
      `marina-far-water-depth-band-${i}`,
      "depth-band",
      x,
      z,
      h - 0.006,
      0.68 + hashUnit(i, 101) * 0.8,
      0.022 + hashUnit(i, 103) * 0.035,
      0.02 + Math.sin(i * 0.27) * 0.1,
      0.16 + hashUnit(i, 107) * 0.18
    ));
  }

  const rippleArcSegments = 12;
  for (let sourceIndex = 0; sourceIndex < activeRipples.length; sourceIndex += 1) {
    const ripple = activeRipples[sourceIndex]!;
    const age = time - ripple.startedAt;
    const radius = Math.max(0.1, age * (5.8 / 5.5));
    for (let segment = 0; segment < rippleArcSegments; segment += 1) {
      const a = segment / rippleArcSegments * Math.PI * 2 + time * 0.13;
      const arcRadius = radius + (segment % 3) * 0.08;
      const x = ripple.x + Math.cos(a) * arcRadius;
      const z = ripple.z + Math.sin(a) * arcRadius;
      if (Math.abs(x) > 8.25 || Math.abs(z) > 5.65) continue;
      const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
      cues.push(surfaceCue(
        `interaction-ripple-ring-${sourceIndex}-${segment}`,
        "ripple-ring",
        x,
        z,
        h,
        clampNumber(0.28 + radius * 0.34, 0.28, 1.15),
        0.018 + ripple.strength * 0.006,
        a + Math.PI / 2,
        clampNumber((1 - age / 4.5) * ripple.strength * 0.85, 0.1, 1.15),
        age
      ));
    }
  }

  const ambientSources: readonly [number, number, number][] = [
    [2.1, -1.35, 0.72],
    [-3.15, 1.7, 0.56]
  ];
  for (let sourceIndex = 0; sourceIndex < ambientSources.length; sourceIndex += 1) {
    const [originX, originZ, baseRadius] = ambientSources[sourceIndex]!;
    for (let segment = 0; segment < 4; segment += 1) {
      const a = segment / 4 * Math.PI * 2 + time * 0.18;
      const radius = baseRadius + ((time * 0.22 + segment * 0.13) % 0.42);
      const x = originX + Math.cos(a) * radius;
      const z = originZ + Math.sin(a) * radius;
      const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
      cues.push(surfaceCue(
        `ambient-ripple-ring-${sourceIndex}-${segment}`,
        "ripple-ring",
        x,
        z,
        h,
        0.32 + radius * 0.2,
        0.012,
        a + Math.PI / 2,
        0.24 + sourceIndex * 0.08
      ));
    }
  }

  for (let sourceIndex = 0; sourceIndex < 2; sourceIndex += 1) {
    const originX = [-0.9, 1.65][sourceIndex]!;
    const originZ = [0.35, -1.18][sourceIndex]!;
    const pulseAge = (time * (0.42 + sourceIndex * 0.04) + sourceIndex * 0.28) % 2.8;
    const radius = 0.2 + pulseAge * 0.42;
    for (let segment = 0; segment < 8; segment += 1) {
      const a = segment / 8 * Math.PI * 2 + time * 0.08;
      const x = originX + Math.cos(a) * radius;
      const z = originZ + Math.sin(a) * radius;
      const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
      cues.push(surfaceCue(
        `procedural-ripple-injection-proof-${sourceIndex}-${segment}`,
        "ripple-ring",
        x,
        z,
        h,
        clampNumber(0.2 + radius * 0.36, 0.2, 0.9),
        0.014 + sourceIndex * 0.002,
        a + Math.PI / 2,
        clampNumber(0.46 - pulseAge * 0.08, 0.16, 0.48),
        pulseAge
      ));
    }
  }

  for (let i = 0; i < 14; i += 1) {
    const x = -5.9 + i * 0.86;
    const z = 2.18 + Math.sin(i * 0.82 + time * 0.36) * 0.76;
    const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
    floatingObjects.push(floatingCue(
      `marina-buoy-${i}`,
      "lab-buoy",
      x,
      z,
      h,
      0.68 + hashUnit(i, 41) * 0.32,
      time * 0.14 + i * 0.33,
      Math.sin(time * 1.2 + i) * 0.06,
      Math.cos(time * 1.1 + i * 0.5) * 0.09,
      0.42 + hashUnit(i, 43) * 0.36,
      0.46 + hashUnit(i, 47) * 0.55
    ));
  }

  const skimmers: readonly [number, number, number, GalleryFloatingObjectKind][] = [
    [2.35, 1.45, 0.36, "lab-service-boat"],
    [-4.1, 1.12, -0.2, "lab-skimmer"],
    [4.72, -0.92, -0.54, "lab-skimmer"]
  ];
  for (let i = 0; i < skimmers.length; i += 1) {
    const [baseX, baseZ, headingOffset, kind] = skimmers[i]!;
    const x = baseX + Math.sin(time * (0.16 + i * 0.035) + i) * 0.1;
    const z = baseZ + Math.cos(time * (0.14 + i * 0.025) + i * 0.4) * 0.12;
    const h = evaluateWaterLabHeight(x, z, time, options.ripples, intensity);
    floatingObjects.push(floatingCue(
      `marina-floating-${kind}-${i}`,
      kind,
      x,
      z,
      h,
      i === 0 ? 1.08 : 0.68,
      headingOffset + Math.sin(time * 0.2 + i) * 0.05,
      Math.sin(time * 0.72 + i) * 0.045,
      Math.cos(time * 0.66 + i * 0.8) * 0.055,
      0.74,
      i === 0 ? 1.25 : 0.78
    ));
    for (let lane = 0; lane < 2; lane += 1) {
      const side = lane === 0 ? -1 : 1;
      const wakeX = x - Math.sin(headingOffset) * (0.56 + lane * 0.16) + Math.cos(headingOffset) * side * 0.12;
      const wakeZ = z - Math.cos(headingOffset) * (0.56 + lane * 0.16) - Math.sin(headingOffset) * side * 0.12;
      cues.push(surfaceCue(
        `marina-floating-object-wake-${i}-${lane}`,
        "wake-line",
        wakeX,
        wakeZ,
        evaluateWaterLabHeight(wakeX, wakeZ, time, options.ripples, intensity),
        i === 0 ? 1.05 : 0.72,
        0.016,
        headingOffset + Math.PI * 0.5 + side * 0.22,
        0.42
      ));
    }
  }

  return {
    surfaceCues: cues,
    floatingObjects,
    telemetry: createWaterVisualTelemetry({
      route: "water-lab",
      surfaceLayerCount: 10 + activeRipples.length,
      cues,
      floatingObjects,
      visualEvidenceBoundary: "Runtime foam, glint, depth-band, ripple-ring, and wake cues are geometry driven by the same CPU procedural height field; automated ripple-injection rings are visible proof of the fallback equation and do not claim native GPGPU water, planar reflection, refraction, caustics, or shoreline simulation."
    })
  };
}

export function createOceanVisualLayers(options: {
  readonly profile: OceanRouteProfile;
  readonly timeSeconds: number;
  readonly includePaths: boolean;
  readonly surfaceWorldYOffset?: number;
  readonly surfaceWorldZOffset?: number;
}): GalleryWaterVisualLayerSet {
  const cues: GalleryWaterVisualCue[] = [];
  const floatingObjects: GalleryFloatingObjectCue[] = [];
  const profile = options.profile;
  const time = options.timeSeconds;
  const worldY = finiteOr(options.surfaceWorldYOffset ?? -0.32, -0.32);
  const worldZ = finiteOr(options.surfaceWorldZOffset ?? -13.2, -13.2);
  const windEnergy = clampNumber(profile.shaderWaveStrength * (0.82 + profile.surfaceRoughness), 0.25, 3.2);
  const heightAt = (x: number, z: number) => worldY + evaluateOceanProfileHeight(profile, x, z - worldZ);

  for (let i = 0; i < 30; i += 1) {
    const lane = i - 15;
    const z = -29.0 + i * 0.66;
    const x = Math.sin(i * 0.58 + time * 0.16) * 1.55 + lane * 0.04;
    const h = heightAt(x, z);
    cues.push(surfaceCue(
      `ocean-horizon-reflection-${i}`,
      "horizon-band",
      x,
      z,
      h,
      0.36 + Math.max(0, Math.sin(i * 0.93 + time * 0.34)) * 1.15,
      0.018 + hashUnit(i, 53) * 0.028,
      -0.18 + Math.sin(i * 0.27) * 0.12,
      clampNumber(0.2 + Math.max(0, Math.sin(i * 1.1 + time * 0.2)) * 0.55, 0.14, 1.05)
    ));
  }

  for (let i = 0; i < 32; i += 1) {
    const row = Math.floor(i / 16);
    const col = i % 16;
    const x = -8.15 + col * 1.04 + Math.sin(i * 0.73 + time * 0.24) * 0.22;
    const z = -22.9 + row * 4.2 + Math.cos(i * 0.47 + time * 0.16) * 0.6;
    const h = heightAt(x, z);
    cues.push(surfaceCue(
      `ocean-wind-whitecap-${i}`,
      "crest-foam",
      x,
      z,
      h,
      0.44 + hashUnit(i, 59) * 0.78,
      0.016 + profile.surfaceRoughness * 0.03,
      -0.36 + Math.sin(i * 0.41 + time * 0.12) * 0.24,
      clampNumber(0.22 + windEnergy * 0.18 + Math.max(0, h - worldY) * 0.42, 0.18, 1.25)
    ));
  }

  for (let i = 0; i < profile.telemetry.foamPatches.length; i += 1) {
    const patch = profile.telemetry.foamPatches[i]!;
    const x = patch.x * 7.5 + Math.sin(i * 1.9 + time * 0.18) * 0.45;
    const z = -23.8 + i * 1.08 + patch.z * 2.4;
    const h = heightAt(x, z);
    cues.push(surfaceCue(
      `ocean-measured-foam-${i}`,
      "crest-foam",
      x,
      z,
      h,
      0.36 + patch.radius * 4.8,
      0.016 + patch.radius * 0.18,
      -0.26 + patch.intensity * 0.22,
      clampNumber(0.28 + patch.intensity * 0.58, 0.18, 1.3)
    ));
  }

  for (let i = 0; i < 20; i += 1) {
    const x = -8.4 + i * 0.88;
    const z = 1.86 + Math.sin(i * 0.67 + time * 0.28) * 0.5;
    const h = heightAt(x, z);
    cues.push(surfaceCue(
      `ocean-caisson-spray-${i}`,
      "spray-card",
      x,
      z,
      h + 0.03 + hashUnit(i, 61) * 0.05,
      0.32 + hashUnit(i, 67) * 0.42,
      0.026 + hashUnit(i, 71) * 0.035,
      -0.2 + Math.sin(i * 0.31) * 0.24,
      clampNumber(0.3 + windEnergy * 0.13, 0.18, 1.12)
    ));
  }

  for (let i = 0; i < 24; i += 1) {
    const x = -8.9 + i * 0.75;
    const z = -18.6 + Math.sin(i * 0.42 + time * 0.12) * 3.1;
    const h = heightAt(x, z);
    cues.push(surfaceCue(
      `ocean-specular-shard-${i}`,
      "specular-glint",
      x,
      z,
      h,
      0.24 + hashUnit(i, 73) * 0.72,
      0.012 + hashUnit(i, 79) * 0.016,
      -0.11 + Math.cos(i * 0.36) * 0.2,
      clampNumber(0.2 + (1 - profile.surfaceRoughness) * 0.34 + Math.max(0, Math.sin(i + time * 0.35)) * 0.28, 0.12, 1.08)
    ));
  }

  for (let i = 0; i < 8; i += 1) {
    const x = -7.4 + i * 1.9;
    const z = -8.6 + Math.cos(i * 1.1 + time * 0.2) * 0.85;
    const h = heightAt(x, z);
    floatingObjects.push(floatingCue(
      `ocean-wave-marker-buoy-${i}`,
      "ocean-buoy",
      x,
      z,
      h,
      0.54 + hashUnit(i, 83) * 0.22,
      time * 0.12 + i * 0.51,
      Math.sin(time * 0.82 + i) * 0.08,
      Math.cos(time * 0.74 + i * 0.4) * 0.1,
      0.46 + windEnergy * 0.08,
      0.62 + windEnergy * 0.12
    ));
    cues.push(surfaceCue(
      `ocean-buoy-wake-lane-${i}`,
      "wake-line",
      x - Math.sin(time * 0.12 + i * 0.51) * 0.26,
      z - 0.36,
      h,
      0.42 + windEnergy * 0.16,
      0.014 + profile.surfaceRoughness * 0.018,
      -0.2 + Math.sin(i * 0.32) * 0.18,
      0.28 + windEnergy * 0.08
    ));
  }

  if (options.includePaths) {
    for (let i = 0; i < 4; i += 1) {
      const p = (time * (0.11 + i * 0.015) + i * 0.17) % 1;
      const x = -10.8 + p * 21.6;
      const z = -6.65 - i * 0.82 + Math.sin(time * 0.18 + i) * 0.16;
      floatingObjects.push(floatingCue(
        `ocean-patrol-drone-${i}`,
        "ocean-drone",
        x,
        z,
        1.38 + Math.sin(time * 0.8 + i) * 0.25,
        0.88 + i * 0.05,
        time * (0.72 + i * 0.07),
        Math.sin(time * 0.55 + i) * 0.08,
        0.12 + Math.cos(time * 0.48 + i) * 0.05,
        0.68,
        0.7 + i * 0.08
      ));
      cues.push(surfaceCue(
        `ocean-drone-reflected-path-wake-${i}`,
        "wake-line",
        x - 0.34,
        z + 0.2,
        heightAt(x, z + 0.2),
        0.72 + i * 0.06,
        0.012,
        -0.16 + Math.sin(i) * 0.08,
        0.34
      ));
    }
  }

  for (let i = 0; i < 8; i += 1) {
    const x = -7.2 + i * 2.0;
    const z = -27.2 + Math.sin(i * 0.4 + time * 0.08) * 0.38;
    cues.push(surfaceCue(
      `ocean-atmospheric-depth-band-${i}`,
      "depth-band",
      x,
      z,
      heightAt(x, z) - 0.018,
      0.72 + hashUnit(i, 109) * 1.2,
      0.018 + hashUnit(i, 113) * 0.028,
      -0.08 + Math.sin(i * 0.29) * 0.16,
      0.18 + hashUnit(i, 127) * 0.16
    ));
  }

  return {
    surfaceCues: cues,
    floatingObjects,
    telemetry: createWaterVisualTelemetry({
      route: "ocean-observatory",
      surfaceLayerCount: profile.waves.length + 7,
      cues,
      floatingObjects,
      visualEvidenceBoundary: "Runtime whitecaps, spray cards, depth bands, horizon glints, buoy wakes, and drones are procedural WebGL2 geometry/material cues over finite Gerstner waves; they do not claim WebGPU FFT, screen-space reflection/refraction, caustics, or underwater volume support."
    })
  };
}

export function sampleWaterLabTelemetry(options: {
  readonly timeSeconds: number;
  readonly ripples: readonly WaterRippleInput[];
  readonly intensity: number;
  readonly roughness: number;
}): GalleryWaterTelemetry {
  const samples: GalleryWaterSample[] = [];
  const futureSamples: GalleryWaterSample[] = [];
  const visualLayers = createWaterLabVisualLayers(options);
  const activeRippleCount = options.ripples.filter((ripple) => {
    const age = options.timeSeconds - ripple.startedAt;
    return age >= 0 && age <= 4.5;
  }).length;
  const materialTelemetry = createMaterialTelemetry({
    roughness: options.roughness,
    waveStrength: options.intensity,
    rippleStrength: activeRippleCount > 0 ? 1 : 0
  });
  const roughness = materialTelemetry.roughness;
  const columns = 7;
  const rows = 5;
  const sampleIntervalSeconds = 0.6;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tx = columns <= 1 ? 0 : column / (columns - 1);
      const tz = rows <= 1 ? 0 : row / (rows - 1);
      const x = -6.35 + tx * 12.7 + Math.sin(row * 1.71 + column * 0.43) * 0.12;
      const z = -4.25 + tz * 8.5 + Math.sin(column * 1.37 + row * 0.62) * 0.22;
      samples.push(sampleWaterPoint(x, z, options.timeSeconds, options.ripples, options.intensity, roughness));
      futureSamples.push(sampleWaterPoint(
        x,
        z,
        options.timeSeconds + sampleIntervalSeconds,
        options.ripples,
        options.intensity,
        roughness
      ));
    }
  }
  const foamCoverageThreshold = 0.065;
  const motionEvidence = createMotionEvidence({
    currentSamples: samples,
    futureSamples,
    sampleIntervalSeconds,
    rippleEvidence: createRippleMotionEvidence(options.ripples, options.timeSeconds, sampleIntervalSeconds)
  });
  return createTelemetry({
    route: "water-lab",
    source: "a3d-gallery-cpu-ripple-field",
    sourceFiles: [
      "apps/advanced-examples-gallery/src/waterSystems.ts",
      "apps/advanced-examples-gallery/src/showcaseShaders.ts"
    ],
    preset: "marina-ripple",
    elapsedSeconds: options.timeSeconds,
    samples,
    activeRippleCount,
    waveCount: 7 + activeRippleCount,
    surfaceRoughness: roughness,
    motionEvidence,
    materialTelemetry,
    samplePattern: "marina-crosshatch",
    foamCoverageThreshold,
    dominantDirection: normalize2([0.64, 0.76]),
    dominantWavelength: 6.98,
    averagePeriod: 4.62,
    foamPatches: createFoamPatches(samples, "water-foam", foamCoverageThreshold, 12),
    visualLayerTelemetry: visualLayers.telemetry,
    claimBoundary: "Measured CPU ripple field used by the gallery water mesh. It proves procedural wave/ripple sampling, crest foam telemetry, and shader-material behavior only; it is not a GPGPU heightfield, FFT ocean, reflection, refraction, caustics, or shoreline-foam pipeline.",
    blockedClaims: [
      "GPGPU water solver parity",
      "FFT ocean spectrum parity",
      "planar reflection/refraction water renderer",
      "screen-space caustics parity",
      "shoreline foam simulation"
    ],
    nativeGaps: WATER_NATIVE_GAPS
  });
}

export function createOceanRouteProfile(options: {
  readonly timeSeconds: number;
  readonly mode: string;
  readonly wind: number;
  readonly scale: number;
}): OceanRouteProfile {
  const preset = oceanPresetForMode(options.mode);
  const wind = clampNumber(finiteOr(options.wind, 1.2), 0.08, 2.6);
  const scale = clampNumber(finiteOr(options.scale, 1.1), 0.35, 2.6);
  const elapsedSeconds = options.timeSeconds * wind;
  const fixture = sampleOceanFixture({
    preset,
    seed: 0x0cea6,
    elapsedSeconds,
    sampleCount: 21,
    cameraX: Math.sin(options.timeSeconds * 0.12) * 0.45
  });
  const surfaceRoughness = clampNumber(
    (options.mode === "storm" ? 0.38 : options.mode === "calm" ? 0.14 : 0.24)
      + (wind - 1) * 0.06
      + (scale - 1) * 0.035,
    0.08,
    0.52
  );
  const amplitudeScale = scale * (options.mode === "storm" ? 2.35 : options.mode === "calm" ? 1.35 : 1.82);
  const shaderWaveStrength = scale * (options.mode === "storm" ? 1.55 : options.mode === "calm" ? 0.68 : 1.08);
  const materialTelemetry = createMaterialTelemetry({
    roughness: surfaceRoughness,
    waveStrength: shaderWaveStrength,
    rippleStrength: fixture.maxFoam
  });
  const waveSummary = summarizeWaveDescriptors(fixture.waves);
  const foamCoverageThreshold = 0.09;
  const sampleIntervalSeconds = 0.6;
  const telemetry = createTelemetry({
    route: "ocean-observatory",
    source: fixture.source,
    sourceFiles: fixture.sourceFiles,
    preset,
    elapsedSeconds,
    samples: fixture.samples.map((sample) => ({
      x: sample.x,
      z: sample.z,
      height: round3(sample.height * amplitudeScale + evaluateOceanDetailHeight(sample.x, sample.z, elapsedSeconds, amplitudeScale, shaderWaveStrength, surfaceRoughness)),
      normal: scaleNormalForAmplitude(sample.normal, amplitudeScale),
      foam: round3(clampNumber(sample.foam * (0.76 + materialTelemetry.foamGain * 0.28), 0, 1.45))
    })),
    activeRippleCount: 0,
    waveCount: fixture.waveCount,
    surfaceRoughness,
    motionEvidence: createMotionEvidence({
      currentSamples: fixture.samples.map((sample) => ({
        x: sample.x,
        z: sample.z,
        height: round3(sample.height * amplitudeScale + evaluateOceanDetailHeight(sample.x, sample.z, elapsedSeconds, amplitudeScale, shaderWaveStrength, surfaceRoughness)),
        normal: scaleNormalForAmplitude(sample.normal, amplitudeScale),
        foam: round3(clampNumber(sample.foam * (0.76 + materialTelemetry.foamGain * 0.28), 0, 1.45))
      })),
      futureSamples: sampleOceanTemporalMotion(
        fixture.samples,
        fixture.waves,
        elapsedSeconds + sampleIntervalSeconds * wind,
        amplitudeScale,
        materialTelemetry,
        shaderWaveStrength,
        surfaceRoughness
      ),
      sampleIntervalSeconds,
      rippleEvidence: undefined
    }),
    materialTelemetry,
    samplePattern: "gerstner-fixture-transect",
    foamCoverageThreshold,
    dominantDirection: waveSummary.dominantDirection,
    dominantWavelength: waveSummary.dominantWavelength,
    averagePeriod: waveSummary.averagePeriod,
    foamPatches: enhanceFoamPatches(fixture.foamPatches, materialTelemetry, 10),
    visualLayerTelemetry: createOceanVisualTelemetrySummary(fixture.waves.length, fixture.foamPatches.length, true),
    buoyancy: fixture.buoyancy,
    claimBoundary: `${fixture.claimBoundary} The gallery profile scales those samples into its WebGL2 mesh/material route and does not promote them to WebGPU, FFT, reflection, refraction, caustics, or underwater-volume acceptance.`,
    blockedClaims: fixture.blockedClaims,
    nativeGaps: OCEAN_NATIVE_GAPS
  });
  return {
    telemetry,
    preset,
    waves: fixture.waves,
    elapsedSeconds,
    amplitudeScale,
    spatialScale: 0.09,
    surfaceRoughness,
    shaderWaveStrength,
    materialTelemetry
  };
}

export function evaluateOceanProfileHeight(profile: OceanRouteProfile, x: number, z: number): number {
  const primary = evaluateWaveDescriptors(profile.waves, x * profile.spatialScale, z * profile.spatialScale, profile.elapsedSeconds).height * profile.amplitudeScale;
  return primary + evaluateOceanDetailHeight(x, z, profile.elapsedSeconds, profile.amplitudeScale, profile.shaderWaveStrength, profile.surfaceRoughness);
}

function sampleWaterPoint(
  x: number,
  z: number,
  time: number,
  ripples: readonly WaterRippleInput[],
  intensity: number,
  roughness = 0.22
): GalleryWaterSample {
  const height = evaluateWaterLabHeight(x, z, time, ripples, intensity);
  const step = 0.22;
  const dx = evaluateWaterLabHeight(x + step, z, time, ripples, intensity) - evaluateWaterLabHeight(x - step, z, time, ripples, intensity);
  const dz = evaluateWaterLabHeight(x, z + step, time, ripples, intensity) - evaluateWaterLabHeight(x, z - step, time, ripples, intensity);
  const normal = normalize3([-dx / (step * 2), 1, -dz / (step * 2)]);
  const slope = Math.hypot(dx, dz) / (step * 2);
  const crest = Math.max(0, height);
  const rippleFoam = sampleRippleFoam(x, z, time, ripples);
  const foamSignal = crest * 2.9 + slope * (1.55 + roughness * 2.8) + rippleFoam * 0.26;
  const foam = round3(clampNumber(
    Math.pow(Math.max(0, foamSignal - (0.034 + roughness * 0.018)) * (0.9 + roughness * 1.35), 1.18),
    0,
    1.35
  ));
  return {
    x: round3(x),
    z: round3(z),
    height: round3(height),
    normal,
    foam
  };
}

function createTelemetry(options: {
  readonly route: GalleryWaterTelemetry["route"];
  readonly source: string;
  readonly sourceFiles?: readonly string[];
  readonly preset: GalleryWaterTelemetry["preset"];
  readonly elapsedSeconds: number;
  readonly samples: readonly GalleryWaterSample[];
  readonly activeRippleCount: number;
  readonly waveCount: number;
  readonly surfaceRoughness: number;
  readonly motionEvidence: GalleryWaterMotionEvidence;
  readonly materialTelemetry: GalleryWaterMaterialTelemetry;
  readonly samplePattern: GalleryWaveTelemetry["samplePattern"];
  readonly foamCoverageThreshold: number;
  readonly dominantDirection: readonly [number, number];
  readonly dominantWavelength: number;
  readonly averagePeriod: number;
  readonly foamPatches: readonly OceanFoamPatch[];
  readonly visualLayerTelemetry: GalleryWaterVisualTelemetry;
  readonly buoyancy?: OceanBuoyancySample;
  readonly claimBoundary: string;
  readonly blockedClaims: readonly string[];
  readonly nativeGaps: readonly GalleryWaterNativeGap[];
}): GalleryWaterTelemetry {
  const heights = options.samples.map((sample) => sample.height);
  const foams = options.samples.map((sample) => sample.foam);
  const minHeight = round3(Math.min(...heights));
  const maxHeight = round3(Math.max(...heights));
  const waveTelemetry = createWaveTelemetry({
    samples: options.samples,
    samplePattern: options.samplePattern,
    foamCoverageThreshold: options.foamCoverageThreshold,
    dominantDirection: options.dominantDirection,
    dominantWavelength: options.dominantWavelength,
    averagePeriod: options.averagePeriod
  });
  return {
    route: options.route,
    source: options.source,
    ...(options.sourceFiles ? { sourceFiles: options.sourceFiles } : {}),
    preset: options.preset,
    elapsedSeconds: round3(options.elapsedSeconds),
    sampleCount: options.samples.length,
    activeRippleCount: options.activeRippleCount,
    waveCount: options.waveCount,
    minHeight,
    maxHeight,
    averageHeight: round3(heights.reduce((sum, value) => sum + value, 0) / Math.max(1, heights.length)),
    heightSpan: round3(maxHeight - minHeight),
    averageFoam: round3(foams.reduce((sum, value) => sum + value, 0) / Math.max(1, foams.length)),
    maxFoam: round3(Math.max(...foams)),
    surfaceRoughness: round3(options.surfaceRoughness),
    motionEvidence: options.motionEvidence,
    waveTelemetry,
    materialTelemetry: options.materialTelemetry,
    visualLayerTelemetry: options.visualLayerTelemetry,
    samples: options.samples,
    foamPatches: options.foamPatches,
    ...(options.buoyancy ? { buoyancy: options.buoyancy } : {}),
    claimBoundary: options.claimBoundary,
    blockedClaims: options.blockedClaims,
    nativeGaps: options.nativeGaps
  };
}

function createFoamPatches(samples: readonly GalleryWaterSample[], prefix: string, minFoam: number, limit: number): readonly OceanFoamPatch[] {
  return [...samples]
    .filter((sample) => sample.foam >= minFoam)
    .sort((a, b) => b.foam - a.foam)
    .slice(0, limit)
    .map((sample, index) => ({
      id: `${prefix}-${index}`,
      x: sample.x,
      z: sample.z,
      intensity: sample.foam,
      radius: round3(0.05 + sample.foam * 0.08)
    }));
}

function surfaceCue(
  id: string,
  kind: GalleryWaterVisualKind,
  x: number,
  z: number,
  y: number,
  length: number,
  thickness: number,
  rotation: number,
  intensity: number,
  ageSeconds?: number
): GalleryWaterVisualCue {
  return {
    id,
    kind,
    x: round3(x),
    z: round3(z),
    y: round3(y),
    length: round3(clampNumber(length, 0.03, 2.8)),
    thickness: round3(clampNumber(thickness, 0.006, 0.22)),
    rotation: round3(rotation),
    intensity: round3(clampNumber(intensity, 0, 1.45)),
    ...(ageSeconds !== undefined ? { ageSeconds: round3(ageSeconds) } : {})
  };
}

function floatingCue(
  id: string,
  kind: GalleryFloatingObjectKind,
  x: number,
  z: number,
  y: number,
  scale: number,
  heading: number,
  pitch: number,
  roll: number,
  intensity: number,
  wakeLength: number
): GalleryFloatingObjectCue {
  return {
    id,
    kind,
    x: round3(x),
    z: round3(z),
    y: round3(y),
    scale: round3(clampNumber(scale, 0.12, 2.2)),
    heading: round3(heading),
    pitch: round3(pitch),
    roll: round3(roll),
    intensity: round3(clampNumber(intensity, 0, 1.45)),
    wakeLength: round3(clampNumber(wakeLength, 0.12, 3.4))
  };
}

function createWaterVisualTelemetry(options: {
  readonly route: GalleryWaterTelemetry["route"];
  readonly surfaceLayerCount: number;
  readonly cues: readonly GalleryWaterVisualCue[];
  readonly floatingObjects: readonly GalleryFloatingObjectCue[];
  readonly visualEvidenceBoundary: string;
}): GalleryWaterVisualTelemetry {
  const count = (kind: GalleryWaterVisualKind) => options.cues.filter((cue) => cue.kind === kind).length;
  return {
    surfaceLayerCount: options.surfaceLayerCount,
    shorelineFoamCueCount: count("shoreline-foam"),
    crestFoamCueCount: count("crest-foam"),
    specularCueCount: count("specular-glint") + count("horizon-band"),
    rippleRingCueCount: count("ripple-ring"),
    wakeCueCount: count("wake-line"),
    sprayCueCount: count("spray-card"),
    depthBandCueCount: count("depth-band"),
    floatingObjectCount: options.floatingObjects.length,
    droneCueCount: options.floatingObjects.filter((object) => object.kind === "ocean-drone").length,
    visualEvidenceBoundary: options.visualEvidenceBoundary
  };
}

function createOceanVisualTelemetrySummary(
  waveCount: number,
  measuredFoamPatchCount: number,
  includePaths: boolean
): GalleryWaterVisualTelemetry {
  return {
    surfaceLayerCount: waveCount + 5,
    shorelineFoamCueCount: 0,
    crestFoamCueCount: 32 + measuredFoamPatchCount,
    specularCueCount: 54,
    rippleRingCueCount: 0,
    wakeCueCount: 12,
    sprayCueCount: 20,
    depthBandCueCount: 8,
    floatingObjectCount: 8 + (includePaths ? 4 : 0),
    droneCueCount: includePaths ? 4 : 0,
    visualEvidenceBoundary: "Runtime whitecaps, spray cards, depth bands, horizon glints, buoy motion, and drones are procedural WebGL2 geometry/material cues over finite Gerstner waves; they do not claim WebGPU FFT, screen-space reflection/refraction, caustics, or underwater volume support."
  };
}

function oceanPresetForMode(mode: string): OceanFixturePreset {
  if (mode === "storm") return "storm";
  if (mode === "calm") return "calm";
  return "moderate";
}

function createWaveTelemetry(options: {
  readonly samples: readonly GalleryWaterSample[];
  readonly samplePattern: GalleryWaveTelemetry["samplePattern"];
  readonly foamCoverageThreshold: number;
  readonly dominantDirection: readonly [number, number];
  readonly dominantWavelength: number;
  readonly averagePeriod: number;
}): GalleryWaveTelemetry {
  const heights = options.samples.map((sample) => sample.height);
  const foams = options.samples.map((sample) => sample.foam);
  const slopes = options.samples.map(sampleSlope);
  const averageHeight = heights.reduce((sum, value) => sum + value, 0) / Math.max(1, heights.length);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const span = maxHeight - minHeight;
  const crestThreshold = averageHeight + Math.max(0.012, span * 0.24);
  const troughThreshold = averageHeight - Math.max(0.012, span * 0.24);
  const meanNormal = meanSampleNormal(options.samples);
  const normalVariance = options.samples.reduce((sum, sample) => {
    const dx = sample.normal[0] - meanNormal[0];
    const dy = sample.normal[1] - meanNormal[1];
    const dz = sample.normal[2] - meanNormal[2];
    return sum + dx * dx + dy * dy + dz * dz;
  }, 0) / Math.max(1, options.samples.length);
  return {
    samplePattern: options.samplePattern,
    foamCoverageThreshold: round3(options.foamCoverageThreshold),
    foamCoverage: round3(foams.filter((foam) => foam >= options.foamCoverageThreshold).length / Math.max(1, foams.length)),
    averageSlope: round3(slopes.reduce((sum, value) => sum + value, 0) / Math.max(1, slopes.length)),
    maxSlope: round3(Math.max(...slopes)),
    normalVariance: round3(normalVariance),
    crestCount: heights.filter((height) => height >= crestThreshold).length,
    troughCount: heights.filter((height) => height <= troughThreshold).length,
    energy: round3(Math.sqrt(heights.reduce((sum, value) => sum + value * value, 0) / Math.max(1, heights.length))),
    dominantDirection: normalize2(options.dominantDirection),
    dominantWavelength: round3(options.dominantWavelength),
    averagePeriod: round3(options.averagePeriod)
  };
}

function createMaterialTelemetry(options: {
  readonly roughness: number;
  readonly waveStrength: number;
  readonly rippleStrength: number;
}): GalleryWaterMaterialTelemetry {
  const frame = resolveGalleryWaterFrameParameters(options.waveStrength, options.rippleStrength, options.roughness);
  const roughness = frame.surfaceRoughness;
  const waveStrength = frame.waveStrength;
  const rippleStrength = frame.rippleStrength;
  return {
    roughness: round3(roughness),
    roughnessBand: roughness < 0.14 ? "glassy" : roughness < 0.38 ? "balanced" : "wind-roughened",
    foamThreshold: round3(frame.foamThreshold),
    foamGain: round3(frame.foamGain),
    foamSharpness: round3(frame.foamSharpness),
    choppiness: round3(frame.choppiness),
    specularIntensity: round3(frame.specularIntensity),
    causticBandStrength: round3(clampNumber(0.18 + (1 - roughness) * 0.28 + waveStrength * 0.055, 0.08, 0.62)),
    shaderDisplacementScale: round3(clampNumber(0.12 + waveStrength * 0.018 + rippleStrength * 0.014, 0.08, 0.2)),
    normalDetailScale: round3(frame.normalDetailScale),
    fresnelSkyTintStrength: round3(frame.fresnelSkyTintStrength),
    reflectedHorizonBandStrength: round3(frame.reflectedHorizonBandStrength),
    glintLobeCount: roughness < 0.18 ? 3 : roughness < 0.42 ? 4 : 5,
    materialPath: "single-pass-procedural-fresnel-water",
    reflectionApproximation: "fresnel-sky-and-authored-horizon-tint-only",
    refractionApproximation: "depth-tinted-translucency-only"
  };
}

function createMotionEvidence(options: {
  readonly currentSamples: readonly GalleryWaterSample[];
  readonly futureSamples: readonly GalleryWaterSample[];
  readonly sampleIntervalSeconds: number;
  readonly rippleEvidence?: GalleryRippleMotionEvidence;
}): GalleryWaterMotionEvidence {
  const count = Math.min(options.currentSamples.length, options.futureSamples.length);
  let heightDelta = 0;
  let maxHeightDelta = 0;
  let foamDelta = 0;
  let maxFoamDelta = 0;
  let normalAngleDelta = 0;
  let maxNormalAngleDelta = 0;
  for (let index = 0; index < count; index += 1) {
    const current = options.currentSamples[index]!;
    const future = options.futureSamples[index]!;
    const dh = Math.abs(future.height - current.height);
    const df = Math.abs(future.foam - current.foam);
    const normalAngle = normalAngleDegrees(current.normal, future.normal);
    heightDelta += dh;
    foamDelta += df;
    normalAngleDelta += normalAngle;
    maxHeightDelta = Math.max(maxHeightDelta, dh);
    maxFoamDelta = Math.max(maxFoamDelta, df);
    maxNormalAngleDelta = Math.max(maxNormalAngleDelta, normalAngle);
  }
  const currentEnergy = sampleEnergy(options.currentSamples);
  const futureEnergy = sampleEnergy(options.futureSamples);
  return {
    method: "same-probe-temporal-delta",
    sampleIntervalSeconds: round3(options.sampleIntervalSeconds),
    probeCount: count,
    meanAbsHeightDelta: round3(heightDelta / Math.max(1, count)),
    maxAbsHeightDelta: round3(maxHeightDelta),
    meanFoamDelta: round3(foamDelta / Math.max(1, count)),
    maxFoamDelta: round3(maxFoamDelta),
    meanNormalAngleDeltaDegrees: round3(normalAngleDelta / Math.max(1, count)),
    maxNormalAngleDeltaDegrees: round3(maxNormalAngleDelta),
    strongestCrestProbeShift: round3(nearestFutureCrestShift(options.currentSamples, options.futureSamples)),
    temporalEnergyDelta: round3(Math.abs(futureEnergy - currentEnergy)),
    ...(options.rippleEvidence ? { rippleEvidence: options.rippleEvidence } : {})
  };
}

function createRippleMotionEvidence(
  ripples: readonly WaterRippleInput[],
  time: number,
  sampleIntervalSeconds: number
): GalleryRippleMotionEvidence {
  const active = ripples.filter((ripple) => {
    const age = time - ripple.startedAt;
    return age >= 0 && age <= 4.5;
  });
  const ringSpeed = 5.8 / 5.5;
  const proceduralRippleSourceCount = 2;
  let ageTotal = 0;
  let radiusTotal = 0;
  let maxRingRadius = 0;
  let energy = 0;
  for (const ripple of active) {
    const age = time - ripple.startedAt;
    const radius = Math.max(0, age * ringSpeed);
    ageTotal += age;
    radiusTotal += radius;
    maxRingRadius = Math.max(maxRingRadius, radius);
    energy += ripple.strength * Math.exp(-age * 0.72);
  }
  return {
    source: "interaction-ripple-equation",
    activeInteractionRippleCount: active.length,
    proceduralRippleSourceCount,
    totalRippleSourceCount: active.length + proceduralRippleSourceCount,
    averageAgeSeconds: round3(ageTotal / Math.max(1, active.length)),
    averageRingRadius: round3(radiusTotal / Math.max(1, active.length)),
    maxRingRadius: round3(maxRingRadius),
    expectedRingExpansion: round3(sampleIntervalSeconds * ringSpeed),
    injectedRippleEnergy: round3(energy),
    ambientRippleEnergy: round3(proceduralRippleSourceCount * sampleIntervalSeconds * 0.02)
  };
}

function evaluateAmbientRipple(
  x: number,
  z: number,
  time: number,
  origin: readonly [number, number],
  frequency: number,
  speed: number,
  amplitude: number
): number {
  const distance = Math.hypot(x - origin[0], z - origin[1]);
  return Math.sin(distance * frequency - time * speed) * Math.exp(-distance * 0.18) * amplitude;
}

function evaluateShoreReboundWave(x: number, z: number, time: number, shoreZ: number, amplitude: number): number {
  const distance = Math.abs(z - shoreZ);
  const lateral = Math.sin(x * 1.35 + time * 0.72) * 0.45 + Math.sin(x * 0.42 - time * 0.38) * 0.28;
  return Math.sin(distance * 5.2 - time * 2.8 + lateral) * Math.exp(-distance * 1.08) * amplitude;
}

function evaluateOceanDetailHeight(
  x: number,
  z: number,
  elapsedSeconds: number,
  amplitudeScale: number,
  shaderWaveStrength: number,
  surfaceRoughness: number
): number {
  const wind = clampNumber(shaderWaveStrength, 0.2, 3.2);
  const rough = clampNumber(surfaceRoughness, 0.05, 0.72);
  const detailScale = clampNumber(0.26 + amplitudeScale * 0.07 + wind * 0.08, 0.22, 0.74);
  const crossing =
    Math.sin(x * 0.34 + z * 0.17 - elapsedSeconds * 0.78) * 0.07
    + Math.sin(-x * 0.21 + z * 0.43 + elapsedSeconds * 0.66) * 0.048
    + Math.sin((x * 0.74 + z * 0.36) - elapsedSeconds * 1.24) * 0.032
    + Math.sin((x * 1.55 - z * 0.68) + elapsedSeconds * 1.92) * 0.015;
  const gust = Math.sin(z * 0.08 + elapsedSeconds * 0.31) * Math.sin(x * 0.19 - elapsedSeconds * 0.27) * 0.035;
  return (crossing + gust * rough * 2.2) * detailScale;
}

function sampleOceanTemporalMotion(
  currentSamples: readonly GalleryWaterSample[],
  waves: readonly OceanWaveDescriptor[],
  elapsedSeconds: number,
  amplitudeScale: number,
  materialTelemetry: GalleryWaterMaterialTelemetry,
  shaderWaveStrength: number,
  surfaceRoughness: number
): readonly GalleryWaterSample[] {
  return currentSamples.map((sample) => {
    const evaluated = evaluateWaveDescriptors(waves, sample.x, sample.z, elapsedSeconds);
    const normal = scaleNormalForAmplitude(evaluated.normal, amplitudeScale);
    const detail = evaluateOceanDetailHeight(sample.x, sample.z, elapsedSeconds, amplitudeScale, shaderWaveStrength, surfaceRoughness);
    const foam = Math.abs(evaluated.height * amplitudeScale + detail) * (0.84 + materialTelemetry.choppiness * 0.18)
      + sampleSlope({ ...sample, normal }) * (0.08 + materialTelemetry.foamGain * 0.035);
    return {
      x: sample.x,
      z: sample.z,
      height: round3(evaluated.height * amplitudeScale + detail),
      normal,
      foam: round3(clampNumber(foam, 0, 1.45))
    };
  });
}

function strongestCrest(samples: readonly GalleryWaterSample[]): GalleryWaterSample {
  let strongest = samples[0] ?? { x: 0, z: 0, height: 0, normal: [0, 1, 0] as const, foam: 0 };
  for (const sample of samples) {
    if (sample.height > strongest.height) strongest = sample;
  }
  return strongest;
}

function nearestFutureCrestShift(
  currentSamples: readonly GalleryWaterSample[],
  futureSamples: readonly GalleryWaterSample[]
): number {
  const currentCrest = strongestCrest(currentSamples);
  const futureHeights = futureSamples.map((sample) => sample.height);
  const minFuture = Math.min(...futureHeights);
  const maxFuture = Math.max(...futureHeights);
  const futureThreshold = minFuture + (maxFuture - minFuture) * 0.76;
  let nearest = Number.POSITIVE_INFINITY;
  for (const sample of futureSamples) {
    if (sample.height < futureThreshold) continue;
    nearest = Math.min(nearest, Math.hypot(sample.x - currentCrest.x, sample.z - currentCrest.z));
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

function sampleEnergy(samples: readonly GalleryWaterSample[]): number {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample.height * sample.height, 0) / Math.max(1, samples.length));
}

function normalAngleDegrees(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dot = clampNumber(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  return Math.acos(dot) * 180 / Math.PI;
}

function summarizeWaveDescriptors(waves: readonly OceanWaveDescriptor[]): {
  readonly dominantDirection: readonly [number, number];
  readonly dominantWavelength: number;
  readonly averagePeriod: number;
} {
  let totalWeight = 0;
  let directionX = 0;
  let directionZ = 0;
  let wavelength = 0;
  let period = 0;
  for (const descriptor of waves) {
    const weight = Math.max(0.0001, descriptor.amplitude);
    totalWeight += weight;
    directionX += descriptor.direction[0] * weight;
    directionZ += descriptor.direction[1] * weight;
    wavelength += descriptor.wavelength * weight;
    period += descriptor.wavelength / Math.max(0.0001, descriptor.speed) * weight;
  }
  return {
    dominantDirection: normalize2([directionX / Math.max(0.0001, totalWeight), directionZ / Math.max(0.0001, totalWeight)]),
    dominantWavelength: round3(wavelength / Math.max(0.0001, totalWeight)),
    averagePeriod: round3(period / Math.max(0.0001, totalWeight))
  };
}

function enhanceFoamPatches(
  patches: readonly OceanFoamPatch[],
  materialTelemetry: GalleryWaterMaterialTelemetry,
  limit: number
): readonly OceanFoamPatch[] {
  return [...patches]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, limit)
    .map((patch, index) => ({
      id: patch.id || `ocean-foam-${index}`,
      x: round3(patch.x),
      z: round3(patch.z),
      intensity: round3(clampNumber(patch.intensity * (0.78 + materialTelemetry.foamGain * 0.22), 0, 1.45)),
      radius: round3(clampNumber(patch.radius * (1.0 + materialTelemetry.choppiness * 0.2), 0.035, 0.18))
    }));
}

function sampleRippleFoam(x: number, z: number, time: number, ripples: readonly WaterRippleInput[]): number {
  let foam = 0;
  for (const ripple of ripples) {
    const age = time - ripple.startedAt;
    if (age < 0 || age > 4.5) continue;
    const distance = Math.hypot(x - ripple.x, z - ripple.z);
    const ring = Math.abs(Math.sin(distance * 5.5 - age * 5.8));
    foam += ring * Math.exp(-distance * 0.55) * Math.exp(-age * 0.72) * ripple.strength;
  }
  return foam;
}

function sampleSlope(sample: GalleryWaterSample): number {
  const y = Math.max(0.0001, Math.abs(sample.normal[1]));
  return Math.hypot(sample.normal[0], sample.normal[2]) / y;
}

function meanSampleNormal(samples: readonly GalleryWaterSample[]): readonly [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const sample of samples) {
    x += sample.normal[0];
    y += sample.normal[1];
    z += sample.normal[2];
  }
  const count = Math.max(1, samples.length);
  return normalize3([x / count, y / count, z / count]);
}

function scaleNormalForAmplitude(normal: readonly [number, number, number], amplitudeScale: number): readonly [number, number, number] {
  return normalize3([normal[0] * amplitudeScale, normal[1], normal[2] * amplitudeScale]);
}

function evaluateWaveDescriptors(
  waves: readonly OceanWaveDescriptor[],
  x: number,
  z: number,
  time: number
): { readonly height: number; readonly normal: readonly [number, number, number] } {
  let height = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  for (const descriptor of waves) {
    const k = (2 * Math.PI) / descriptor.wavelength;
    const omega = descriptor.speed * k;
    const phase = k * (descriptor.direction[0] * x + descriptor.direction[1] * z) - omega * time;
    const sin = Math.sin(phase);
    const cos = Math.cos(phase);
    const q = descriptor.steepness / Math.max(0.0001, descriptor.amplitude * k * waves.length);
    const waveAmplitude = k * descriptor.amplitude;
    height += descriptor.amplitude * sin;
    nx -= descriptor.direction[0] * waveAmplitude * cos;
    ny -= q * waveAmplitude * sin;
    nz -= descriptor.direction[1] * waveAmplitude * cos;
  }
  return {
    height,
    normal: normalize3([nx, ny, nz])
  };
}

function normalize3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.max(0.000001, Math.hypot(value[0], value[1], value[2]));
  return [round3(value[0] / length), round3(value[1] / length), round3(value[2] / length)];
}

function normalize2(value: readonly [number, number]): readonly [number, number] {
  const length = Math.max(0.000001, Math.hypot(value[0], value[1]));
  return [round3(value[0] / length), round3(value[1] / length)];
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function hashUnit(index: number, salt = 0): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
