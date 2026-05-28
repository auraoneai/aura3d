import { createProceduralTransform, type AuraProceduralSetBuild } from "./AuraProceduralSetBuilder.js";

export function buildProceduralNatureSet(id = "procedural-nature-clearing"): AuraProceduralSetBuild {
  return {
    id,
    label: "Procedural Nature Clearing",
    category: "nature-environment",
    materials: [
      { id: "mat-forest-ground", label: "Moss and soil ground", target: "ground", descriptors: ["soil", "moss", "organic"], baseColor: [0.16, 0.21, 0.11, 1], metallic: 0, roughness: 0.78, requiresRendererMaterial: true },
      { id: "mat-tree-bark", label: "Procedural bark", target: "set", descriptors: ["bark", "rough", "trunk"], baseColor: [0.22, 0.14, 0.09, 1], metallic: 0, roughness: 0.82, requiresRendererMaterial: true }
    ],
    renderables: [
      { id: "nature-ground", label: "Nature ground", role: "ground", geometry: "plane", transform: createProceduralTransform({ rotation: [-Math.PI / 2, 0, 0], scale: [10, 10, 1] }), materialId: "mat-forest-ground", semanticTags: ["nature", "ground", "soil"], rendererOwned: true },
      { id: "tree-cluster-left", label: "Left tree cluster", role: "set", geometry: "cylinder", transform: createProceduralTransform({ position: [-2.8, 1, -1.5], scale: [0.35, 2, 0.35] }), materialId: "mat-tree-bark", semanticTags: ["tree", "forest", "depth"], rendererOwned: true }
    ],
    storyBlocking: { cameraPosition: [0, 1.2, 4], cameraTarget: [0, 0.7, 0], practicalLightIds: [] },
    diagnostics: [{ code: "AURA_PROCEDURAL_NATURE_SET_BUILT", severity: "info", path: "proceduralSets.nature", message: "Built nature set from renderer-owned procedural geometry.", fixSuggestion: "Add botanical GLBs for higher fidelity." }]
  };
}
