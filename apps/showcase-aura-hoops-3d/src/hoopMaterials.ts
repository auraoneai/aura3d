import type { AuraModelMaterialOverride } from "@aura3d/engine";
import { HOOPS_PALETTE } from "./courtRigs";

/**
 * Multi-lobe physical hoop hardware & composite leather basketball overrides:
 *   - `rig`: brushed galvanized steel stanchion in `HOOPS_PALETTE.chainLink` (`metallic >= 0.85`).
 *   - `backboard`: tempered polycarbonate studio glass (`ior: 1.54`, `transmission: 0.92`, `clearcoat: 1`).
 *   - `rim`: high-gloss orange breakaway lacquer over satin steel (`clearcoat: 0.88`).
 *   - `ball`: pebbled composite leather sheen + subtle clearcoat over the ball's channel seams.
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
  // Brushed galvanized steel stanchion: bright metallic spangle, zero camo texture noise
  rig: [{ color: HOOPS_PALETTE.chainLink, colorMode: "replace", replaceTextures: true, roughness: 0.34, metallic: 0.92, clearcoat: 0.22, clearcoatRoughness: 0.28, envMapIntensity: 1.15 }],
  // Tempered polycarbonate backboard: high transmission, crisp clearcoat specular
  backboard: [{ color: "#e6f1f6", colorMode: "replace", replaceTextures: true, roughness: 0.03, metallic: 0, opacity: 0.34, transmission: 0.92, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.38 }],
  // Breakaway orange lacquer over powder-coat dielectric base
  rim: [{ color: "#e04f16", colorMode: "replace", replaceTextures: true, roughness: 0.44, metallic: 0.14, clearcoat: 0.88, clearcoatRoughness: 0.14, envMapIntensity: 1.05 }],
  // Pebbled composite leather basketball: preserves seam map, adds leather micro-sheen
  ball: [{ roughness: 0.64, metallic: 0, clearcoat: 0.18, clearcoatRoughness: 0.52, sheen: 0.16, envMapIntensity: 0.88 }]
};

export const hoopMaterials = (original: boolean): HoopMaterialSet => (original ? ORIGINAL_HOOP_MATERIALS : HOOP_MATERIALS);
