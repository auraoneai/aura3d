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

/* ------------------------------------------------------------------ *
 * PRD-07 P5-T7 — §6.7 QR resolver: `effects.volumetricFog` maps onto the
 * C-27 `volumetricFog` tier ("analytic" | "froxel-medium" | "froxel-high")
 * instead of the legacy screen-space kernel above. `color` is honoured:
 * it feeds the packed inscatter colour the inject pass multiplies into
 * both the sun lobe and the ambient term.
 * ------------------------------------------------------------------ */

export type QrVolumetricMode = "analytic" | "froxel-medium" | "froxel-high";

export interface QrVolumetricFogParams {
  readonly density?: number;
  readonly color?: string | readonly [number, number, number];
  readonly intensity?: number;
  readonly anisotropy?: number;
  readonly noiseScale?: number;
  readonly noiseSpeed?: number;
  readonly noiseStrength?: number;
  readonly heightFalloff?: number;
  readonly heightReference?: number;
}

export interface QrVolumetricResolution {
  readonly mode: QrVolumetricMode;
  /** Uniform values for the inject pass (density coefficients + lighting). */
  readonly packed: {
    readonly fogDensity: readonly [number, number, number, number]; // σd, σh, b, h0
    readonly sunColor: readonly [number, number, number];           // light color × intensity
    readonly ambientColor: readonly [number, number, number];       // dimmed color
    readonly anisotropy: number;
    readonly noiseScale: number;
    readonly noiseSpeed: number;
    readonly noiseStrength: number;
  };
  /** True when scene depth is required and the froxel pass can run. */
  readonly needsSceneDepth: boolean;
}

/** "froxel" mode for the tier's C-27 volumetricFog value. */
export function qrVolumetricModeForTier(settings: { readonly volumetricFog: QrVolumetricMode }): QrVolumetricMode {
  return settings.volumetricFog;
}

/** hex "#rrggbb" or array → linear RGB. */
export function qrVolumetricColor(color: QrVolumetricFogParams["color"]): readonly [number, number, number] {
  if (Array.isArray(color)) return [color[0] ?? 0.7, color[1] ?? 0.74, color[2] ?? 0.82];
  if (typeof color === "string") {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
    if (m) {
      const srgb = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return [srgb(parseInt(m[1]!, 16) / 255), srgb(parseInt(m[2]!, 16) / 255), srgb(parseInt(m[3]!, 16) / 255)];
    }
  }
  return [0.663, 0.737, 0.812]; // #a9bccf — the lane fallback
}

/**
 * §6.7 tier mapping: Low/Medium ("analytic") → analytic height fog +
 * volumes; High → froxel-medium; Ultra → froxel-high. The froxel path also
 * needs scene depth; when the caller knows it's unavailable it should keep
 * the analytic path (VOLUMETRIC_DEPTH_PENDING).
 */
export function resolveQrVolumetricFog(
  params: QrVolumetricFogParams,
  settings: { readonly volumetricFog: QrVolumetricMode }
): QrVolumetricResolution {
  const mode = qrVolumetricModeForTier(settings);
  const color = qrVolumetricColor(params.color);
  const intensity = Math.min(1, Math.max(0, params.intensity ?? 0.55));
  const density = Math.max(0, params.density ?? 0.01);
  return {
    mode,
    packed: {
      fogDensity: [
        density,
        params.heightFalloff !== undefined ? density * 2 : density * 1.6,  // σh
        params.heightFalloff ?? 0.12,                                       // b
        params.heightReference ?? 0                                          // h0
      ],
      sunColor: [color[0] * intensity * 4, color[1] * intensity * 4, color[2] * intensity * 4],
      ambientColor: [color[0] * intensity * 0.35, color[1] * intensity * 0.35, color[2] * intensity * 0.35],
      anisotropy: params.anisotropy ?? 0.6,
      noiseScale: params.noiseScale ?? 0,
      noiseSpeed: params.noiseSpeed ?? 0,
      noiseStrength: params.noiseStrength ?? 0
    },
    needsSceneDepth: mode !== "analytic"
  };
}
