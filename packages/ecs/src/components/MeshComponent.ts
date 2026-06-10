import type { SkinningPaletteBinding } from "@aura3d/rendering";

/**
 * Renderable geometry + material binding for an ECS entity.
 *
 * References resources by name/handle; the ECS render bridge resolves them
 * through the {@link ECSRenderLibraries} map at collection time.
 */
export class MeshComponent {
  geometry: string;
  material: string;
  castShadow = true;
  receiveShadow = true;
  skinning?: SkinningPaletteBinding;
  morphWeights?: readonly number[];
  instanceTransforms?: Float32Array;
  instanceColors?: Float32Array;

  constructor(geometry: string, material: string) {
    this.geometry = geometry;
    this.material = material;
  }
}
