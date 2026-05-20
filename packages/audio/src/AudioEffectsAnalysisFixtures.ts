export type AudioCompressorPreset = "gentle" | "moderate" | "aggressive" | "limiter" | "vocal" | "drums" | "master";
export type AudioDelayPreset = "slapback" | "short_echo" | "medium_echo" | "long_echo" | "ping_pong" | "tape_echo";
export type AudioChorusPreset = "subtle" | "classic" | "deep" | "wide" | "ensemble" | "vibrato";
export type AudioDistortionCurve = "sigmoid" | "asymmetric" | "hardclip" | "softclip" | "fuzz" | "saturation";

export interface AudioEffectsAnalysisFixtureOptions {
  readonly preset?: AudioCompressorPreset;
  readonly inputPeakDb?: number;
  readonly intensity?: number;
}

export interface AudioEqBandFixture {
  readonly name: string;
  readonly type: "lowshelf" | "peaking" | "highshelf";
  readonly frequencyHz: number;
  readonly q: number;
  readonly gainDb: number;
  readonly enabled: boolean;
}

export interface AudioSpectrumBandFixture {
  readonly name: string;
  readonly minHz: number;
  readonly maxHz: number;
  readonly magnitude: number;
}

export interface AudioEffectsAnalysisFixture {
  readonly source: "origin-master-audio-effects-analysis-adapted";
  readonly effectChain: readonly ["parametric-eq", "dynamic-compressor", "delay", "chorus", "distortion", "filter", "spectrum-analyzer"];
  readonly compressor: {
    readonly preset: AudioCompressorPreset;
    readonly thresholdDb: number;
    readonly kneeDb: number;
    readonly ratio: number;
    readonly attackSeconds: number;
    readonly releaseSeconds: number;
    readonly inputPeakDb: number;
    readonly outputPeakDb: number;
    readonly gainReductionDb: number;
    readonly makeupGainDb: number;
    readonly limiterTriggered: boolean;
  };
  readonly eq: {
    readonly bands: readonly AudioEqBandFixture[];
    readonly activeBandCount: number;
    readonly lowShelfGainDb: number;
    readonly presenceGainDb: number;
    readonly outputGain: number;
  };
  readonly delay: {
    readonly source: "origin-master-delay-effect-adapted";
    readonly preset: AudioDelayPreset;
    readonly delayTimeSeconds: number;
    readonly feedback: number;
    readonly wetDryMix: number;
    readonly filterFrequencyHz: number;
    readonly pingPong: boolean;
    readonly repeatsAboveNoiseFloor: number;
  };
  readonly chorus: {
    readonly source: "origin-master-chorus-effect-adapted";
    readonly preset: AudioChorusPreset;
    readonly rateHz: number;
    readonly depthSeconds: number;
    readonly feedback: number;
    readonly wetDryMix: number;
    readonly delaySeconds: number;
    readonly voices: number;
    readonly stereoWidth: number;
  };
  readonly distortion: {
    readonly source: "origin-master-distortion-effect-adapted";
    readonly curve: AudioDistortionCurve;
    readonly amount: number;
    readonly preGain: number;
    readonly postGain: number;
    readonly wetDryMix: number;
    readonly harmonicBoost: number;
    readonly outputCeiling: number;
  };
  readonly filter: {
    readonly source: "origin-master-filter-effect-adapted";
    readonly type: "lowpass" | "highpass" | "bandpass";
    readonly frequencyHz: number;
    readonly q: number;
    readonly resonanceDb: number;
    readonly enabled: boolean;
  };
  readonly spectrum: {
    readonly bands: readonly AudioSpectrumBandFixture[];
    readonly barCount: number;
    readonly bars: readonly number[];
    readonly peakFrequencyHz: number;
    readonly peakMagnitude: number;
    readonly logarithmicScale: boolean;
  };
  readonly hash: string;
  readonly claimBoundary: string;
  readonly blockedClaims: readonly string[];
}

const COMPRESSOR_PRESETS: Record<AudioCompressorPreset, {
  readonly thresholdDb: number;
  readonly kneeDb: number;
  readonly ratio: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
}> = {
  gentle: { thresholdDb: -30, kneeDb: 20, ratio: 2, attackSeconds: 0.01, releaseSeconds: 0.3 },
  moderate: { thresholdDb: -24, kneeDb: 30, ratio: 4, attackSeconds: 0.005, releaseSeconds: 0.25 },
  aggressive: { thresholdDb: -18, kneeDb: 10, ratio: 8, attackSeconds: 0.001, releaseSeconds: 0.1 },
  limiter: { thresholdDb: -6, kneeDb: 0, ratio: 20, attackSeconds: 0.001, releaseSeconds: 0.05 },
  vocal: { thresholdDb: -20, kneeDb: 15, ratio: 3, attackSeconds: 0.005, releaseSeconds: 0.2 },
  drums: { thresholdDb: -18, kneeDb: 5, ratio: 6, attackSeconds: 0.001, releaseSeconds: 0.08 },
  master: { thresholdDb: -14, kneeDb: 8, ratio: 3, attackSeconds: 0.004, releaseSeconds: 0.16 }
};

const SPECTRUM_BANDS: readonly Omit<AudioSpectrumBandFixture, "magnitude">[] = [
  { name: "Sub Bass", minHz: 20, maxHz: 60 },
  { name: "Bass", minHz: 60, maxHz: 250 },
  { name: "Low Mid", minHz: 250, maxHz: 500 },
  { name: "Mid", minHz: 500, maxHz: 2_000 },
  { name: "High Mid", minHz: 2_000, maxHz: 4_000 },
  { name: "Presence", minHz: 4_000, maxHz: 6_000 },
  { name: "Brilliance", minHz: 6_000, maxHz: 20_000 }
];

export function sampleAudioEffectsAnalysisFixture(options: AudioEffectsAnalysisFixtureOptions = {}): AudioEffectsAnalysisFixture {
  const preset = options.preset ?? "master";
  const compressorPreset = COMPRESSOR_PRESETS[preset];
  const intensity = clamp01(options.intensity ?? 0.72);
  const inputPeakDb = clamp(options.inputPeakDb ?? -3.5, -60, 6);
  const overThresholdDb = Math.max(0, inputPeakDb - compressorPreset.thresholdDb);
  const compressedOverage = overThresholdDb / compressorPreset.ratio;
  const gainReductionDb = round(Math.max(0, overThresholdDb - compressedOverage));
  const makeupGainDb = round(Math.min(6, gainReductionDb * 0.38));
  const outputPeakDb = round(inputPeakDb - gainReductionDb + makeupGainDb);
  const eqBands = eqBandsForIntensity(intensity);
  const spectrumBands = SPECTRUM_BANDS.map((band, index) => ({
    ...band,
    magnitude: round(clamp01((Math.sin(index * 1.37 + intensity * 2.1) + 1) * 0.29 + intensity * (index === 1 || index === 5 ? 0.28 : 0.16)))
  }));
  const bars = spectrumBars(spectrumBands, 16);
  const peak = spectrumBands.reduce((best, band) => band.magnitude > best.magnitude ? band : best, spectrumBands[0]!);
  const fixture = {
    source: "origin-master-audio-effects-analysis-adapted" as const,
    effectChain: ["parametric-eq", "dynamic-compressor", "delay", "chorus", "distortion", "filter", "spectrum-analyzer"] as const,
    compressor: {
      preset,
      ...compressorPreset,
      inputPeakDb: round(inputPeakDb),
      outputPeakDb,
      gainReductionDb,
      makeupGainDb,
      limiterTriggered: outputPeakDb >= -0.5 || preset === "limiter"
    },
    eq: {
      bands: eqBands,
      activeBandCount: eqBands.filter((band) => band.enabled).length,
      lowShelfGainDb: eqBands[0]?.gainDb ?? 0,
      presenceGainDb: eqBands.find((band) => band.name === "presence-lift")?.gainDb ?? 0,
      outputGain: round(1 - Math.max(0, outputPeakDb) * 0.05)
    },
    delay: delayFixture(intensity),
    chorus: chorusFixture(intensity),
    distortion: distortionFixture(intensity, inputPeakDb),
    filter: filterFixture(intensity),
    spectrum: {
      bands: spectrumBands,
      barCount: bars.length,
      bars,
      peakFrequencyHz: Math.round((peak.minHz + peak.maxHz) / 2),
      peakMagnitude: peak.magnitude,
      logarithmicScale: true
    },
    hash: "",
    claimBoundary: "Audio effects fixture adapts old compressor, EQ, delay, chorus, distortion, filter, and spectrum-analysis concepts for deterministic telemetry; it does not instantiate a production WebAudio mastering graph or prove audio middleware parity.",
    blockedClaims: [
      "production WebAudio effects graph parity",
      "production delay/chorus/distortion/filter node graph parity",
      "real-time FFT browser analyzer certification",
      "audio middleware mastering parity",
      "Unity Audio Mixer parity",
      "Unreal Audio Mixer parity"
    ] as const
  };
  return {
    ...fixture,
    hash: stableHash([
      fixture.compressor.preset,
      fixture.compressor.outputPeakDb,
      fixture.compressor.gainReductionDb,
      fixture.delay.preset,
      fixture.delay.repeatsAboveNoiseFloor,
      fixture.chorus.voices,
      fixture.chorus.stereoWidth,
      fixture.distortion.curve,
      fixture.distortion.harmonicBoost,
      fixture.filter.frequencyHz,
      fixture.eq.bands.map((band) => `${band.frequencyHz}:${band.gainDb}`).join(","),
      fixture.spectrum.peakFrequencyHz,
      fixture.spectrum.peakMagnitude
    ].join("|"))
  };
}

function delayFixture(intensity: number): AudioEffectsAnalysisFixture["delay"] {
  const preset: AudioDelayPreset = intensity > 0.7 ? "tape_echo" : intensity > 0.52 ? "medium_echo" : "short_echo";
  const delayTimeSeconds = preset === "tape_echo" ? 0.42 : preset === "medium_echo" ? 0.5 : 0.25;
  const feedback = round(preset === "tape_echo" ? 0.58 : 0.22 + intensity * 0.35);
  const wetDryMix = round(0.24 + intensity * 0.34);
  return {
    source: "origin-master-delay-effect-adapted",
    preset,
    delayTimeSeconds,
    feedback,
    wetDryMix,
    filterFrequencyHz: Math.round(7_500 - intensity * 4_600),
    pingPong: preset === "tape_echo" || intensity > 0.82,
    repeatsAboveNoiseFloor: Math.max(1, Math.min(8, Math.ceil(Math.log(0.04) / Math.log(Math.max(0.05, feedback)))))
  };
}

function chorusFixture(intensity: number): AudioEffectsAnalysisFixture["chorus"] {
  const preset: AudioChorusPreset = intensity > 0.72 ? "ensemble" : intensity > 0.5 ? "classic" : "subtle";
  const voices = preset === "ensemble" ? 4 : preset === "classic" ? 2 : 1;
  return {
    source: "origin-master-chorus-effect-adapted",
    preset,
    rateHz: round(0.85 + intensity * 2.2),
    depthSeconds: round(0.0012 + intensity * 0.006),
    feedback: round(0.08 + intensity * 0.26),
    wetDryMix: round(0.18 + intensity * 0.42),
    delaySeconds: round(0.012 + intensity * 0.018),
    voices,
    stereoWidth: round(Math.min(1, 0.36 + voices * 0.13 + intensity * 0.22))
  };
}

function distortionFixture(intensity: number, inputPeakDb: number): AudioEffectsAnalysisFixture["distortion"] {
  const curve: AudioDistortionCurve = intensity > 0.76 ? "saturation" : intensity > 0.58 ? "softclip" : "sigmoid";
  const amount = round(18 + intensity * 62);
  const preGain = round(1 + intensity * 2.4);
  const postGain = round(Math.max(0.42, 1 - intensity * 0.36));
  const harmonicBoost = round(Math.max(0, amount / 100 * preGain * Math.max(0.25, (inputPeakDb + 24) / 24)));
  return {
    source: "origin-master-distortion-effect-adapted",
    curve,
    amount,
    preGain,
    postGain,
    wetDryMix: round(0.2 + intensity * 0.55),
    harmonicBoost,
    outputCeiling: round(Math.min(0.98, postGain + harmonicBoost * 0.08))
  };
}

function filterFixture(intensity: number): AudioEffectsAnalysisFixture["filter"] {
  const type = intensity > 0.62 ? "lowpass" : "bandpass";
  const frequencyHz = Math.round(type === "lowpass" ? 6_800 - intensity * 2_400 : 1_200 + intensity * 2_200);
  const q = round(0.7 + intensity * 1.6);
  return {
    source: "origin-master-filter-effect-adapted",
    type,
    frequencyHz,
    q,
    resonanceDb: round(q * 2.6),
    enabled: true
  };
}

function eqBandsForIntensity(intensity: number): readonly AudioEqBandFixture[] {
  return [
    { name: "low-body", type: "lowshelf", frequencyHz: 120, q: 0.7, gainDb: round(2.4 * intensity), enabled: true },
    { name: "mud-cut", type: "peaking", frequencyHz: 360, q: 1.1, gainDb: round(-1.8 * intensity), enabled: true },
    { name: "presence-lift", type: "peaking", frequencyHz: 3_200, q: 0.9, gainDb: round(2.2 * intensity), enabled: true },
    { name: "air", type: "highshelf", frequencyHz: 8_500, q: 0.8, gainDb: round(1.6 * intensity), enabled: true }
  ];
}

function spectrumBars(bands: readonly AudioSpectrumBandFixture[], count: number): readonly number[] {
  const bars: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const band = bands[Math.min(bands.length - 1, Math.floor(index / count * bands.length))]!;
    const shimmer = 0.85 + 0.15 * Math.sin(index * 0.9);
    bars.push(round(clamp01(band.magnitude * shimmer)));
  }
  return bars;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
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
