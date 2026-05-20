import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createV5PMREMDiagnostics, type V5PMREMDiagnostics, type V5PMREMPreset } from "./PMREMPreset";

export type V5EnvironmentKind = "real-hdri" | "procedural-hdr";
export type V5EnvironmentProbeType = "reflective" | "rough" | "transmissive" | "emissive";

export interface V5HDRIEnvironmentPreset {
  readonly id: string;
  readonly label: string;
  readonly kind: V5EnvironmentKind;
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
  readonly pmrem: V5PMREMPreset;
  readonly probes: readonly V5EnvironmentProbeType[];
}

export interface V5EnvironmentDiagnostics {
  readonly id: string;
  readonly kind: V5EnvironmentKind;
  readonly resolution: readonly [number, number];
  readonly format: string;
  readonly memoryBytes: number;
  readonly pmrem: V5PMREMDiagnostics;
  readonly warnings: readonly string[];
}

export function verifyV5HdriFile(preset: V5HDRIEnvironmentPreset): boolean {
  if (preset.kind !== "real-hdri" || !preset.localPath || !preset.sha256) {
    return preset.kind === "procedural-hdr";
  }
  const file = resolve(preset.localPath);
  if (!existsSync(file)) return false;
  const data = readFileSync(file);
  return createHash("sha256").update(data).digest("hex") === preset.sha256;
}

export function createV5EnvironmentDiagnostics(preset: V5HDRIEnvironmentPreset): V5EnvironmentDiagnostics {
  const [width, height] = preset.resolution;
  const bytesPerPixel = preset.format === "rgbe-hdr" ? 4 : 8;
  const memoryBytes = width * height * bytesPerPixel;
  const pmrem = createV5PMREMDiagnostics(preset.pmrem, preset.format);
  return {
    id: preset.id,
    kind: preset.kind,
    resolution: preset.resolution,
    format: preset.format,
    memoryBytes: memoryBytes + pmrem.estimatedBytes,
    pmrem,
    warnings: [
      ...(width < 1024 || height < 512 ? ["Environment resolution is below V5 minimum."] : []),
      ...(preset.kind === "real-hdri" && !verifyV5HdriFile(preset) ? ["Real HDRI source is missing or sha256 verification failed."] : []),
      ...pmrem.warnings
    ]
  };
}
