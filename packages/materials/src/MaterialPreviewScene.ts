import type { V5MaterialPreset } from "./MaterialPreset";
import { listV5PbrMaterials } from "./PBRMaterialLibrary";

export interface V5MaterialPreviewTile {
  readonly materialId: string;
  readonly label: string;
  readonly class: string;
  readonly previewGeometry: "sphere" | "beveled-cube" | "thin-glass" | "fabric-card" | "foliage-card";
  readonly environmentId: string;
  readonly requiredChannels: readonly string[];
}

export function createV5MaterialPreviewTile(material: V5MaterialPreset): V5MaterialPreviewTile {
  const previewGeometry =
    material.parameters.alphaMode === "mask" ? "foliage-card" :
    material.parameters.transmission ? "thin-glass" :
    material.parameters.sheen ? "fabric-card" :
    material.parameters.clearcoat ? "beveled-cube" :
    "sphere";
  return {
    materialId: material.id,
    label: material.label,
    class: material.class,
    previewGeometry,
    environmentId: material.parameters.transmission ? "studio-small-08" : material.parameters.clearcoat ? "industrial-sunset-puresky" : "showroom-softboxes",
    requiredChannels: material.proofChannels
  };
}

export function createV5MaterialPreviewScene(): readonly V5MaterialPreviewTile[] {
  return listV5PbrMaterials().map(createV5MaterialPreviewTile);
}
