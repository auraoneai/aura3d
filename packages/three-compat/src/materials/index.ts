import { ColorCompat } from "../math";
import type { TextureCompat } from "../textures";

export interface MaterialCompatParameters {
  readonly color?: ColorCompat;
  readonly map?: TextureCompat;
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly side?: "FrontSide" | "BackSide" | "DoubleSide";
}

export class MaterialCompat {
  readonly type: string = "Material";
  transparent = false;
  opacity = 1;
  side: "FrontSide" | "BackSide" | "DoubleSide" = "FrontSide";

  constructor(parameters: MaterialCompatParameters = {}) {
    this.transparent = parameters.transparent ?? false;
    this.opacity = parameters.opacity ?? 1;
    this.side = parameters.side ?? "FrontSide";
  }
}

export class MeshBasicMaterialCompat extends MaterialCompat { override readonly type = "MeshBasicMaterial"; color = new ColorCompat(); }
export class MeshLambertMaterialCompat extends MaterialCompat { override readonly type = "MeshLambertMaterial"; approximation = "ThreeCompat diffuse lighting approximation"; }
export class MeshPhongMaterialCompat extends MaterialCompat { override readonly type = "MeshPhongMaterial"; shininess = 30; approximation = "ThreeCompat specular lighting approximation"; }
export class MeshStandardMaterialCompat extends MaterialCompat { override readonly type: string = "MeshStandardMaterial"; roughness = 0.5; metalness = 0; }
export class MeshPhysicalMaterialCompat extends MeshStandardMaterialCompat { override readonly type = "MeshPhysicalMaterial"; clearcoat = 0; transmission = 0; ior = 1.5; }
export class ShaderMaterialCompat extends MaterialCompat { override readonly type = "ShaderMaterial"; uniforms: Record<string, unknown> = {}; vertexShader = ""; fragmentShader = ""; }
export class PointsMaterialCompat extends MaterialCompat {
  override readonly type = "PointsMaterial";
  size = 1;
  sizeAttenuation = true;

  constructor(parameters: MaterialCompatParameters & { readonly size?: number; readonly sizeAttenuation?: boolean } = {}) {
    super(parameters);
    this.size = validateNonNegative(parameters.size ?? 1, "PointsMaterial size");
    this.sizeAttenuation = parameters.sizeAttenuation ?? true;
  }
}
export class LineBasicMaterialCompat extends MaterialCompat { override readonly type = "LineBasicMaterial"; linewidth = 1; }
export class SpriteMaterialCompat extends MaterialCompat {
  override readonly type = "SpriteMaterial";
  rotation = 0;
  sizeAttenuation = true;

  constructor(parameters: MaterialCompatParameters & { readonly rotation?: number; readonly sizeAttenuation?: boolean } = {}) {
    super(parameters);
    if (!Number.isFinite(parameters.rotation ?? 0)) throw new RangeError("SpriteMaterial rotation must be finite.");
    this.rotation = parameters.rotation ?? 0;
    this.sizeAttenuation = parameters.sizeAttenuation ?? true;
  }
}

export const THREE_COMPAT_COMPAT_MATERIAL_TYPES = [
  "MeshBasicMaterial",
  "MeshLambertMaterial",
  "MeshPhongMaterial",
  "MeshStandardMaterial",
  "MeshPhysicalMaterial",
  "ShaderMaterial",
  "PointsMaterial",
  "LineBasicMaterial",
  "SpriteMaterial"
] as const;

function validateNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative.`);
  return value;
}
