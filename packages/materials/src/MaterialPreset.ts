export type V5MaterialClass =
  | "brushed metal"
  | "polished metal"
  | "clearcoat automotive paint"
  | "glass"
  | "tinted glass"
  | "plastic"
  | "rubber"
  | "leather"
  | "fabric"
  | "ceramic"
  | "stone"
  | "wood"
  | "emissive panel"
  | "translucent material"
  | "alpha-cutout foliage/card material"
  | "anisotropic material"
  | "sheen material"
  | "transmission material"
  | "normal-mapped material"
  | "ORM-packed material";

export type V5MaterialProofChannel =
  | "roughness"
  | "metalness"
  | "normal"
  | "ao"
  | "emissive"
  | "transmission"
  | "clearcoat"
  | "alpha"
  | "color-space";

export interface V5MaterialParameters {
  readonly baseColor: readonly [number, number, number];
  readonly roughness: number;
  readonly metalness: number;
  readonly normalScale?: number;
  readonly aoStrength?: number;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveIntensity?: number;
  readonly transmission?: number;
  readonly thickness?: number;
  readonly ior?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly alphaMode?: "opaque" | "mask" | "blend";
  readonly alphaCutoff?: number;
  readonly anisotropy?: number;
  readonly sheen?: number;
}

export interface V5MaterialPreset {
  readonly id: string;
  readonly label: string;
  readonly class: V5MaterialClass;
  readonly textureSetId?: string;
  readonly colorSpace: "linear-srgb";
  readonly parameters: V5MaterialParameters;
  readonly proofChannels: readonly V5MaterialProofChannel[];
}
