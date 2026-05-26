import { createExternalParityToneMappingPolicy, toneMapExternalParityHdrPixels } from "../ToneMapping";

export interface ExternalParityTransmissionSample {
  readonly baseColor: readonly [number, number, number];
  readonly thickness: number;
  readonly attenuationColor: readonly [number, number, number];
  readonly attenuationDistance: number;
  readonly ior: number;
  readonly intensity: number;
}

export interface ExternalParityTransmissionResult {
  readonly transmittedColor: readonly [number, number, number];
  readonly displayColor: readonly [number, number, number];
  readonly bounded: true;
  readonly diagnostic: string;
}

export function evaluateExternalParityTransmission(sample: ExternalParityTransmissionSample): ExternalParityTransmissionResult {
  validateSample(sample);
  const attenuation = Math.exp(-sample.thickness / Math.max(0.0001, sample.attenuationDistance));
  const fresnelScale = Math.max(0, Math.min(1, (sample.ior - 1) / (sample.ior + 1)));
  const transmitted: [number, number, number] = [
    sample.baseColor[0] * sample.attenuationColor[0] * attenuation * sample.intensity * (1 - fresnelScale),
    sample.baseColor[1] * sample.attenuationColor[1] * attenuation * sample.intensity * (1 - fresnelScale),
    sample.baseColor[2] * sample.attenuationColor[2] * attenuation * sample.intensity * (1 - fresnelScale)
  ];
  const toneMapped = toneMapExternalParityHdrPixels(
    new Float32Array([transmitted[0], transmitted[1], transmitted[2], 1]),
    1,
    1,
    createExternalParityToneMappingPolicy("material-review", { operator: "reinhard", exposure: 1, gamma: 1, outputColorSpace: "srgb" })
  );
  return {
    transmittedColor: transmitted.map(round) as [number, number, number],
    displayColor: [toneMapped.pixels[0]!, toneMapped.pixels[1]!, toneMapped.pixels[2]!],
    bounded: true,
    diagnostic: "Bounded transmission approximation for material review; full refraction/caustics parity is not claimed."
  };
}

function validateSample(sample: ExternalParityTransmissionSample): void {
  if (sample.baseColor.length !== 3 || sample.attenuationColor.length !== 3) throw new Error("Transmission colors must be RGB tuples.");
  for (const value of [...sample.baseColor, ...sample.attenuationColor, sample.thickness, sample.attenuationDistance, sample.ior, sample.intensity]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Transmission sample values must be finite and non-negative.");
  }
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
