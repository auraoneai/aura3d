import { createProceduralTransform, type AuraProceduralSetBuild } from "./AuraProceduralSetBuilder.js";

export function buildRainyNeonAlleySet(id = "procedural-rainy-neon-alley"): AuraProceduralSetBuild {
  return {
    id,
    label: "Procedural Rainy Neon Alley",
    category: "urban-environment",
    materials: [
      {
        id: "mat-procedural-wet-pavement",
        label: "Procedural wet pavement",
        target: "ground",
        descriptors: ["wet-pavement", "asphalt", "puddles", "neon reflections"],
        baseColor: [0.025, 0.03, 0.04, 1],
        metallic: 0,
        roughness: 0.16,
        wetness: 1,
        clearcoat: 0.8,
        requiresRendererMaterial: true
      },
      {
        id: "mat-procedural-neon-magenta",
        label: "Magenta neon emissive",
        target: "practical-light",
        descriptors: ["neon-practical-light", "emissive", "bloom"],
        baseColor: [1, 0.18, 0.75, 1],
        metallic: 0,
        roughness: 0.08,
        emissive: [1, 0.18, 0.75],
        emissiveStrength: 4,
        requiresRendererMaterial: true
      },
      {
        id: "mat-procedural-alley-brick",
        label: "Wet alley brick",
        target: "set",
        descriptors: ["wet brick", "dark wall", "occlusion"],
        baseColor: [0.12, 0.11, 0.13, 1],
        metallic: 0,
        roughness: 0.52,
        wetness: 0.55,
        requiresRendererMaterial: true
      }
    ],
    renderables: [
      {
        id: "alley-wet-pavement",
        label: "Wet pavement ground plane",
        role: "ground",
        geometry: "plane",
        transform: createProceduralTransform({ position: [0, 0, -1.5], rotation: [-Math.PI / 2, 0, 0], scale: [6, 10, 1] }),
        materialId: "mat-procedural-wet-pavement",
        semanticTags: ["wet-pavement", "ground", "renderer-material"],
        rendererOwned: true
      },
      {
        id: "alley-left-wall",
        label: "Left alley wall",
        role: "set",
        geometry: "box",
        transform: createProceduralTransform({ position: [-3, 1.8, -2], scale: [0.25, 3.6, 10] }),
        materialId: "mat-procedural-alley-brick",
        semanticTags: ["alley", "wall", "occlusion", "depth"],
        rendererOwned: true
      },
      {
        id: "alley-right-wall",
        label: "Right alley wall",
        role: "set",
        geometry: "box",
        transform: createProceduralTransform({ position: [3, 1.8, -2.2], scale: [0.25, 3.6, 10] }),
        materialId: "mat-procedural-alley-brick",
        semanticTags: ["alley", "wall", "occlusion", "depth"],
        rendererOwned: true
      },
      {
        id: "neon-practical-left",
        label: "Left magenta neon practical",
        role: "practical-light",
        geometry: "box",
        transform: createProceduralTransform({ position: [-2.82, 2.1, -1.8], rotation: [0, 0.2, 0], scale: [0.08, 0.35, 1.25] }),
        materialId: "mat-procedural-neon-magenta",
        semanticTags: ["neon-practical-light", "emissive", "scene-geometry"],
        rendererOwned: true,
        light: { color: [1, 0.18, 0.75], intensity: 3.8, castsLight: true }
      },
      {
        id: "rain-particle-field",
        label: "Renderer rain particles",
        role: "vfx",
        geometry: "particles",
        transform: createProceduralTransform({ position: [0, 2.1, -1], scale: [6, 4, 9] }),
        semanticTags: ["rain", "particles", "renderer-owned"],
        rendererOwned: true
      },
      {
        id: "alley-fog-volume",
        label: "Low alley fog volume",
        role: "vfx",
        geometry: "volume",
        transform: createProceduralTransform({ position: [0, 0.65, -3], scale: [5.6, 1.2, 8] }),
        semanticTags: ["fog", "depth-haze", "renderer-owned"],
        rendererOwned: true
      }
    ],
    storyBlocking: {
      robotPosition: [-0.7, 0, 0.35],
      flowerPosition: [0.2, 0.02, -1.2],
      cameraPosition: [0, 0.9, 4.2],
      cameraTarget: [-0.1, 0.55, -0.75],
      practicalLightIds: ["neon-practical-left"]
    },
    diagnostics: [
      {
        code: "AURA_PROCEDURAL_ALLEY_SET_BUILT",
        severity: "info",
        path: "proceduralSets.rainy-neon-alley",
        message: "Built rainy neon alley as renderer-owned procedural geometry, material, light, rain, and fog renderables.",
        fixSuggestion: "Replace with a curated GLB alley only when the manifest entry preserves depth, occlusion, wet ground, and provenance."
      }
    ]
  };
}
