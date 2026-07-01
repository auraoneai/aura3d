import { resolve } from "node:path";
import {
  arrayValue,
  readJson,
  recordValue,
  stringArray,
  stringValue,
  vectorValue
} from "./showcase-spec-replacement-values.js";
import { parsePlatformerPlayableSurfaceMap, parseRacingTrackTopology } from "./showcase-spec-replacement-game-geometry.js";
import type {
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingTrackTopology,
  ShowcaseSpecReplacementProvenance
} from "./showcase-spec-types.js";

export interface ManifestAsset {
  readonly id: string;
  readonly role?: string;
  readonly quality?: "release" | "candidate" | "prototype";
  readonly hash?: string;
  readonly url?: string;
  readonly source?: string;
  readonly outputPath?: string;
  readonly bounds?: readonly [number, number, number];
  readonly boundsMetadata?: {
    readonly size?: readonly [number, number, number];
  };
  readonly materials?: readonly unknown[];
  readonly textures?: readonly unknown[];
  readonly animations?: readonly unknown[];
  readonly skeleton?: {
    readonly skinCount?: number;
  };
  readonly morphTargets?: {
    readonly targetCount?: number;
  };
  readonly provenance?: ShowcaseSpecReplacementProvenance & {
    readonly sourceFamily?: string;
    readonly sourceUrl?: string;
    readonly licenseName?: string;
  };
  readonly suitabilityReason?: string;
  readonly renderedProbe?: {
    readonly url?: string;
    readonly foregroundBounds?: unknown;
  };
  readonly orientation?: unknown;
  readonly warnings?: readonly string[];
  readonly racingTopology?: ShowcaseRacingTrackTopology;
  readonly playableSurfaceMap?: ShowcasePlatformerPlayableSurfaceMap;
}

export function readManifestAssets(projectDir: string): readonly ManifestAsset[] {
  const manifest = readJson(resolve(projectDir, "aura.assets.json"));
  const assets = recordValue(manifest)?.assets;
  if (!Array.isArray(assets)) return [];
  return assets.flatMap((value) => manifestAsset(value));
}

export function createProvenance(asset: ManifestAsset): ShowcaseSpecReplacementProvenance {
  const provenance = asset.provenance;
  return {
    sourcePage: provenance?.sourcePage,
    downloadUrl: provenance?.downloadUrl ?? provenance?.sourceUrl ?? asset.url,
    license: provenance?.license,
    licenseUrl: provenance?.licenseUrl,
    author: provenance?.author,
    assetHash: asset.hash
  };
}

export function hasDurableProvenance(provenance: ShowcaseSpecReplacementProvenance): boolean {
  return Boolean(
    provenance.assetHash &&
    provenance.sourcePage &&
    provenance.downloadUrl &&
    provenance.license &&
    provenance.author
  );
}

function manifestAsset(value: unknown): readonly ManifestAsset[] {
  const record = recordValue(value);
  const id = stringValue(record?.id);
  if (!record || !id) return [];
  const gameGeometry = recordValue(record.gameGeometry);
  return [{
    id,
    role: stringValue(record.role),
    quality: qualityValue(record.quality),
    hash: stringValue(record.hash),
    url: stringValue(record.url),
    source: stringValue(record.source),
    outputPath: stringValue(record.outputPath),
    bounds: vectorValue(record.bounds),
    boundsMetadata: recordValue(record.boundsMetadata),
    materials: arrayValue(record.materials),
    textures: arrayValue(record.textures),
    animations: arrayValue(record.animations),
    skeleton: recordValue(record.skeleton),
    morphTargets: recordValue(record.morphTargets),
    provenance: recordValue(record.provenance),
    suitabilityReason: stringValue(record.suitabilityReason),
    renderedProbe: recordValue(record.renderedProbe),
    orientation: record.orientation,
    warnings: stringArray(record.warnings),
    racingTopology: parseRacingTrackTopology(record.racingTopology) ?? parseRacingTrackTopology(gameGeometry?.racingTopology),
    playableSurfaceMap: parsePlatformerPlayableSurfaceMap(record.playableSurfaceMap) ?? parsePlatformerPlayableSurfaceMap(gameGeometry?.playableSurfaceMap)
  }];
}

function qualityValue(value: unknown): ManifestAsset["quality"] {
  return value === "release" || value === "candidate" || value === "prototype" ? value : undefined;
}
