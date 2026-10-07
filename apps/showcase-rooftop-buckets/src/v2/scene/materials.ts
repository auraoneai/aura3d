// apps/showcase-rooftop-buckets/src/v2/scene/materials.ts — shared v2 materials.
// §6.9.6 palette: warm court against a cool open skyline. Skyline silhouettes
// and ledge dressing are PBR (no unlit cards); glass + rim glow are the
// light-adjacent elements — non-light emissive stays ≤ 0.1.
import { material, type AuraMaterialSpec } from "@aura3d/engine";

export const TOWER_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#232a36", roughness: 0.8, metallic: 0.15 });
export const LEDGE_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#2e333d", roughness: 0.85, metallic: 0.05 });
export const GLASS_BOARD: AuraMaterialSpec = material.glass({ color: "#cfe4f5", opacity: 0.32, roughness: 0.08, metallic: 0 });
export const BOARD_FRAME: AuraMaterialSpec = material.pbr({ color: "#e8eef4", roughness: 0.35, metallic: 0.6 });
export const NET_MATERIAL: AuraMaterialSpec = material.emissive({ name: "rim net strands", color: "#dbeafe", emissive: "#93c5fd", emissiveIntensity: 0.56, opacity: 0.84 });
export const RIM_GLOW: AuraMaterialSpec = material.emissive({ name: "rim target halo", color: "#fb923c", emissive: "#f97316", emissiveIntensity: 1.15, opacity: 0.9 });
export const CONTACT_MAKE: AuraMaterialSpec = material.emissive({ name: "swish contact burst", color: "#fef08a", emissive: "#f97316", emissiveIntensity: 2.2, opacity: 0.82 });
export const CONTACT_MISS: AuraMaterialSpec = material.emissive({ name: "miss contact burst", color: "#fda4af", emissive: "#e11d48", emissiveIntensity: 1.8, opacity: 0.76 });
export const CONTACT_BLOCK: AuraMaterialSpec = material.emissive({ name: "defender block burst", color: "#f0abfc", emissive: "#c026d3", emissiveIntensity: 2.35, opacity: 0.88 });
export const AIM_MATERIAL: AuraMaterialSpec = material.emissive({ name: "predicted-first-flight", color: "#38bdf8", emissive: "#0284c7" });
export const SUN_DISC: AuraMaterialSpec = material.emissive({ name: "golden sun disc", color: "#ffd166", emissive: "#ffb35c", emissiveIntensity: 2.4, roughness: 0.8 });
export const HORIZON_GLOW: AuraMaterialSpec = material.emissive({ name: "horizon amber glow", color: "#7c3f16", emissive: "#f59e0b", emissiveIntensity: 0.85, opacity: 0.9 });
