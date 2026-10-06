// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraMaterialSpec, AuraSceneNode, AuraCameraSpec, AuraSolarSystemPrefabOptions, AuraSolarPlanetMaterialPreset } from "./types.js";
import { AuraSceneBuilder, scene } from "./scene.js";
import { camera } from "./camera.js";
import { groups } from "./groups.js";
import { interactions } from "./interactions.js";
import { labels } from "./labels.js";
import { material } from "./material.js";
import { prefabs } from "./prefabs/index.js";
import { timeline } from "./timeline.js";
import { validateSolarVisualQA } from "../looks/structuralQA.js";
import { cameraPreset } from "../CameraPresetLibrary.js";
import { distance } from "../SpatialAnchoring.js";

export function solarPlanetMaterial(preset: AuraSolarPlanetMaterialPreset): AuraMaterialSpec {
  if (preset === "gas-giant") return material.clearcoat({ color: "#f5d0a9", roughness: 0.2, clearcoat: 0.8, envMapIntensity: 0.88 });
  if (preset === "ice") return material.clearcoat({ color: "#93c5fd", roughness: 0.24, clearcoat: 1, envMapIntensity: 1.05 });
  if (preset === "moon") return material.pbr({ color: "#cbd5e1", roughness: 0.84, metallic: 0.01 });
  if (preset === "ringed") return material.emissive({ color: "#fde68a", emissive: "#fde68a", opacity: 0.82 });
  if (preset === "lava-venus") return material.emissive({ color: "#f59e0b", emissive: "#f97316", emissiveIntensity: 1.35 });
  return material.pbr({ color: "#a8a29e", roughness: 0.76, metallic: 0.04 });
}

function solarCameraPreset(): AuraCameraSpec {
  return camera.orbit({ target: [0, 0.18, 0], distance: 7.4, fov: 45 });
}

function solarScene(options: AuraSolarSystemPrefabOptions = {}): AuraSceneBuilder {
  return scene()
    .background("#020617")
    .addMany(prefabs.solarSystem({ labels: "attached", orbitSegments: 24, starCount: 42, dustCount: 18, ...options }))
    .add(interactions.orbit())
    .camera(solarCameraPreset())
    .timeline(timeline.loop({ seconds: 18 }));
}

export function solarMaterialPresetsInNodes(nodes: readonly AuraSceneNode[]): readonly AuraSolarPlanetMaterialPreset[] {
  const names = groups.flatten(nodes).map((node) => "name" in node ? node.name ?? "" : "");
  const found = new Set<AuraSolarPlanetMaterialPreset>();
  if (names.some((name) => name.includes("rocky material"))) found.add("rocky");
  if (names.some((name) => name.includes("gas-giant material"))) found.add("gas-giant");
  if (names.some((name) => name.includes("ice material"))) found.add("ice");
  if (names.some((name) => name.includes("moon material"))) found.add("moon");
  if (names.some((name) => name.includes("ringed material") || name.includes("ringed planet"))) found.add("ringed");
  if (names.some((name) => name.includes("lava-venus material"))) found.add("lava-venus");
  const presets: readonly AuraSolarPlanetMaterialPreset[] = ["rocky", "gas-giant", "ice", "moon", "ringed", "lava-venus"];
  return presets.filter((preset) => found.has(preset));
}

export const solar = {
  system: (options: AuraSolarSystemPrefabOptions = {}): readonly AuraSceneNode[] => prefabs.solarSystem(options),
  scene: solarScene,
  cameraPreset: solarCameraPreset,
  materialPresets: (): readonly AuraSolarPlanetMaterialPreset[] => ["rocky", "gas-giant", "ice", "moon", "ringed", "lava-venus"],
  planetMaterial: solarPlanetMaterial,
  visualQA: validateSolarVisualQA
} as const;
