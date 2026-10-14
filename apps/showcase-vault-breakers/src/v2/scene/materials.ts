// apps/showcase-vault-breakers/src/v2/scene/materials.ts — shared v2 materials.
// §6.9.5 palette: near-black arcade, cabinet amber, vault-dial accent. All
// dressing surfaces are PBR (no unlit cards); insert lamps/beacons carry
// emissive because they ARE the light-adjacent elements — non-light emissive
// stays ≤ 0.1 per the audit rules.
import { material, type AuraMaterialSpec } from "@aura3d/engine";

export const FLOOR_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#0b0a0e", roughness: 0.55, metallic: 0.1 });
export const WALL_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#100d16", roughness: 0.85, metallic: 0 });
export const CEILING_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#070609", roughness: 0.95, metallic: 0 });
export const TRIM_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#1c1622", roughness: 0.6, metallic: 0.2 });
// Neighbouring machine shells: dark lacquer + a small marquee face.
export const MACHINE_SHELL_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#171120", roughness: 0.5, metallic: 0.25 });
export const MARQUEE_MATERIAL: AuraMaterialSpec = material.pbr({ color: "#241a30", roughness: 0.7, metallic: 0.05 });

// Insert / lamp / beacon materials (lit elements — emissive is the point).
export const BANK_LAMP_OFF: AuraMaterialSpec = material.emissive({ name: "bank lamp off", color: "#1e1824", emissive: "#805030", emissiveIntensity: 0.22 });
export const BANK_LAMP_ON: AuraMaterialSpec = material.emissive({ name: "bank lamp on", color: "#087d77", emissive: "#28f5cc", emissiveIntensity: 2.2, roughness: 0.18 });
export const INSERT_BEZEL: AuraMaterialSpec = material.pbr({ color: "#2a2030", roughness: 0.35, metallic: 0.5 });
export const NEON_SIGN: AuraMaterialSpec = material.emissive({ name: "vault marquee glow", color: "#3d1030", emissive: "#ff4bd8", emissiveIntensity: 1.6, roughness: 0.4 });

export const IMPACT_AMBER: AuraMaterialSpec = material.neon({ name: "impact amber ring", color: "#653415", emissive: "#ff9f43", emissiveIntensity: 3.4, roughness: 0.13 });
export const IMPACT_CYAN: AuraMaterialSpec = material.neon({ name: "impact cyan ring", color: "#0e5661", emissive: "#55f4ff", emissiveIntensity: 3.4, roughness: 0.13 });
export const IMPACT_VAULT: AuraMaterialSpec = material.neon({ name: "impact vault ring", color: "#5a1647", emissive: "#ff4bd8", emissiveIntensity: 3.6, roughness: 0.12 });

// Mechanism state beacon strip (non-color-redundant: scoreboard repeats state).
export const MECHANISM_STATE_MATERIALS = {
  guarded: material.emissive({ name: "state guarded", color: "#d4a017", emissive: "#8b6914" }),
  progress: material.emissive({ name: "state progress", color: "#00ff88", emissive: "#00cc66" }),
  vault: material.emissive({ name: "state vault open", color: "#ff6a00", emissive: "#ff4500" }),
  multiball: material.emissive({ name: "state multiball", color: "#00e5ff", emissive: "#00b8d4" }),
  tilt: material.emissive({ name: "state tilt", color: "#ff0044", emissive: "#cc0033" }),
  gameOver: material.emissive({ name: "state game over", color: "#333333", emissive: "#1a1a1a" })
} as const;
export type MechanismState = keyof typeof MECHANISM_STATE_MATERIALS;
