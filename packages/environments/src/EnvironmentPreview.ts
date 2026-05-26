import type { ThreeCompatHDRIEnvironmentPreset, ThreeCompatEnvironmentProbeType } from "./HDRIEnvironment";

export interface ThreeCompatEnvironmentProbePreview {
  readonly environmentId: string;
  readonly probe: ThreeCompatEnvironmentProbeType;
  readonly roughness: number;
  readonly metalness: number;
  readonly transmission: number;
  readonly emissiveIntensity: number;
  readonly exposure: number;
  readonly intensity: number;
}

const PROBE_PRESETS: Record<ThreeCompatEnvironmentProbeType, Omit<ThreeCompatEnvironmentProbePreview, "environmentId" | "probe" | "exposure" | "intensity">> = {
  reflective: { roughness: 0.04, metalness: 1, transmission: 0, emissiveIntensity: 0 },
  rough: { roughness: 0.82, metalness: 1, transmission: 0, emissiveIntensity: 0 },
  transmissive: { roughness: 0.02, metalness: 0, transmission: 0.72, emissiveIntensity: 0 },
  emissive: { roughness: 0.35, metalness: 0, transmission: 0, emissiveIntensity: 2.4 }
};

export function createThreeCompatEnvironmentProbePreviews(preset: ThreeCompatHDRIEnvironmentPreset): readonly ThreeCompatEnvironmentProbePreview[] {
  return preset.probes.map((probe) => ({
    environmentId: preset.id,
    probe,
    exposure: preset.exposure,
    intensity: preset.intensity,
    ...PROBE_PRESETS[probe]
  }));
}
