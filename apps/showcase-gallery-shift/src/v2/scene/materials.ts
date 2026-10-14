// apps/showcase-gallery-shift/src/v2/scene/materials.ts — palette-matched
// materials for the gallery's authored floor-2 shell, light pools, laser bars,
// exit/alarm markers, thief/guard identity accents and threat cones.
import { material } from "@aura3d/engine";

export const GALLERY_BG = "#07090d";

// Floor-2 shell (floor 1's architecture is the typed museum cutaway GLB).
export const floorSlabMat = material.pbr({ name: "v2 floor slab stone", color: "#1b2130", roughness: 0.4, metallic: 0.05 });
export const marbleWallMat = material.pbr({ name: "v2 gallery marble", color: "#232a38", roughness: 0.55, metallic: 0.08 });

// Light-pool discs (authored gameplay-zone markers; detection fill uses the
// same FloorLayout lightPools table these visuals mark).
export const poolDiscMat = (index: number, bright: boolean) =>
  material.emissive({
    name: `v2 pool disc ${index}`,
    color: bright ? "#163f48" : "#102733",
    emissive: bright ? "#72e8ef" : "#3c91a5",
    emissiveIntensity: bright ? 0.42 : 0.24,
    opacity: bright ? 0.2 : 0.16
  });

// Lasers + alarm beacon.
export const laserMat = material.emissive({ name: "v2 laser beam", color: "#3d0f14", emissive: "#ff3b4e", opacity: 0.85 });
export const alarmBeaconMat = material.emissive({ name: "v2 alarm beacon", color: "#3b070c", emissive: "#ff334d", opacity: 0.95 });

// Exit marker + sign.
export const exitPadMat = material.emissive({ name: "v2 exit pad", color: "#0d2417", emissive: "#3dfc9a", opacity: 0.85 });
export const exitSignMat = material.emissive({ name: "v2 exit sign", color: "#0d2417", emissive: "#7ef8ff", opacity: 0.95 });

// Thief accents: cyan focus ring + identity harness + visor.
export const thiefFocusMat = material.emissive({ name: "v2 thief focus ring", color: "#123b3a", emissive: "#55f3d1", emissiveIntensity: 1.18, opacity: 0.9 });
export const thiefHarnessMat = material.metal({ name: "v2 infiltrator harness", color: "#146f6e", emissive: "#52f6dc", emissiveIntensity: 0.62, roughness: 0.28, metallic: 0.62 });
export const thiefVisorMat = material.emissive({ name: "v2 infiltrator visor", color: "#0b4b4d", emissive: "#73fff0", emissiveIntensity: 1.65, opacity: 0.95 });

// Guard accents: warm flashlight wash + sentry harness + state ring.
export const guardHarnessMat = material.metal({ name: "v2 sentry harness", color: "#852346", emissive: "#ff5b87", emissiveIntensity: 0.58, roughness: 0.3, metallic: 0.62 });
export const guardRingMat = material.emissive({ name: "v2 guard ring", color: "#4d081d", emissive: "#ff3e72", emissiveIntensity: 1.2, opacity: 1 });

// Objective ring marker.
export const objectiveRingMat = material.emissive({ name: "v2 objective ring", color: "#5a2d05", emissive: "#ffd05a", emissiveIntensity: 1.48, opacity: 1 });

// Threat feedback: alert wedge / beam / rail / reticle / source halo —
// renderer-owned, driven by the same real LOS sample that feeds detection.
export const threatWedgeMat = material.emissive({ name: "v2 LOS alert wedge", color: "#7d173c", emissive: "#ff477b", emissiveIntensity: 1.9, opacity: 0.8 });
export const threatBeamMat = material.emissive({ name: "v2 LOS center beam", color: "#c43765", emissive: "#ffd0dc", emissiveIntensity: 2.35, opacity: 0.99 });
export const threatLineMat = material.emissive({ name: "v2 LOS floor rail", color: "#8d234a", emissive: "#ff5e8e", emissiveIntensity: 2.1, opacity: 0.94 });
export const threatTargetMat = material.emissive({ name: "v2 LOS reticle", color: "#54132f", emissive: "#ff78a4", emissiveIntensity: 2.05, opacity: 0.94 });

// Sweeping camera-cone previews (floor 2).
export const cameraConeMat = material.emissive({ name: "v2 camera cone wash", color: "#12333f", emissive: "#4fd0e8", emissiveIntensity: 0.8, opacity: 0.4 });
export const cameraMountMat = material.metal({ name: "v2 camera mount", color: "#2c3542", roughness: 0.4, metallic: 0.7 });
