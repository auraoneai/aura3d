import type { AuraMaterialIntent } from "./AuraMaterialIntent.js";
import type { AuraVec3 } from "./AuraSceneIR.js";

export type AuraProceduralGeometryKind = "box" | "plane" | "cylinder" | "curve" | "particles" | "volume";

export interface AuraProceduralTransform {
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly scale: AuraVec3;
}

export interface AuraProceduralRenderable {
  readonly id: string;
  readonly label: string;
  readonly role: "set" | "ground" | "prop" | "practical-light" | "vfx";
  readonly geometry: AuraProceduralGeometryKind;
  readonly transform: AuraProceduralTransform;
  readonly materialId?: string;
  readonly semanticTags: readonly string[];
  readonly rendererOwned: true;
  readonly light?: {
    readonly color: readonly [number, number, number];
    readonly intensity: number;
    readonly castsLight: boolean;
  };
}

export interface AuraProceduralSetBuild {
  readonly id: string;
  readonly label: string;
  readonly category: "urban-environment" | "studio-environment" | "nature-environment" | "architectural-interior";
  readonly renderables: readonly AuraProceduralRenderable[];
  readonly materials: readonly AuraMaterialIntent[];
  readonly storyBlocking: {
    readonly robotPosition?: AuraVec3;
    readonly flowerPosition?: AuraVec3;
    readonly cameraPosition: AuraVec3;
    readonly cameraTarget: AuraVec3;
    readonly practicalLightIds: readonly string[];
  };
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: "info" | "warning" | "error";
    readonly path: string;
    readonly message: string;
    readonly fixSuggestion: string;
  }[];
}

export interface AuraProceduralSetBuilder {
  build(id: string): AuraProceduralSetBuild;
}

export function createProceduralTransform(overrides: Partial<AuraProceduralTransform> = {}): AuraProceduralTransform {
  return {
    position: overrides.position ?? [0, 0, 0],
    rotation: overrides.rotation ?? [0, 0, 0],
    scale: overrides.scale ?? [1, 1, 1]
  };
}
