import { AURA_DEFAULT_ASSET_LIBRARY, type AuraAssetLibraryManifest, type AuraAssetManifestEntry } from "./AuraAssetLibrary.js";
import { createPrimitivePlaceholder, type AuraPlaceholderAsset } from "./AuraPlaceholderFactory.js";
import { diagnostic, type AuraSceneValidationIssue } from "./AuraSceneValidator.js";
import type { AuraAssetRequirement } from "./AuraSceneIR.js";

export interface AuraResolvedAsset {
  readonly requirement: AuraAssetRequirement;
  readonly matched?: AuraAssetManifestEntry;
  readonly placeholder?: AuraPlaceholderAsset;
  readonly resolved: boolean;
  readonly diagnostics: readonly string[];
}

export interface AuraAssetResolutionReport {
  readonly networkUsed: false;
  readonly assets: readonly {
    readonly requirementId: string;
    readonly assetId: string;
    readonly uri: string;
    readonly provenance: {
      readonly source: string;
      readonly license: string;
    };
  }[];
  readonly placeholders: readonly {
    readonly requirementId: string;
    readonly semantic: string;
    readonly placeholderKind: "primitive";
    readonly primitive: string;
  }[];
  readonly missing: readonly {
    readonly requirementId: string;
    readonly required: boolean;
  }[];
  readonly diagnostics: readonly AuraSceneValidationIssue[];
}

export interface AuraAssetResolver {
  readonly manifest: AuraAssetLibraryManifest;
  resolve(requirements: readonly unknown[], options?: { readonly sceneId?: string }): Promise<AuraAssetResolutionReport>;
  resolveOne(requirement: unknown): AuraResolvedAsset;
  resolveAll(requirements: readonly unknown[]): readonly AuraResolvedAsset[];
}

export interface AuraAssetResolverOptions {
  readonly manifest?: AuraAssetLibraryManifest | {
    readonly assets: readonly {
      readonly id: string;
      readonly semantic?: string;
      readonly tags: readonly string[];
      readonly uri: string;
      readonly license?: string;
      readonly source?: string;
    }[];
  };
}

export function createDefaultAssetResolver(options: AuraAssetResolverOptions | AuraAssetLibraryManifest = {}): AuraAssetResolver {
  const manifest = normalizeManifest(options);
  return {
    manifest,
    async resolve(requirements) {
      const resolved = this.resolveAll(requirements);
      return {
        networkUsed: false,
        assets: resolved.filter((asset) => asset.matched).map((asset) => ({
          requirementId: asset.requirement.id,
          assetId: asset.matched?.id ?? "",
          uri: asset.matched?.uri ?? "",
          provenance: {
            source: asset.matched?.source ?? "unknown",
            license: asset.matched?.license ?? "unknown"
          }
        })),
        placeholders: resolved.filter((asset) => asset.placeholder).map((asset) => ({
          requirementId: asset.requirement.id,
          semantic: asset.requirement.label,
          placeholderKind: "primitive" as const,
          primitive: asset.placeholder?.primitive ?? "cube"
        })),
        missing: resolved.filter((asset) => !asset.resolved).map((asset) => ({
          requirementId: asset.requirement.id,
          required: asset.requirement.required
        })),
        diagnostics: resolved.flatMap((asset) => asset.resolved ? [
          diagnostic(`assetRequirements[${asset.requirement.id}]`, "AURA_ASSET_RESOLVED", "info", `Resolved ${asset.requirement.id}.`, "Use the resolved local fixture asset.")
        ] : [
          diagnostic(`assetRequirements[${asset.requirement.id}]`, "AURA_ASSET_PLACEHOLDER_USED", "warning", `Used placeholder for ${asset.requirement.id}.`, "Add a matching local GLB asset to remove the placeholder.")
        ])
      };
    },
    resolveOne(requirementInput) {
      const requirement = normalizeRequirement(requirementInput);
      const exact = requirement.preferredUri ? manifest.entries.find((entry) => entry.uri === requirement.preferredUri || entry.uri === withLeadingSlash(requirement.preferredUri ?? "")) : undefined;
      const matched = exact ?? findBestAsset(requirement, manifest.entries);
      if (matched) {
        return {
          requirement,
          matched,
          resolved: true,
          diagnostics: [`Resolved '${requirement.id}' to '${matched.uri}'.`]
        };
      }
      const placeholder = createPrimitivePlaceholder(requirement);
      return {
        requirement,
        placeholder,
        resolved: false,
        diagnostics: [`Generated placeholder '${placeholder.id}' for '${requirement.id}'.`, placeholder.reason]
      };
    },
    resolveAll(requirements) {
      return requirements.map((requirement) => this.resolveOne(requirement));
    }
  };
}

function normalizeManifest(options: AuraAssetResolverOptions | AuraAssetLibraryManifest): AuraAssetLibraryManifest {
  if ("entries" in options) return options;
  const manifest = options.manifest;
  if (!manifest) return AURA_DEFAULT_ASSET_LIBRARY;
  if ("entries" in manifest) return manifest;
  return {
    schema: "aura3d.ai-scene.asset-library",
    generatedAt: new Date().toISOString(),
    entries: manifest.assets.map((asset) => ({
      id: asset.id,
      label: asset.semantic ?? asset.id,
      uri: asset.uri,
      type: "gltf",
      semanticTags: asset.tags,
      styleTags: asset.tags,
      license: asset.license ?? "unknown",
      source: asset.source ?? "user-manifest"
    }))
  };
}

function normalizeRequirement(input: unknown): AuraAssetRequirement {
  if (isRecord(input) && "semantic" in input) {
    return {
      id: String(input.id),
      label: String(input.semantic),
      type: "gltf",
      semanticTags: Array.isArray(input.tags) ? input.tags.map(String) : [],
      styleTags: Array.isArray(input.tags) ? input.tags.map(String) : [],
      required: Boolean(input.required)
    };
  }
  const requirement = input as AuraAssetRequirement;
  return {
    ...requirement,
    label: requirement.label ?? requirement.id,
    semanticTags: requirement.semanticTags ?? [],
    styleTags: requirement.styleTags ?? [],
    type: requirement.type ?? "gltf",
    required: requirement.required ?? false
  };
}

function findBestAsset(requirement: AuraAssetRequirement, entries: readonly AuraAssetManifestEntry[]): AuraAssetManifestEntry | undefined {
  const genericTags = new Set(["asset", "prop", "product", "character", "object", "fixture"]);
  const requiredTags = new Set(requirement.semanticTags.map((tag) => tag.toLowerCase()).filter((tag) => !genericTags.has(tag)));
  const styleTags = new Set(requirement.styleTags.map((tag) => tag.toLowerCase()).filter((tag) => !genericTags.has(tag)));
  return entries
    .map((entry) => ({
      entry,
      score: entry.semanticTags.filter((tag) => requiredTags.has(tag.toLowerCase())).length * 2 + entry.styleTags.filter((tag) => styleTags.has(tag.toLowerCase())).length
    }))
    .filter((candidate) => candidate.entry.type === requirement.type && candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.entry;
}

function withLeadingSlash(uri: string): string {
  return uri.startsWith("/") ? uri : `/${uri}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
