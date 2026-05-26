import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createThreeCompatPMREMDiagnostics, type ThreeCompatPMREMDiagnostics, type ThreeCompatPMREMPreset } from "./PMREMPreset";

export type ThreeCompatEnvironmentKind = "real-hdri" | "procedural-hdr";
export type ThreeCompatEnvironmentProbeType = "reflective" | "rough" | "transmissive" | "emissive";

export interface ThreeCompatHDRIEnvironmentPreset {
  readonly id: string;
  readonly label: string;
  readonly kind: ThreeCompatEnvironmentKind;
  readonly class: string;
  readonly license: string;
  readonly author: string;
  readonly sourceName?: string;
  readonly sourceUri?: string;
  readonly downloadUri?: string;
  readonly localPath?: string;
  readonly sha256?: string;
  readonly bytes?: number;
  readonly resolution: readonly [number, number];
  readonly format: "rgbe-hdr" | "procedural-linear-hdr";
  readonly intensity: number;
  readonly backgroundIntensity: number;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly rotation: number;
  readonly pmrem: ThreeCompatPMREMPreset;
  readonly probes: readonly ThreeCompatEnvironmentProbeType[];
}

export interface ThreeCompatEnvironmentDiagnostics {
  readonly id: string;
  readonly kind: ThreeCompatEnvironmentKind;
  readonly resolution: readonly [number, number];
  readonly format: string;
  readonly memoryBytes: number;
  readonly pmrem: ThreeCompatPMREMDiagnostics;
  readonly warnings: readonly string[];
}

export function verifyThreeCompatHdriFile(preset: ThreeCompatHDRIEnvironmentPreset): boolean {
  if (preset.kind !== "real-hdri" || !preset.localPath || !preset.sha256) {
    return preset.kind === "procedural-hdr";
  }
  const file = resolve(preset.localPath);
  if (!existsSync(file)) return false;
  const data = readFileSync(file);
  return createHash("sha256").update(data).digest("hex") === preset.sha256;
}

export function createThreeCompatEnvironmentDiagnostics(preset: ThreeCompatHDRIEnvironmentPreset): ThreeCompatEnvironmentDiagnostics {
  const [width, height] = preset.resolution;
  const bytesPerPixel = preset.format === "rgbe-hdr" ? 4 : 8;
  const memoryBytes = width * height * bytesPerPixel;
  const pmrem = createThreeCompatPMREMDiagnostics(preset.pmrem, preset.format);
  return {
    id: preset.id,
    kind: preset.kind,
    resolution: preset.resolution,
    format: preset.format,
    memoryBytes: memoryBytes + pmrem.estimatedBytes,
    pmrem,
    warnings: [
      ...(width < 1024 || height < 512 ? ["Environment resolution is below ThreeCompat minimum."] : []),
      ...(preset.kind === "real-hdri" && !verifyThreeCompatHdriFile(preset) ? ["Real HDRI source is missing or sha256 verification failed."] : []),
      ...pmrem.warnings
    ]
  };
}
