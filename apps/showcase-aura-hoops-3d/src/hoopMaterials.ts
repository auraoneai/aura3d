import type { AuraModelMaterialOverride } from "@aura3d/engine";
import { HOOPS_PALETTE } from "./courtRigs";

/**
 * H47-M2 (code part): the hoop hardware and ball as real materials on the new look. Galvanised steel poles in the
 * chain-link tone (the GLB's camo maps are replaced, so no pole noise), a clear tempered-glass backboard, a powder-coated
 * rim and a rubber ball. Transmission applies where the GLB material carries the KHR parameter; elsewhere the glass reads
 * from opacity, clearcoat and the environment. The pebble-grain normal and the chain-link alpha are WP-36 assets
 * (`hoopsBallPebbleNormal`, `hoopsChainLinkAlpha`). `?look=original` keeps the 4.6 overrides (`ORIGINAL_HOOP_MATERIALS`).
 * Draw delta: 0 (same nodes, new parameters).
 */
export interface HoopMaterialSet {
  readonly rig: readonly AuraModelMaterialOverride[];
  readonly backboard: readonly AuraModelMaterialOverride[];
  readonly rim: readonly AuraModelMaterialOverride[];
  readonly ball: readonly AuraModelMaterialOverride[];
}

export const ORIGINAL_HOOP_MATERIALS: HoopMaterialSet = {
  rig: [{ color: "#2f3439", colorMode: "replace", replaceTextures: true, roughness: 0.52, metallic: 0.58, envMapIntensity: 0.8 }],
  backboard: [{ color: "#eef3f7", colorMode: "replace", replaceTextures: true, roughness: 0.34, metallic: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 0.7 }],
  rim: [{ color: "#c65a1e", colorMode: "replace", replaceTextures: true, roughness: 0.38, metallic: 0.42, envMapIntensity: 0.85 }],
  ball: []
};

export const HOOP_MATERIALS: HoopMaterialSet = {
  // galvanised steel: bright, metallic, a little rough (spangle), no texture noise
  rig: [{ color: HOOPS_PALETTE.chainLink, colorMode: "replace", replaceTextures: true, roughness: 0.42, metallic: 0.9, envMapIntensity: 1.0 }],
  // tempered glass: thin, near-clear, glossy coat
  backboard: [{ color: "#dfe9ee", colorMode: "replace", replaceTextures: true, roughness: 0.04, metallic: 0, opacity: 0.38, transmission: 0.9, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2 }],
  // powder coat: saturated orange, satin, not metallic
  rim: [{ color: "#d4561a", colorMode: "replace", replaceTextures: true, roughness: 0.55, metallic: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.6 }],
  // rubber: keep the ball's own maps, matte it, no metal
  ball: [{ roughness: 0.78, metallic: 0, envMapIntensity: 0.7 }]
};

export const hoopMaterials = (original: boolean): HoopMaterialSet => (original ? ORIGINAL_HOOP_MATERIALS : HOOP_MATERIALS);
