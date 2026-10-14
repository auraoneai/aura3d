// apps/showcase-mech-hangar/src/v2/scene/materials.ts — shared materials keyed to
// the direction palette: graphite hangar (#0b1016–#3a4c60), amber #ffb454
// practical accents, reserved #62f8e7 objective markers.
import { material } from "@aura3d/engine";

export const HANGAR_BG = "#0b1016";

export const hangarFloorMat = material.pbr({ name: "hangar deck", color: "#1c2836", roughness: 0.86, metallic: 0.24 });
export const hangarBackdropMat = material.pbr({ name: "hangar far wall", color: "#141f2b", roughness: 0.95, metallic: 0.1 });
export const hangarFrameMat = material.pbr({ name: "hangar frame steel", color: "#263e55", roughness: 0.52, metallic: 0.62 });
export const hangarBayStripMat = material.emissive({ name: "hangar bay strip", color: "#215f7a", emissive: "#61dfff", emissiveIntensity: 0.7 });
export const hangarBeamLightMat = material.emissive({ name: "hangar beam lamp", color: "#2f4b5f", emissive: "#9fdcff", emissiveIntensity: 1.0 });
export const hangarCrateMat = material.pbr({ name: "workshop crate", color: "#3a4c60", roughness: 0.8, metallic: 0.18 });
export const hangarSignMat = material.emissive({ name: "hangar bay sign", color: "#123240", emissive: "#62f8e7", emissiveIntensity: 0.85 });

export const pitFloorMat = material.pbr({ name: "pit dust deck", color: "#8b93a1", roughness: 1, metallic: 0 });
export const pitBackdropMat = material.pbr({ name: "pit far wall", color: "#101a24", roughness: 0.96, metallic: 0.08 });
export const pitPillarMat = material.pbr({ name: "pit structural steel", color: "#172d42", roughness: 0.42, metallic: 0.66 });
export const pitPillarLightMat = material.emissive({ name: "pit structural lamp", color: "#1c5369", emissive: "#47cfff", emissiveIntensity: 0.8 });
export const pitRailMat = material.pbr({ name: "pit guard rail", color: "#2c4054", roughness: 0.5, metallic: 0.55 });

export const identityRingMat = material.emissive({ name: "identity ring", color: "#0f2c33", emissive: "#62f8e7", emissiveIntensity: 1.0, opacity: 0.9 });
export const identityChevronMat = material.emissive({ name: "identity chevron", color: "#3a2410", emissive: "#ffb454", emissiveIntensity: 0.9 });
export const collarMat = material.pbr({ name: "hardpoint collar", color: "#3a4c60", roughness: 0.4, metallic: 0.75 });
export const collarLockMat = material.emissive({ name: "hardpoint lock", color: "#2c2010", emissive: "#ffb454", emissiveIntensity: 0.8 });
