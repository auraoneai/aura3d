import { createProceduralTransform, type AuraProceduralSetBuild } from "./AuraProceduralSetBuilder.js";

export function buildProceduralStudioSet(id = "procedural-product-studio"): AuraProceduralSetBuild {
  return {
    id,
    label: "Procedural Product Studio",
    category: "studio-environment",
    materials: [
      { id: "mat-studio-floor", label: "Matte studio floor", target: "ground", descriptors: ["matte", "neutral", "stage"], baseColor: [0.55, 0.56, 0.58, 1], metallic: 0, roughness: 0.64, requiresRendererMaterial: true }
    ],
    renderables: [
      { id: "studio-floor", label: "Studio floor", role: "ground", geometry: "plane", transform: createProceduralTransform({ rotation: [-Math.PI / 2, 0, 0], scale: [8, 8, 1] }), materialId: "mat-studio-floor", semanticTags: ["studio", "ground", "stage"], rendererOwned: true },
      { id: "studio-backdrop", label: "Studio backdrop", role: "set", geometry: "box", transform: createProceduralTransform({ position: [0, 1.8, -3], scale: [8, 3.6, 0.12] }), materialId: "mat-studio-floor", semanticTags: ["studio", "backdrop", "cyclorama"], rendererOwned: true }
    ],
    storyBlocking: { cameraPosition: [0, 1.2, 4], cameraTarget: [0, 0.7, 0], practicalLightIds: [] },
    diagnostics: [{ code: "AURA_PROCEDURAL_STUDIO_SET_BUILT", severity: "info", path: "proceduralSets.studio", message: "Built product studio from renderer-owned procedural geometry.", fixSuggestion: "Add branded set dressing through manifest assets when needed." }]
  };
}
