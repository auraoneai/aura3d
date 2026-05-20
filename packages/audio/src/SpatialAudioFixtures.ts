export type AudioOcclusionLevel = "none" | "light" | "medium" | "heavy" | "complete";

export interface AudioEnvironmentFixtureOptions {
  readonly sourcePosition?: readonly [number, number, number];
  readonly listenerPosition?: readonly [number, number, number];
  readonly sourceVelocity?: readonly [number, number, number];
  readonly listenerVelocity?: readonly [number, number, number];
  readonly obstacleCount?: number;
  readonly reverbZoneRadius?: number;
  readonly reverbZoneDistance?: number;
  readonly baseFrequencyHz?: number;
}

export interface AudioEnvironmentFixture {
  readonly source: "origin-master-spatial-audio-environment-adapted";
  readonly distance: number;
  readonly occlusion: {
    readonly level: AudioOcclusionLevel;
    readonly obstacleCount: number;
    readonly lowpassHz: number;
    readonly volume: number;
  };
  readonly doppler: {
    readonly relativeVelocity: number;
    readonly approaching: boolean;
    readonly pitchFactor: number;
    readonly frequencyShiftHz: number;
  };
  readonly reverb: {
    readonly zoneRadius: number;
    readonly zoneDistance: number;
    readonly blend: number;
    readonly wetLevel: number;
    readonly dryLevel: number;
  };
  readonly hash: string;
  readonly claimBoundary: string;
}

const OCCLUSION: Record<AudioOcclusionLevel, { readonly lowpassHz: number; readonly volume: number }> = {
  none: { lowpassHz: 20_000, volume: 1 },
  light: { lowpassHz: 8_000, volume: 0.9 },
  medium: { lowpassHz: 3_000, volume: 0.7 },
  heavy: { lowpassHz: 800, volume: 0.4 },
  complete: { lowpassHz: 200, volume: 0.1 }
};

export function sampleAudioEnvironmentFixture(options: AudioEnvironmentFixtureOptions = {}): AudioEnvironmentFixture {
  const sourcePosition = options.sourcePosition ?? [0.85, 0.15, 0] as const;
  const listenerPosition = options.listenerPosition ?? [0, 0, 3] as const;
  const sourceVelocity = options.sourceVelocity ?? [-2.5, 0.2, 0] as const;
  const listenerVelocity = options.listenerVelocity ?? [0.7, 0, 0] as const;
  const obstacleCount = Math.max(0, Math.floor(options.obstacleCount ?? 2));
  const distance = vectorLength(sub(sourcePosition, listenerPosition));
  const direction = normalize(sub(listenerPosition, sourcePosition));
  const relativeVelocity = dot(sub(sourceVelocity, listenerVelocity), direction);
  const approaching = relativeVelocity > 0;
  const speedOfSound = 343;
  const pitchFactor = clamp(speedOfSound / Math.max(1, speedOfSound - relativeVelocity), 0.5, 2);
  const baseFrequencyHz = options.baseFrequencyHz ?? 440;
  const level = occlusionLevel(obstacleCount);
  const occlusion = OCCLUSION[level];
  const zoneRadius = Math.max(0.001, options.reverbZoneRadius ?? 8);
  const zoneDistance = Math.max(0, options.reverbZoneDistance ?? distance);
  const blend = clamp(1 - zoneDistance / zoneRadius, 0, 1);
  const fixture = {
    source: "origin-master-spatial-audio-environment-adapted" as const,
    distance: round(distance),
    occlusion: {
      level,
      obstacleCount,
      lowpassHz: occlusion.lowpassHz,
      volume: occlusion.volume
    },
    doppler: {
      relativeVelocity: round(relativeVelocity),
      approaching,
      pitchFactor: round(pitchFactor),
      frequencyShiftHz: round(baseFrequencyHz * (pitchFactor - 1))
    },
    reverb: {
      zoneRadius: round(zoneRadius),
      zoneDistance: round(zoneDistance),
      blend: round(blend),
      wetLevel: round(0.55 * blend),
      dryLevel: round(0.85 * (1 - blend * 0.5))
    },
    hash: "",
    claimBoundary: "Spatial audio environment fixture adapts old occlusion, doppler, and reverb-zone math for deterministic telemetry; it does not implement authored audio middleware or Unity/Unreal acoustic parity."
  };
  return {
    ...fixture,
    hash: stableHash(`${fixture.distance}|${fixture.occlusion.level}|${fixture.occlusion.obstacleCount}|${fixture.doppler.pitchFactor}|${fixture.reverb.blend}`)
  };
}

function occlusionLevel(obstacleCount: number): AudioOcclusionLevel {
  if (obstacleCount <= 0) return "none";
  if (obstacleCount === 1) return "light";
  if (obstacleCount === 2) return "medium";
  if (obstacleCount === 3) return "heavy";
  return "complete";
}

function sub(left: readonly [number, number, number], right: readonly [number, number, number]): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalize(value: readonly [number, number, number]): [number, number, number] {
  const length = vectorLength(value);
  return length > 0 ? [value[0] / length, value[1] / length, value[2] / length] : [0, 0, 0];
}

function vectorLength(value: readonly [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
