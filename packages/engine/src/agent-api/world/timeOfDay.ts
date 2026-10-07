/**
 * PRD-10 §6.7 / T6.4 — time of day.
 *
 * `solarPosition` is the NOAA simplified algorithm (fractional-year equation of
 * time + declination; ±0.5° against the reference table in prd10-biomes tests).
 * `arc` mode is the stylized `elevation = sin(π·(hour−6)/12)·maxElevation` with a
 * linear azimuth sweep.
 *
 * `rigAtHour` interpolates between a sorted `keyframes` list: colours lerp in
 * linear RGB, intensities in log space, fog density linearly, exposure in EV
 * (§6.7). Sky `model`/`environmentSpec`/`post` preset ids are discrete and
 * switch at the midpoint.
 *
 * `practicalScaleFor` scales emissive/lights tagged `practical` — the
 * `u_a3dPrd10PracticalScale` uniform on Path G; re-emitted light intensities on
 * Path S.
 */
import type { AuraVec3 } from "../index.js";
import type { AuraBiomeId } from "../../contracts/world.js";
import {
  BIOME_RIGS,
  describeBiome,
  listBiomes,
  type AuraBiomeNode,
  type AuraBiomeOverrides,
  type AuraBiomeRigDetail,
  type AuraBiomeSunSpec,
  type AuraTimeOfDayNode,
  type AuraTimeOfDayOptions
} from "./biomes.js";
import { normalizeWind, type AuraWindNode, type AuraWindOptions } from "./wind.js";
import { AuraWorldNodeBuilder } from "./terrain.js";

const DEG = Math.PI / 180;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface AuraSunPosition {
  /** Degrees above the horizon (negative = below). */
  readonly elevationDeg: number;
  /** Degrees clockwise from north (after `northOffsetDeg`). */
  readonly azimuthDeg: number;
  /** Unit vector FROM the scene TOWARD the sun: +x east, +y up, -z north. */
  readonly direction: AuraVec3;
}

/**
 * NOAA simplified solar position. `dayOfYear` 1..365 (default 172 ≈ June 21),
 * `latitudeDeg` default 37.8, `northOffsetDeg` rotates azimuth (scene north).
 * Accuracy target ±0.5° against a NOAA reference table (§15.1).
 */
export function solarPosition(
  hour: number,
  latitudeDeg = 37.8,
  dayOfYear = 172,
  northOffsetDeg = 0
): AuraSunPosition {
  const gamma = (2 * Math.PI * (dayOfYear - 1 + (hour - 12) / 24)) / 365;
  const eqtimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const solarTime = hour + eqtimeMin / 60; // longitude 0 — northOffsetDeg owns the frame
  const ha = (solarTime - 12) * 15 * DEG;
  const lat = latitudeDeg * DEG;
  const cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const elevationDeg = 90 - Math.acos(clamp(cosZenith, -1, 1)) / DEG;
  let azimuthDeg =
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / DEG + 180;
  azimuthDeg = (((azimuthDeg + northOffsetDeg) % 360) + 360) % 360;
  const el = elevationDeg * DEG;
  const az = azimuthDeg * DEG;
  return {
    elevationDeg,
    azimuthDeg,
    direction: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
  };
}

/** §6.7 arc mode: sinusoidal elevation (peak `maxElevationDeg` at hour 12/24-wrap), linear azimuth sweep. */
export function arcSunPosition(hour: number, maxElevationDeg = 55): AuraSunPosition {
  const t = ((hour - 6 + 24) % 24) / 24;
  const elevationDeg = Math.sin(Math.PI * t * 2) * maxElevationDeg;
  const azimuthDeg = (90 + t * 360) % 360;
  const el = elevationDeg * DEG;
  const az = azimuthDeg * DEG;
  return {
    elevationDeg,
    azimuthDeg,
    direction: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
  };
}

export function sunPositionFor(options: AuraTimeOfDayOptions, hour: number): AuraSunPosition {
  if (options.mode === "arc") return arcSunPosition(hour, options.maxElevationDeg ?? 55);
  return solarPosition(hour, options.latitudeDeg ?? 37.8, options.dayOfYear ?? 172, options.northOffsetDeg ?? 0);
}

/** smoothstep daylight factor from solar elevation: 0 below −12°, 1 above +12°. */
export function daylightFactor(elevationDeg: number): number {
  const x = clamp((elevationDeg + 12) / 24, 0, 1);
  return x * x * (3 - 2 * x);
}

/** §6.7 practicals: day 0.25 → night 1.4, driven by solar elevation. */
export function practicalScaleFor(sun: AuraSunPosition): number {
  return 0.25 + 1.15 * (1 - daylightFactor(sun.elevationDeg));
}

// ------------------------------------------------------- rig interpolation ---

const hexToLinear = (c: string): [number, number, number] => {
  const h = c.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return [
    Math.pow(((n >> 16) & 255) / 255, 2.2),
    Math.pow(((n >> 8) & 255) / 255, 2.2),
    Math.pow((n & 255) / 255, 2.2)
  ];
};
const linearToHex = (rgb: readonly number[]): string =>
  "#" + rgb.map((v) => Math.round(clamp(Math.pow(v, 1 / 2.2), 0, 1) * 255).toString(16).padStart(2, "0")).join("");
const srgbLerp = (a: string, b: string, t: number): string => {
  const va = hexToLinear(a), vb = hexToLinear(b);
  return linearToHex([lerp(va[0], vb[0], t), lerp(va[1], vb[1], t), lerp(va[2], vb[2], t)]);
};
/** Intensities lerp in log space (§6.7); degenerate to linear when a side is ≤ 0. */
const logLerp = (a: number, b: number, t: number): number =>
  a > 0 && b > 0 ? Math.exp(lerp(Math.log(a), Math.log(b), t)) : lerp(a, b, t);

const scalarOf = (v: number | { low?: number; medium?: number; high?: number; ultra?: number }): number =>
  typeof v === "number" ? v : v.high ?? v.medium ?? v.low ?? v.ultra ?? 0;

/**
 * Interpolated rig between two biome rigs. Discrete fields (sky model, fog
 * mode, post preset, environment source, castShadow) switch at t ≥ 0.5 —
 * interpolating an enum is meaningless, so the midpoint switch is the §6.7
 * rule. Numeric/colour fields lerp per the units rules.
 */
export function interpolateRigs(
  a: AuraBiomeRigDetail,
  b: AuraBiomeRigDetail,
  t: number
): AuraBiomeRigDetail {
  const skyA = a.sky, skyB = b.sky;
  let sky: AuraBiomeRigDetail["sky"] = t < 0.5 ? skyA : skyB;
  if (skyA && skyB && skyA.model === "gradient" && skyB.model === "gradient") {
    sky = {
      ...skyB,
      zenith: srgbLerp(skyA.zenith, skyB.zenith, t),
      horizon: srgbLerp(skyA.horizon, skyB.horizon, t),
      ...(skyA.ground && skyB.ground ? { ground: srgbLerp(skyA.ground, skyB.ground, t) } : {}),
      ...(skyA.horizonGlow !== undefined || skyB.horizonGlow !== undefined
        ? { horizonGlow: lerp(skyA.horizonGlow ?? 0, skyB.horizonGlow ?? 0, t) }
        : {})
    };
  } else if (skyA && skyB && skyA.model === "preetham" && skyB.model === "preetham") {
    const sa = skyA.sun, sb = skyB.sun;
    sky = {
      ...skyB,
      turbidity: lerp(skyA.turbidity ?? 2.5, skyB.turbidity ?? 2.5, t),
      mieDirectionalG: lerp(skyA.mieDirectionalG ?? 0.8, skyB.mieDirectionalG ?? 0.8, t),
      sun: {
        ...sb,
        elevationDeg: lerp(sa.elevationDeg, sb.elevationDeg, t),
        azimuthDeg: lerp(sa.azimuthDeg, sb.azimuthDeg, t),
        ...(sa.intensity !== undefined || sb.intensity !== undefined
          ? { intensity: logLerp(sa.intensity ?? 1, sb.intensity ?? 1, t) }
          : {})
      }
    };
  }

  const fogA = a.fog, fogB = b.fog;
  let fog: AuraBiomeRigDetail["fog"] = null;
  if (fogA || fogB) {
    const base = (fogB ?? fogA)!;
    fog = {
      ...base,
      density: lerp(fogA?.density ?? 0, fogB?.density ?? 0, t),
      heightFalloff: lerp(fogA?.heightFalloff ?? 0, fogB?.heightFalloff ?? 0, t),
      color:
        typeof fogA?.color === "string" && typeof fogB?.color === "string" &&
          fogA.color !== "sky" && fogB.color !== "sky"
          ? srgbLerp(fogA.color, fogB.color, t)
          : t < 0.5
            ? fogA?.color
            : fogB?.color
    };
  }

  const sunA = a.sunDetail, sunB = b.sunDetail;
  let sunDetail: AuraBiomeSunSpec | null = t < 0.5 ? sunA : sunB;
  if (sunA && sunB) {
    sunDetail = {
      elevationDeg: lerp(sunA.elevationDeg, sunB.elevationDeg, t),
      azimuthDeg: lerp(sunA.azimuthDeg, sunB.azimuthDeg, t),
      intensity: logLerp(sunA.intensity, sunB.intensity, t),
      ...(sunA.colorTemperatureK !== undefined || sunB.colorTemperatureK !== undefined
        ? { colorTemperatureK: lerp(sunA.colorTemperatureK ?? 6500, sunB.colorTemperatureK ?? 6500, t) }
        : {}),
      ...(t < 0.5
        ? (sunA.castShadow !== undefined ? { castShadow: sunA.castShadow } : {})
        : (sunB.castShadow !== undefined ? { castShadow: sunB.castShadow } : {}))
    };
  }

  const poA = a.postOverrides, poB = b.postOverrides;
  const postOverrides: AuraBiomeRigDetail["postOverrides"] = {
    ...(poA.exposureEv !== undefined || poB.exposureEv !== undefined
      ? { exposureEv: lerp(poA.exposureEv ?? 0, poB.exposureEv ?? 0, t) }
      : {}),
    ...(poA.bloomThreshold !== undefined || poB.bloomThreshold !== undefined
      ? { bloomThreshold: lerp(poA.bloomThreshold ?? 1, poB.bloomThreshold ?? 1, t) }
      : {}),
    ...(poA.bloomStrength !== undefined || poB.bloomStrength !== undefined
      ? { bloomStrength: lerp(poA.bloomStrength ?? 0, poB.bloomStrength ?? 0, t) }
      : {}),
    ...(t < 0.5
      ? (poA.grade !== undefined ? { grade: poA.grade } : {})
      : (poB.grade !== undefined ? { grade: poB.grade } : {}))
  };

  return {
    id: t < 0.5 ? a.id : b.id,
    sky,
    fog,
    post: t < 0.5 ? a.post : b.post,
    environment: t < 0.5 ? a.environment : b.environment,
    environmentSpec: t < 0.5 ? a.environmentSpec : b.environmentSpec,
    // C-26 `sun` requires colorTemperatureK — fall back to the lerped value,
    // then the source rigs', then the rig-table default.
    sun: sunDetail === null ? undefined : {
      elevationDeg: sunDetail.elevationDeg,
      azimuthDeg: sunDetail.azimuthDeg,
      intensity: sunDetail.intensity,
      colorTemperatureK: sunDetail.colorTemperatureK
        ?? a.sun?.colorTemperatureK ?? b.sun?.colorTemperatureK ?? 5800
    },
    sunDetail,
    shadows: {
      cascades: clamp(Math.round(lerp(scalarOf(a.shadows.cascades), scalarOf(b.shadows.cascades), t)), 1, 4) as 1 | 2 | 3 | 4,
      maxDistance: lerp(scalarOf(a.shadows.maxDistance), scalarOf(b.shadows.maxDistance), t),
      strength: lerp(a.shadows.strength, b.shadows.strength, t),
      softness: lerp(a.shadows.softness, b.shadows.softness, t)
    },
    postOverrides,
    practicalScale: logLerp(a.practicalScale, b.practicalScale, t),
    ambientPolicy: "ibl-only"
  };
}

/** Keyframe window on the cyclic 24 h clock: returns [indexA, indexB, t] around `hour` (ks must be sorted). */
export function keyframeBracket(
  keyframes: readonly { readonly hour: number }[],
  hour: number
): [number, number, number] {
  if (keyframes.length === 0) throw new Error("TOD_KEYFRAMES_EMPTY");
  if (keyframes.length === 1) return [0, 0, 0];
  const h = ((hour % 24) + 24) % 24;
  let i0 = keyframes.length - 1;
  for (let i = 0; i < keyframes.length; i += 1) {
    if (keyframes[i]!.hour <= h) i0 = i;
  }
  const i1 = (i0 + 1) % keyframes.length;
  const h0 = keyframes[i0]!.hour;
  const h1 = keyframes[i1]!.hour;
  const span = ((h1 - h0 + 24) % 24) || 24;
  const t = clamp((((h - h0 + 24) % 24) || 0) / span, 0, 1);
  return [i0, i1, t];
}

/**
 * Rig at `hour` for a time-of-day node: the interpolated keyframe rig (sorted,
 * cyclic across midnight). Without keyframes → `outdoor-day` default rig.
 */
export function rigAtHour(options: AuraTimeOfDayOptions, hour: number): AuraBiomeRigDetail {
  const kf = options.keyframes;
  if (!kf || kf.length === 0) return describeBiome("outdoor-day");
  if (kf.length === 1) return describeBiome(kf[0]!.biome);
  const ks = [...kf].sort((p, q) => p.hour - q.hour);
  const [i0, i1, t] = keyframeBracket(ks, hour);
  return interpolateRigs(describeBiome(ks[i0]!.biome), describeBiome(ks[i1]!.biome), t);
}

// ------------------------------------------------------------- builders -----

/** `world.biome(id, overrides?)` → `kind:"biome"` node (§7.1.2). `scope:"environment"` is emitted by the `environments.*` room-biome builders only. */
let biomeSeq = 0;
let timeOfDaySeq = 0;
let windSeq = 0;

export function worldBiome(
  id: AuraBiomeId,
  overrides?: AuraBiomeOverrides,
  scope: "all" | "environment" = "all"
): AuraWorldNodeBuilder<AuraBiomeNode> {
  if (!BIOME_RIGS[id]) throw new Error(`BIOME_UNKNOWN:${id}`);
  const nodeId = `biome-${id}-${++biomeSeq}`;
  return new AuraWorldNodeBuilder<AuraBiomeNode>({
    kind: "biome",
    id: nodeId,
    name: `biome-${id}`,
    biome: id,
    scope,
    ...(overrides ? { overrides } : {})
  });
}

/** `world.timeOfDay(options)` → `kind:"time-of-day"` node (§7.1.3). */
export function worldTimeOfDay(options: AuraTimeOfDayOptions): AuraWorldNodeBuilder<AuraTimeOfDayNode> {
  if (options.keyframes?.length) {
    const seen = new Set<number>();
    for (const k of options.keyframes) {
      if (seen.has(k.hour)) throw new Error(`TOD_KEYFRAME_DUP:${k.hour}`);
      seen.add(k.hour);
      if (!BIOME_RIGS[k.biome]) throw new Error(`BIOME_UNKNOWN:${k.biome}`);
    }
  }
  const nodeId = options.id ?? `time-of-day-${++timeOfDaySeq}`;
  return new AuraWorldNodeBuilder<AuraTimeOfDayNode>({
    kind: "time-of-day",
    id: nodeId,
    name: options.name ?? "time-of-day",
    options
  });
}

/** `world.wind(options?)` → `kind:"wind"` node (§7.1.3). */
export function worldWind(options?: AuraWindOptions): AuraWorldNodeBuilder<AuraWindNode> {
  const nodeId = options?.id ?? `wind-${++windSeq}`;
  return new AuraWorldNodeBuilder<AuraWindNode>({
    kind: "wind",
    id: nodeId,
    name: options?.name ?? "wind",
    wind: normalizeWind(options)
  });
}

/** `world.biomes` — C-26 listBiomes/describeBiome passthroughs (pure, frozen). */
export const worldBiomes = {
  list: listBiomes,
  describe: describeBiome
} as const;
