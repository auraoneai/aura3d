export type V3ComparisonSceneId = "product" | "material" | "asset" | "interactive";

export interface V3ComparisonObject {
  readonly label: string;
  readonly geometry: "sphere" | "cube" | "cylinder";
  readonly color: readonly [number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface V3ComparisonScene {
  readonly id: V3ComparisonSceneId;
  readonly title: string;
  readonly intent: string;
  readonly assetUrl?: string;
  readonly animated?: boolean;
  readonly objects: readonly V3ComparisonObject[];
}
