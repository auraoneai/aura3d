import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type V6EnvironmentProbeType = "diffuseIrradiance" | "specularPrefilter" | "brdfLut" | "background";

export interface V6EnvironmentRequirements {
  readonly minimumRealHdriSources: number;
  readonly minimumResolution: readonly [number, number];
  readonly minimumTotalBytes: number;
  readonly requiredProbeTypes: readonly V6EnvironmentProbeType[];
  readonly everyFlagshipRequiresNamedEnvironment: boolean;
  readonly mustVerifySha256: boolean;
  readonly mustFeedRendererIbl: boolean;
}

export interface V6PMREMPreset {
  readonly faceSize: number;
  readonly mipCount: number;
  readonly cacheKey: string;
}

export interface V6HDREnvironment {
  readonly id: string;
  readonly label: string;
  readonly class: string;
  readonly license: string;
  readonly author: string;
  readonly sourceName: string;
  readonly sourceUri: string;
  readonly downloadUri: string;
  readonly localPath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly resolution: readonly [number, number];
  readonly format: "rgbe-hdr";
  readonly intensity: number;
  readonly backgroundIntensity: number;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly rotation: number;
  readonly pmrem: V6PMREMPreset;
  readonly probes: readonly V6EnvironmentProbeType[];
}

export interface V6EnvironmentManifest {
  readonly schema: "a3d-production-runtime-hdr-environment-corpus/v1";
  readonly requirements: V6EnvironmentRequirements;
  readonly claimBoundary: string;
  readonly flagshipBindings: Readonly<Record<string, string>>;
  readonly environments: readonly V6HDREnvironment[];
}

export interface V6HDRInspection {
  readonly hasRadianceHeader: boolean;
  readonly hasFormatHeader: boolean;
  readonly declaredResolution: readonly [number, number] | null;
  readonly expectedResolution: readonly [number, number];
  readonly dataBytes: number;
}

export interface V6EnvironmentReadinessEntry {
  readonly id: string;
  readonly localPath: string;
  readonly exists: boolean;
  readonly sha256Matches: boolean;
  readonly bytesMatch: boolean;
  readonly inspection: V6HDRInspection | null;
}

export interface V6EnvironmentCorpusSummary {
  readonly schema: "a3d-production-runtime-environment-readiness/v1";
  readonly pass: boolean;
  readonly environmentCount: number;
  readonly existingEnvironmentCount: number;
  readonly shaVerifiedEnvironmentCount: number;
  readonly totalBytes: number;
  readonly classCoverage: readonly string[];
  readonly probeCoverage: readonly string[];
  readonly flagshipBindingCount: number;
  readonly unresolvedFlagshipBindings: readonly string[];
  readonly pmremFaceSizes: readonly number[];
  readonly failures: readonly string[];
  readonly entries: readonly V6EnvironmentReadinessEntry[];
}

export function loadV6EnvironmentManifest(path = "fixtures/environment-corpus/manifest.json"): V6EnvironmentManifest {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as V6EnvironmentManifest;
}

export function inspectV6HDR(path: string, expectedResolution: readonly [number, number]): V6HDRInspection {
  const data = readFileSync(resolve(path));
  const header = data.toString("ascii", 0, Math.min(data.length, 1024));
  const resolutionMatch = header.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
  return {
    hasRadianceHeader: /^#\?RADIANCE/m.test(header) || /^#\?RGBE/m.test(header),
    hasFormatHeader: /FORMAT=32-bit_rle_rgbe/.test(header),
    declaredResolution: resolutionMatch ? [Number(resolutionMatch[2]), Number(resolutionMatch[1])] : null,
    expectedResolution,
    dataBytes: data.byteLength
  };
}

export function createV6EnvironmentCorpusSummary(manifest = loadV6EnvironmentManifest()): V6EnvironmentCorpusSummary {
  const entries = manifest.environments.map((environment): V6EnvironmentReadinessEntry => {
    const path = resolve(environment.localPath);
    const exists = existsSync(path);
    const bytesMatch = exists && statSync(path).size === environment.bytes;
    const sha256Matches = exists && createHash("sha256").update(readFileSync(path)).digest("hex") === environment.sha256;
    const inspection = exists ? inspectV6HDR(path, environment.resolution) : null;
    return {
      id: environment.id,
      localPath: environment.localPath,
      exists,
      sha256Matches,
      bytesMatch,
      inspection
    };
  });
  const ids = new Set(manifest.environments.map((environment) => environment.id));
  const unresolvedFlagshipBindings = Object.entries(manifest.flagshipBindings).filter(([, environmentId]) => !ids.has(environmentId)).map(([flagship]) => flagship);
  const totalBytes = manifest.environments.reduce((total, environment) => total + environment.bytes, 0);
  const probeCoverage = [...new Set(manifest.environments.flatMap((environment) => environment.probes))].sort();
  const [minimumWidth, minimumHeight] = manifest.requirements.minimumResolution;
  const failures = [
    ...(manifest.environments.length < manifest.requirements.minimumRealHdriSources ? ["too few real HDRI environments"] : []),
    ...(entries.some((entry) => !entry.exists) ? ["one or more HDRI files are missing"] : []),
    ...(entries.some((entry) => !entry.sha256Matches) ? ["one or more HDRI sha256 checks failed"] : []),
    ...(entries.some((entry) => !entry.bytesMatch) ? ["one or more HDRI byte-size checks failed"] : []),
    ...(manifest.environments.some((environment) => environment.resolution[0] < minimumWidth || environment.resolution[1] < minimumHeight) ? ["one or more HDRIs are below the minimum resolution"] : []),
    ...(totalBytes < manifest.requirements.minimumTotalBytes ? [`total HDR bytes ${totalBytes} is below ${manifest.requirements.minimumTotalBytes}`] : []),
    ...manifest.requirements.requiredProbeTypes.filter((probe) => !probeCoverage.includes(probe)).map((probe) => `missing required probe type ${probe}`),
    ...(unresolvedFlagshipBindings.length > 0 ? [`unresolved flagship bindings: ${unresolvedFlagshipBindings.join(", ")}`] : []),
    ...(entries.some((entry) => !entry.inspection?.hasRadianceHeader || !entry.inspection.hasFormatHeader) ? ["one or more HDR files do not expose a Radiance/RGBE header"] : [])
  ];
  return {
    schema: "a3d-production-runtime-environment-readiness/v1",
    pass: failures.length === 0,
    environmentCount: manifest.environments.length,
    existingEnvironmentCount: entries.filter((entry) => entry.exists).length,
    shaVerifiedEnvironmentCount: entries.filter((entry) => entry.sha256Matches).length,
    totalBytes,
    classCoverage: [...new Set(manifest.environments.map((environment) => environment.class))].sort(),
    probeCoverage,
    flagshipBindingCount: Object.keys(manifest.flagshipBindings).length,
    unresolvedFlagshipBindings,
    pmremFaceSizes: [...new Set(manifest.environments.map((environment) => environment.pmrem.faceSize))].sort((a, b) => a - b),
    failures,
    entries
  };
}
