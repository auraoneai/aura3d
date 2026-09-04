import type { CollectedLight } from "./LightCollector";
import type { ForwardEnvironmentFogOptions } from "./ForwardPass";
import type { VolumetricLightOptions } from "./PostProcessPass";

export type VolumetricFogQuality = "off" | "balanced" | "quality" | "ultra";

export interface VolumetricFogEffectParams {
  readonly density?: number;
  readonly color?: readonly [number, number, number];
  readonly intensity?: number;
  /** Screen-space radial anchor override for the inscatter kernel, in UV. */
  readonly lightPosition?: readonly [number, number];
  /** Linear RGB override for the inscatter light; defaults to the dominant collected light. */
  readonly lightColor?: readonly [number, number, number];
  readonly heightFalloff?: number;
  readonly heightReference?: number;
  readonly quality?: VolumetricFogQuality;
  readonly samples?: number;
  readonly dither?: boolean;
}

export interface VolumetricQualityResolution {
  readonly tier: Exclude<VolumetricFogQuality, "off">;
  /** Radial integration steps for the inscatter kernel. */
  readonly samples: number;
  readonly dither: boolean;
}

export interface VolumetricFogResolution {
  readonly forward: Pick<
    ForwardEnvironmentFogOptions,
    "volumetricIntensity" | "volumetricLightDirection" | "volumetricLightColor" | "heightFalloff" | "heightReference"
  >;
  /** Null when quality is "off": the scene keeps forward exp2 fog only. */
  readonly pass: (VolumetricLightOptions & { readonly dither: boolean }) | null;
  readonly quality: VolumetricQualityResolution | null;
  readonly lightKind: CollectedLight["kind"] | "authored" | null;
}

const BALANCED_AREA = 1280 * 720;
const QUALITY_AREA = 1920 * 1080;

/**
 * Quality scaler (muse3jsparity-PRD A5): radial step count drops with render
 * area so 720p-class frames stay cheap; "off" returns null so the caller
 * keeps the current exp2 forward fog instead of submitting a pass.
 */
export function resolveVolumetricQuality(
  width: number,
  height: number,
  quality: VolumetricFogQuality = "balanced",
  samplesOverride?: number
): VolumetricQualityResolution | null {
  if (quality === "off") return null;
  if (samplesOverride !== undefined) {
    if (!Number.isInteger(samplesOverride) || samplesOverride < 4 || samplesOverride > 128) {
      throw new RangeError(`Volumetric fog samples must be an integer in [4, 128], got ${samplesOverride}.`);
    }
    return { tier: quality, samples: samplesOverride, dither: true };
  }
  const area = Math.max(0, width) * Math.max(0, height);
  const areaTier = area <= BALANCED_AREA ? "balanced" : area <= QUALITY_AREA ? "quality" : "ultra";
  const rank = { balanced: 0, quality: 1, ultra: 2 } as const;
  // The requested tier is a ceiling; small areas cap it down so step count
  // drops with resolution scale (an ultra request at 720p still gets 24).
  const tier = rank[quality] <= rank[areaTier] ? quality : areaTier;
  const samples = tier === "balanced" ? 24 : tier === "quality" ? 32 : 48;
  return { tier, samples, dither: true };
}

/**
 * Dominant volumetric light from the clustered/collector light list
 * (muse3jsparity-PRD A5): the brightest spot first (shafts read best around
 * spots), then the brightest directional, then the brightest point. Rect-area
 * lights never drive volumetrics.
 */
export function selectVolumetricLight(lights: readonly CollectedLight[]): CollectedLight | null {
  const pick = (kind: CollectedLight["kind"]): CollectedLight | null => {
    let best: CollectedLight | null = null;
    for (const light of lights) {
      if (light.kind !== kind || !(light.intensity > 0)) continue;
      if (!best || light.intensity > best.intensity) best = light;
    }
    return best;
  };
  return pick("spot") ?? pick("directional") ?? pick("point");
}

/** World-space direction TOWARD the light for the forward inscatter lobe. */
export function volumetricLightDirection(light: CollectedLight): readonly [number, number, number] | null {
  if (light.kind === "spot" || light.kind === "directional") {
    const inverted: [number, number, number] = [-light.direction[0]!, -light.direction[1]!, -light.direction[2]!];
    const length = Math.hypot(inverted[0], inverted[1], inverted[2]);
    if (!(length > 0)) return null;
    return [inverted[0] / length, inverted[1] / length, inverted[2] / length];
  }
  return null;
}

/**
 * Resolves one volumetric-fog effect node into its forward (GPU height-fog +
 * inscatter) terms and its postprocess (radial inscatter kernel) options.
 * Pure and unit-tested; the bridge owns submission.
 */
export function resolveVolumetricFog(
  params: VolumetricFogEffectParams,
  lights: readonly CollectedLight[],
  renderWidth: number,
  renderHeight: number
): VolumetricFogResolution {
  const quality = resolveVolumetricQuality(
    renderWidth,
    renderHeight,
    params.quality ?? "balanced",
    params.samples
  );
  const light = selectVolumetricLight(lights);
  const intensity = Math.min(1, Math.max(0, params.intensity ?? 0.55));
  const direction = light ? volumetricLightDirection(light) : null;
  const lightColor = params.lightColor ?? light?.color ?? [1, 0.96, 0.9];
  return {
    forward: {
      volumetricIntensity: quality ? intensity : 0,
      ...(direction ? { volumetricLightDirection: direction } : {}),
      volumetricLightColor: [lightColor[0]!, lightColor[1]!, lightColor[2]!],
      ...(params.heightFalloff !== undefined ? { heightFalloff: params.heightFalloff } : {}),
      ...(params.heightReference !== undefined ? { heightReference: params.heightReference } : {})
    },
    pass: quality
      ? {
        lightPosition: params.lightPosition ?? [0.5, 0.18],
        color: [lightColor[0]!, lightColor[1]!, lightColor[2]!],
        density: Math.min(1, Math.max(0, params.density ?? 0.4)),
        decay: 0.94,
        weight: intensity,
        exposure: 1.1,
        samples: quality.samples,
        dither: params.dither ?? quality.dither
      }
      : null,
    quality,
    lightKind: light ? light.kind : params.lightColor ? "authored" : null
  };
}
