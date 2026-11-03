import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_AURA_ASSET_MANIFEST,
  DEFAULT_AURA_ASSET_OUTPUT_DIR,
  DEFAULT_AURA_ASSET_PUBLIC_PATH,
  DEFAULT_AURA_ASSET_TYPEGEN,
  NATIVE_CATALOG_MODEL_FORMATS,
} from "./asset-constants.js";
import type {
  AuraCliAssetEntry,
  AuraCliAssetIntegrity,
  AuraCliAssetManifest,
} from "./asset-core-types.js";
import { qrAssetsFlagEnabled } from "./admission/qrFlags.js";

export function readAssetManifest(projectDir: string): AuraCliAssetManifest {
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  if (!existsSync(manifestPath)) {
    return {
      schema: "aura3d.assets/1.0",
      assetBasePath: DEFAULT_AURA_ASSET_PUBLIC_PATH,
      outputDir: DEFAULT_AURA_ASSET_OUTPUT_DIR,
      typegen: DEFAULT_AURA_ASSET_TYPEGEN,
      assets: [],
    };
  }
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isAssetManifest(parsed)) {
    const schema = schemaField(parsed);
    throw new Error(`Unsupported Aura3D asset manifest schema: ${String(schema)}`);
  }
  return normalizeManifestIntegrity(parsed);
}

export function writeAssetManifest(projectDir: string, manifest: AuraCliAssetManifest): void {
  // C-17 stub rule: the writer emits "aura3d.assets/1.1" once A3D_QR_ASSETS
  // is on. With the flag off it preserves the schema it was handed (the
  // migration tool may hand it a 1.1 document deliberately).
  const schema = qrAssetsFlagEnabled() || manifest.schema === "aura3d.assets/1.1"
    ? "aura3d.assets/1.1" as const
    : "aura3d.assets/1.0" as const;
  const normalized = normalizeManifestIntegrity(manifest);
  writeFileSync(resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST), `${JSON.stringify({ ...normalized, schema }, null, 2)}\n`);
}

export function writeTypedAssets(projectDir: string, manifest = readAssetManifest(projectDir)): string {
  // Callers may pass an in-memory manifest directly after admission rather than
  // reading it back from disk. Apply exactly the same migration and validation
  // in that case, and never infer dependency digests from mutable files here.
  manifest = normalizeManifestIntegrity(manifest);
  const path = resolve(projectDir, manifest.typegen);
  mkdirSync(dirname(path), { recursive: true });
  const publicAssetApi = resolveTypedAssetApi(projectDir);
  const lines = [
    `import { defineAuraAssets } from ${JSON.stringify(publicAssetApi)};`,
    `import type { AuraAssetDefinition, AuraAssetMap } from ${JSON.stringify(publicAssetApi)};`,
    "",
    "type AuraGeneratedAssetDefinitions = {",
    ...manifest.assets.map((asset) => {
      const bounds = asset.bounds
        ? " readonly bounds: readonly [number, number, number];"
        : "";
      const integrity = asset.integrity
        ? " readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies?: Readonly<Record<string, string>>; readonly requireDependencies?: boolean };"
        : "";
      const formatMetadata = asset.formatMetadata
        ? " readonly formatMetadata: { readonly version?: string; readonly mediaType?: string; readonly adapter?: string; readonly source?: { readonly format: string; readonly version?: string; readonly conversion: \"offline\" } };"
        : "";
      // Keep the generated declaration compact enough for very large asset
      // manifests while preserving the required fields consumers are allowed
      // to rely on. `AuraAssetDefinition` intentionally models partially known
      // external assets, so url/hash/bounds are optional there; a generated
      // manifest entry has already validated and written these exact fields.
      return `  readonly ${JSON.stringify(asset.id)}: AuraAssetDefinition & { readonly type: ${JSON.stringify(asset.type)}; readonly format: ${JSON.stringify(asset.format)}; readonly url: string; readonly hash: string;${bounds}${integrity}${formatMetadata} };`;
    }),
    "};",
    "",
    "export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({",
    ...manifest.assets.map((asset) => {
      const metadata = {
        materials: asset.materials,
        animations: asset.animations,
        // C-17: 1.1 entries carry {name, duration, channelCount} clip objects
        // (Q-05-1); 1.0 entries keep the legacy clip-name list.
        animationClips: asset.animationClips ?? asset.animations,
        animationMetadata: asset.animationMetadata ?? createReadinessAnimationMetadata(asset.animations),
        humanoid: asset.humanoid?.humanoid ?? false,
        humanoidStatus: asset.humanoid?.status ?? "unknown",
        humanoidConfidence: asset.humanoid?.confidence ?? "low",
        skeleton: asset.skeleton,
        morphTargets: asset.morphTargets,
        hierarchy: asset.hierarchy,
        // Keep provider task IDs and settings in the durable manifest, not public game source.
        provenance: asset.provenance ? { ...asset.provenance, generation: undefined } : undefined,
        modelInspection: asset.modelInspection,
        sourcePath: asset.source,
        outputPath: asset.outputPath,
        license: asset.provenance?.license,
        author: asset.provenance?.author,
        boundsMetadata: asset.boundsMetadata,
        materialMetadata: asset.materialMetadata,
        orientation: asset.orientation,
        nodeNames: asset.nodeNames ?? [],
        textures: asset.textures,
        dependencies: asset.dependencies ?? [],
        thumbnailUrl: asset.thumbnailUrl,
        quality: asset.quality ?? "ungraded",
        role: asset.role ?? "unknown",
        suitabilityReason: asset.suitabilityReason,
        renderedProbe: asset.renderedProbe,
        gameGeometry: asset.gameGeometry,
      };
      return [
        `  ${JSON.stringify(asset.id)}: {`,
        formatField("type", asset.type),
        formatField("format", asset.format),
        ...(asset.formatMetadata ? [formatField("formatMetadata", asset.formatMetadata)] : []),
        formatField("url", asset.url),
        // Legacy manifest entries carry a bare `sha256` field instead of the
        // canonical `sha256-<hex>` hash; normalize it so generated refs never
        // emit `hash: undefined` (which fails production provenance checks).
        formatField(
          "hash",
          asset.integrity?.digest ?? asset.hash ?? (asset.sha256 ? normalizeSha256(asset.sha256) ?? asset.sha256 : undefined)
        ),
        ...(asset.integrity ? [formatField("integrity", asset.integrity)] : []),
        formatField("bounds", asset.bounds ?? [0, 0, 0]),
        `    sizeBytes: ${asset.sizeBytes},`,
        formatField("metadata", metadata),
        "  },",
      ].join("\n");
    }),
    "} as const);",
    "",
    "export type AuraGeneratedAssets = typeof assets;",
    "",
  ];
  writeFileSync(path, lines.join("\n"));
  return path;
}

/**
 * Normalize only a digest already recorded by admission. No filesystem reads
 * happen during migration: hashing a dependency here would silently trust any
 * bytes that happened to be present when an old manifest was type-generated.
 */
function normalizeManifestIntegrity(manifest: AuraCliAssetManifest): AuraCliAssetManifest {
  return {
    ...manifest,
    assets: manifest.assets.map((asset, index) => {
      if (asset === null || typeof asset !== "object" || Array.isArray(asset)) {
        throw new Error(`Asset manifest entry ${index} must be an object.`);
      }
      return normalizeModelInspection(normalizeAssetIntegrity(validateAssetFormatMetadata(asset)));
    }),
  };
}

function normalizeModelInspection(asset: AuraCliAssetEntry): AuraCliAssetEntry {
  if (asset.type !== "model") return asset;
  const value: unknown = asset.modelInspection;
  if (value === undefined) return { ...asset, modelInspection: { version: 1, status: "legacy-unverified" } };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Asset "${asset.id}" has invalid model inspection metadata.`);
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !["parser-inspected", "metadata-only", "legacy-unverified"].includes(String(record.status))) {
    throw new Error(`Asset "${asset.id}" has unsupported model inspection metadata.`);
  }
  if (record.status === "parser-inspected") {
    const inspector = record.inspector;
    const digest = normalizeSha256(record.digest);
    if (typeof inspector !== "string" || (!["obj", "ply", "stl", "3mf", "vox"].includes(inspector) && !NATIVE_CATALOG_MODEL_FORMATS.has(inspector)) || inspector !== asset.format || !digest || digest !== normalizeSha256(asset.hash ?? asset.sha256)) {
      throw new Error(`Asset "${asset.id}" has invalid or stale model parser inspection metadata.`);
    }
  } else if (record.inspector !== undefined || (record.digest !== undefined && !normalizeSha256(record.digest))) {
    throw new Error(`Asset "${asset.id}" has invalid model inspection metadata.`);
  }
  return asset;
}

function validateAssetFormatMetadata(asset: AuraCliAssetEntry): AuraCliAssetEntry {
  const value: unknown = asset.formatMetadata;
  if (value === undefined) return asset;
  const label = typeof asset.id === "string" ? asset.id : "unknown";
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Asset "${label}" has invalid format metadata.`);
  }
  const metadata = value as Record<string, unknown>;
  for (const field of ["version", "mediaType", "adapter"] as const) {
    const candidate = metadata[field];
    if (candidate !== undefined && (typeof candidate !== "string" || candidate.trim().length === 0)) {
      throw new Error(`Asset "${label}" has an invalid format ${field}.`);
    }
  }
  if (metadata.source !== undefined) {
    const source = metadata.source;
    if (source === null || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(`Asset "${label}" has invalid converted-source metadata.`);
    }
    const original = source as Record<string, unknown>;
    if (typeof original.format !== "string" || !original.format.trim() || original.conversion !== "offline"
      || (original.version !== undefined && (typeof original.version !== "string" || !original.version.trim()))) {
      throw new Error(`Asset "${label}" has invalid offline conversion metadata.`);
    }
  }
  // Keep extension fields intact when round-tripping an admitted format.
  return asset;
}

function normalizeAssetIntegrity(asset: AuraCliAssetEntry): AuraCliAssetEntry {
  const label = typeof asset.id === "string" ? asset.id : "unknown";
  // Both fields identify the admitted document when present. Checking only
  // the preferred field would hide a stale or malformed second claim from
  // generated assets and could make the manifest appear trustworthy.
  if (asset.hash !== undefined && asset.sha256 !== undefined) {
    const hash = normalizeSha256(asset.hash);
    const sha256 = normalizeSha256(asset.sha256);
    if (!hash || !sha256 || hash !== sha256) {
      throw new Error(`Asset "${label}" has invalid or conflicting hash and sha256 metadata.`);
    }
  }
  const recordedHash = asset.hash ?? asset.sha256;
  const legacyDigest = normalizeSha256(recordedHash);
  if (asset.integrity === undefined) {
    // Preserve old manifests with missing or noncanonical hashes for the
    // existing validation command to diagnose. Never invent a digest.
    return legacyDigest ? { ...asset, integrity: { version: 1, digest: legacyDigest } } : asset;
  }

  const value: unknown = asset.integrity;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Asset "${label}" has invalid integrity metadata.`);
  }
  const record = value as Record<string, unknown>;
  const digest = normalizeSha256(record.digest);
  if (record.version !== 1 || !digest) {
    throw new Error(`Asset "${label}" has unsupported or invalid integrity digest metadata.`);
  }
  if (recordedHash !== undefined && (!legacyDigest || legacyDigest !== digest)) {
    throw new Error(`Asset "${label}" has conflicting document integrity and hash metadata.`);
  }
  if (record.requireDependencies !== undefined && typeof record.requireDependencies !== "boolean") {
    throw new Error(`Asset "${label}" has invalid integrity dependency policy.`);
  }

  let dependencies: Readonly<Record<string, string>> | undefined;
  if (record.dependencies !== undefined) {
    if (record.dependencies === null || typeof record.dependencies !== "object" || Array.isArray(record.dependencies)) {
      throw new Error(`Asset "${label}" has invalid integrity dependency metadata.`);
    }
    const entries = Object.entries(record.dependencies as Record<string, unknown>).map(([uri, input]) => {
      const dependencyDigest = normalizeSha256(input);
      if (!uri || !dependencyDigest) {
        throw new Error(`Asset "${label}" has an invalid dependency URI or integrity digest.`);
      }
      return [uri, dependencyDigest] as const;
    });
    dependencies = Object.fromEntries(entries);
  }
  const integrity: AuraCliAssetIntegrity = {
    // Preserve additional fields from the same record version while
    // canonicalizing every field that affects current integrity enforcement.
    ...record,
    version: 1,
    digest,
    ...(dependencies !== undefined ? { dependencies } : {}),
    ...(record.requireDependencies !== undefined ? { requireDependencies: record.requireDependencies as boolean } : {}),
  };
  return { ...asset, integrity };
}

function normalizeSha256(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(?:sha256-)?([0-9a-f]{64})$/i.exec(value);
  return match ? `sha256-${match[1]!.toLowerCase()}` : undefined;
}

export function resolveTypedAssetApi(projectDir: string): "@aura3d/lean" | "@aura3d/engine" {
  const packagePath = resolve(projectDir, "package.json");
  if (!existsSync(packagePath)) return "@aura3d/engine";
  try {
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      readonly dependencies?: Record<string, string>;
      readonly devDependencies?: Record<string, string>;
    };
    const hasEngine = manifest.dependencies?.["@aura3d/engine"] !== undefined
      || manifest.devDependencies?.["@aura3d/engine"] !== undefined;
    if (hasEngine) return "@aura3d/engine";
    const hasLean = manifest.dependencies?.["@aura3d/lean"] !== undefined
      || manifest.devDependencies?.["@aura3d/lean"] !== undefined;
    return hasLean ? "@aura3d/lean" : "@aura3d/engine";
  } catch {
    return "@aura3d/engine";
  }
}

export function listAssets(options: { readonly projectDir?: string } = {}): readonly AuraCliAssetEntry[] {
  return readAssetManifest(resolve(options.projectDir ?? process.cwd())).assets;
}

function formatField(name: string, value: unknown): string {
  return `    ${name}: ${formatLiteral(value, 4)},`;
}

function formatLiteral(value: unknown, indent: number): string {
  const raw = JSON.stringify(value, null, 2);
  if (raw === undefined) return "undefined";
  return raw
    .split("\n")
    // A JSON object key named __proto__ is ordinary data, whereas the same
    // spelling in a JavaScript object literal changes the object's prototype.
    // Preserve unusual but valid dependency URIs in generated TypeScript.
    .map((line, index) => {
      const safeLine = line.replace(/^(\s*)"__proto__":/, '$1["__proto__"]:');
      return index === 0 ? safeLine : `${" ".repeat(indent)}${safeLine}`;
    })
    .join("\n");
}

function createReadinessAnimationMetadata(animations: readonly string[]): {
  readonly clipCount: number;
  readonly clips: readonly { readonly index: number; readonly name: string }[];
} {
  return {
    clipCount: animations.length,
    clips: animations.map((name, index) => ({ index, name })),
  };
}

function isAssetManifest(value: unknown): value is AuraCliAssetManifest {
  return value !== null &&
    typeof value === "object" &&
    "schema" in value &&
    (value.schema === "aura3d.assets/1.0" || value.schema === "aura3d.assets/1.1") &&
    "assets" in value &&
    Array.isArray(value.assets);
}

function schemaField(value: unknown): unknown {
  if (value === null || typeof value !== "object" || !("schema" in value)) return undefined;
  return value.schema;
}
