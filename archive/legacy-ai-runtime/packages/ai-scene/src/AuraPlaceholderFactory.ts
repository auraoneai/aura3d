import type { AuraAssetRequirement } from "./AuraSceneIR.js";

export interface AuraPlaceholderAsset {
  readonly id: string;
  readonly label: string;
  readonly type: "placeholder";
  readonly primitive: "cube" | "sphere" | "plane" | "points";
  readonly reason: string;
  readonly semanticTags: readonly string[];
  readonly provenance: {
    readonly source: "aura3d-placeholder";
    readonly requirementId: string;
  };
}

export function createPrimitivePlaceholder(requirement: AuraAssetRequirement): AuraPlaceholderAsset {
  return {
    id: `placeholder-${requirement.id}`,
    label: `${requirement.label} placeholder`,
    type: "placeholder",
    primitive: placeholderPrimitiveFor(requirement.semanticTags),
    reason: `No local asset matched required tags: ${requirement.semanticTags.join(", ") || "none"}.`,
    semanticTags: requirement.semanticTags,
    provenance: {
      source: "aura3d-placeholder",
      requirementId: requirement.id
    }
  };
}

function placeholderPrimitiveFor(tags: readonly string[]): AuraPlaceholderAsset["primitive"] {
  if (tags.includes("light") || tags.includes("particles")) return "points";
  if (tags.includes("environment") || tags.includes("architecture")) return "plane";
  if (tags.includes("product") || tags.includes("prop") || tags.includes("character")) return "sphere";
  return "cube";
}
