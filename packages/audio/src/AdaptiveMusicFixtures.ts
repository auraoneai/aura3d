export type AdaptiveMusicFixtureState = "calm" | "tension" | "action" | "victory" | "defeat";

export type AdaptiveMusicCrossfadeCurve = "linear" | "equal-power" | "s-curve";

export interface AdaptiveMusicFixtureOptions {
  readonly state?: AdaptiveMusicFixtureState;
  readonly intensity?: number;
  readonly curve?: AdaptiveMusicCrossfadeCurve;
}

export interface AdaptiveMusicLayerMix {
  readonly id: string;
  readonly role: "bed" | "pulse" | "lead" | "stinger";
  readonly threshold: number;
  readonly baseVolume: number;
  readonly targetVolume: number;
  readonly enabled: boolean;
}

export interface AdaptiveMusicFixture {
  readonly source: "origin-master-adaptive-music-adapted";
  readonly state: AdaptiveMusicFixtureState;
  readonly intensity: number;
  readonly curve: AdaptiveMusicCrossfadeCurve;
  readonly transitionSeconds: number;
  readonly loopBars: number;
  readonly tempoBpm: number;
  readonly layers: readonly AdaptiveMusicLayerMix[];
  readonly activeLayerCount: number;
  readonly peakLayerVolume: number;
  readonly crossfade: {
    readonly outGain: readonly number[];
    readonly inGain: readonly number[];
    readonly equalPowerNormalized: boolean;
  };
  readonly hash: string;
  readonly claimBoundary: string;
}

const STATE_INTENSITY: Record<AdaptiveMusicFixtureState, number> = {
  calm: 0.05,
  tension: 0.42,
  action: 0.82,
  victory: 0.58,
  defeat: 0.22
};

const LAYERS: readonly Omit<AdaptiveMusicLayerMix, "targetVolume" | "enabled">[] = [
  { id: "ambient-bed", role: "bed", threshold: 0, baseVolume: 0.46 },
  { id: "rhythm-pulse", role: "pulse", threshold: 0.32, baseVolume: 0.7 },
  { id: "lead-motif", role: "lead", threshold: 0.62, baseVolume: 0.58 },
  { id: "result-stinger", role: "stinger", threshold: 0.52, baseVolume: 0.84 }
];

export function sampleAdaptiveMusicFixture(options: AdaptiveMusicFixtureOptions = {}): AdaptiveMusicFixture {
  const state = options.state ?? "tension";
  const intensity = clamp01(options.intensity ?? STATE_INTENSITY[state]);
  const curve = options.curve ?? "equal-power";
  const layers = LAYERS.map((layer) => {
    const enabled = layer.role === "stinger" ? state === "victory" || state === "defeat" : intensity >= layer.threshold;
    const ramp = layer.threshold >= 1 ? 0 : clamp01((intensity - layer.threshold) / Math.max(0.08, 1 - layer.threshold));
    const stateBoost = layer.role === "stinger" && state === "victory" ? 1 : layer.role === "stinger" && state === "defeat" ? 0.62 : 1;
    return {
      ...layer,
      enabled,
      targetVolume: enabled ? round(layer.baseVolume * Math.max(layer.role === "bed" ? 0.45 : 0.18, ramp) * stateBoost) : 0
    };
  });
  const crossfade = crossfadeSamples(curve, 6);
  const hash = stableHash([
    state,
    intensity.toFixed(4),
    curve,
    ...layers.map((layer) => `${layer.id}:${layer.targetVolume.toFixed(4)}:${layer.enabled ? 1 : 0}`)
  ].join("|"));
  return {
    source: "origin-master-adaptive-music-adapted",
    state,
    intensity: round(intensity),
    curve,
    transitionSeconds: state === "victory" || state === "defeat" ? 0.65 : 1.4,
    loopBars: 8,
    tempoBpm: state === "action" ? 138 : state === "victory" ? 124 : 112,
    layers,
    activeLayerCount: layers.filter((layer) => layer.enabled && layer.targetVolume > 0).length,
    peakLayerVolume: round(Math.max(...layers.map((layer) => layer.targetVolume))),
    crossfade,
    hash,
    claimBoundary: "Adaptive music fixture adapts old layer/crossfade state for deterministic runtime evidence; it does not play authored stems or prove Unity/Unreal audio middleware parity."
  };
}

function crossfadeSamples(curve: AdaptiveMusicCrossfadeCurve, steps: number): AdaptiveMusicFixture["crossfade"] {
  const outGain: number[] = [];
  const inGain: number[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    if (curve === "equal-power") {
      outGain.push(round(Math.cos(t * Math.PI * 0.5)));
      inGain.push(round(Math.sin(t * Math.PI * 0.5)));
    } else if (curve === "s-curve") {
      const s = (Math.sin((t - 0.5) * Math.PI) + 1) / 2;
      outGain.push(round(1 - s));
      inGain.push(round(s));
    } else {
      outGain.push(round(1 - t));
      inGain.push(round(t));
    }
  }
  return {
    outGain,
    inGain,
    equalPowerNormalized: curve === "equal-power" && outGain.every((out, index) => Math.abs(out * out + (inGain[index] ?? 0) * (inGain[index] ?? 0) - 1) < 0.002)
  };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
