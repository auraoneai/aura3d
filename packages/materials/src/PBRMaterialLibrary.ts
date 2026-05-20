import type { V5MaterialClass, V5MaterialPreset, V5MaterialProofChannel } from "./MaterialPreset";
import { V5_TEXTURE_SETS } from "./TextureSet";

export const V5_REQUIRED_MATERIAL_CLASSES: readonly V5MaterialClass[] = [
  "brushed metal",
  "polished metal",
  "clearcoat automotive paint",
  "glass",
  "tinted glass",
  "plastic",
  "rubber",
  "leather",
  "fabric",
  "ceramic",
  "stone",
  "wood",
  "emissive panel",
  "translucent material",
  "alpha-cutout foliage/card material",
  "anisotropic material",
  "sheen material",
  "transmission material",
  "normal-mapped material",
  "ORM-packed material"
];

const REQUIRED_PROOF_CHANNELS: readonly V5MaterialProofChannel[] = [
  "roughness",
  "metalness",
  "normal",
  "ao",
  "emissive",
  "transmission",
  "clearcoat",
  "alpha",
  "color-space"
];

function createPreset(index: number, materialClass: V5MaterialClass): V5MaterialPreset {
  const textureSet = index < V5_TEXTURE_SETS.length ? V5_TEXTURE_SETS[index] : undefined;
  const hue = (index * 41) % 255;
  const isMetal = /metal|automotive|anisotropic|ORM/i.test(materialClass);
  const isGlass = /glass|transmission|translucent/i.test(materialClass);
  const isEmissive = materialClass === "emissive panel";
  const isAlpha = materialClass === "alpha-cutout foliage/card material";
  return {
    id: `v5-${materialClass.replace(/[^a-z0-9]+/g, "-")}-${String(index + 1).padStart(2, "0")}`,
    label: `V5 ${materialClass} ${index + 1}`,
    class: materialClass,
    textureSetId: textureSet?.id,
    colorSpace: "linear-srgb",
    parameters: {
      baseColor: [((hue + 64) % 255) / 255, ((hue + 138) % 255) / 255, ((hue + 211) % 255) / 255],
      roughness: materialClass === "polished metal" || materialClass === "glass" ? 0.06 : Math.min(0.92, 0.18 + (index % 8) * 0.1),
      metalness: isMetal ? 1 : 0,
      normalScale: /normal|stone|wood|leather|fabric|rubber|ORM/i.test(materialClass) ? 0.8 : 0.25,
      aoStrength: textureSet ? 0.75 : 0.35,
      emissiveColor: isEmissive ? [1, 0.66, 0.24] : undefined,
      emissiveIntensity: isEmissive ? 3.2 : undefined,
      transmission: isGlass ? 0.72 : undefined,
      thickness: isGlass ? 0.16 : undefined,
      ior: isGlass ? 1.45 : undefined,
      clearcoat: /clearcoat|automotive/i.test(materialClass) ? 1 : undefined,
      clearcoatRoughness: /clearcoat|automotive/i.test(materialClass) ? 0.18 : undefined,
      alphaMode: isAlpha ? "mask" : isGlass ? "blend" : "opaque",
      alphaCutoff: isAlpha ? 0.48 : undefined,
      anisotropy: materialClass === "anisotropic material" || materialClass === "brushed metal" ? 0.85 : undefined,
      sheen: materialClass === "sheen material" || materialClass === "fabric" ? 0.7 : undefined
    },
    proofChannels: REQUIRED_PROOF_CHANNELS.filter((channel) => {
      if (channel === "emissive") return isEmissive || Boolean(textureSet);
      if (channel === "transmission") return isGlass;
      if (channel === "clearcoat") return /clearcoat|automotive/i.test(materialClass);
      if (channel === "alpha") return isAlpha || isGlass;
      return true;
    })
  };
}

export const V5_PBR_MATERIAL_LIBRARY: readonly V5MaterialPreset[] = Array.from({ length: 50 }, (_, index) =>
  createPreset(index, V5_REQUIRED_MATERIAL_CLASSES[index % V5_REQUIRED_MATERIAL_CLASSES.length])
);

export function listV5PbrMaterials(): readonly V5MaterialPreset[] {
  return V5_PBR_MATERIAL_LIBRARY;
}

export function findV5PbrMaterial(id: string): V5MaterialPreset | undefined {
  return V5_PBR_MATERIAL_LIBRARY.find((material) => material.id === id);
}

export function listV5MaterialProofChannels(): readonly V5MaterialProofChannel[] {
  return REQUIRED_PROOF_CHANNELS;
}
