export type FoundationComparisonSceneId = "product" | "material" | "asset" | "interactive";

export interface FoundationComparisonObject {
  readonly label: string;
  readonly geometry: "sphere" | "cube" | "cylinder";
  readonly color: readonly [number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface FoundationComparisonScene {
  readonly id: FoundationComparisonSceneId;
  readonly title: string;
  readonly intent: string;
  readonly assetUrl?: string;
  readonly animated?: boolean;
  readonly objects: readonly FoundationComparisonObject[];
}
