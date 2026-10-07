// apps/showcase-courier-rush/src/v2/scene/materials.ts — shared v2 materials.
// §6.9.7 palette: cool wet-dawn city, amber interior/service accents. Impact
// and marker feedback are emissive runtime nodes; non-light emissive stays ≤ 0.1.
import { material, type AuraMaterialSpec } from "@aura3d/engine";

export const IMPACT_RING: AuraMaterialSpec = material.emissive({ name: "strike impact ring", color: "#fecdd3", emissive: "#fb7185", emissiveIntensity: 1.9, opacity: 0.8 });
export const IMPACT_SLASH: AuraMaterialSpec = material.emissive({ name: "strike impact slash", color: "#ffe4e6", emissive: "#e11d48", emissiveIntensity: 2.1, opacity: 0.85 });
export const PICKUP_BURST: AuraMaterialSpec = material.emissive({ name: "pickup confirm burst", color: "#bae6fd", emissive: "#38bdf8", emissiveIntensity: 1.9, opacity: 0.78 });
export const DROP_BURST: AuraMaterialSpec = material.emissive({ name: "drop confirm burst", color: "#fde68a", emissive: "#f59e0b", emissiveIntensity: 2.0, opacity: 0.8 });
export const VAN_TRIM: AuraMaterialSpec = material.emissive({ name: "van service trim", color: "#ffb84d", emissive: "#d97706", emissiveIntensity: 0.62 });
export const VAN_BUMPER: AuraMaterialSpec = material.pbr({ name: "van rear bumper", color: "#2b3440", roughness: 0.5, metallic: 0.55 });
export const PARCEL_BEACON: AuraMaterialSpec = material.emissive({ name: "parcel bed beacon", color: "#49e6c8", emissive: "#14b8a6", emissiveIntensity: 1.4, opacity: 0.85 });
