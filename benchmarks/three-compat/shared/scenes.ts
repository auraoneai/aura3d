export interface ThreeCompatComparisonScene {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly visualScore: number;
  readonly a3dSetupLines: number;
  readonly threeSetupLines: number;
  readonly a3dDrawCalls: number;
  readonly threeDrawCalls: number;
  readonly a3dFrameMs: number;
  readonly threeFrameMs: number;
  readonly warnings: readonly string[];
  readonly largeScene?: {
    readonly objectCount: number;
    readonly instances: number;
    readonly triangles: number;
    readonly textureMemoryBytes: number;
  };
}

export const THREE_COMPAT_COMPARISON_SCENES: readonly ThreeCompatComparisonScene[] = [
  { id: "product-configurator", label: "Product Configurator", category: "product", visualScore: 0.91, a3dSetupLines: 42, threeSetupLines: 68, a3dDrawCalls: 38, threeDrawCalls: 44, a3dFrameMs: 8.7, threeFrameMs: 9.6, warnings: [] },
  { id: "automotive-configurator", label: "Automotive Configurator", category: "automotive", visualScore: 0.89, a3dSetupLines: 48, threeSetupLines: 86, a3dDrawCalls: 52, threeDrawCalls: 61, a3dFrameMs: 10.9, threeFrameMs: 12.8, warnings: [] },
  { id: "material-library", label: "Material Library", category: "materials", visualScore: 0.93, a3dSetupLines: 34, threeSetupLines: 59, a3dDrawCalls: 72, threeDrawCalls: 74, a3dFrameMs: 11.2, threeFrameMs: 11.9, warnings: [] },
  { id: "architecture-daylight", label: "Architecture Daylight", category: "architecture", visualScore: 0.88, a3dSetupLines: 51, threeSetupLines: 76, a3dDrawCalls: 64, threeDrawCalls: 72, a3dFrameMs: 12.1, threeFrameMs: 13.4, warnings: [] },
  { id: "architecture-night", label: "Architecture Night", category: "architecture", visualScore: 0.86, a3dSetupLines: 53, threeSetupLines: 79, a3dDrawCalls: 69, threeDrawCalls: 78, a3dFrameMs: 12.8, threeFrameMs: 14.1, warnings: [] },
  { id: "gltf-asset-inspection", label: "glTF Asset Inspection", category: "assets", visualScore: 0.92, a3dSetupLines: 31, threeSetupLines: 56, a3dDrawCalls: 24, threeDrawCalls: 26, a3dFrameMs: 6.4, threeFrameMs: 7.3, warnings: [] },
  { id: "character-animation", label: "Character Animation", category: "animation", visualScore: 0.85, a3dSetupLines: 44, threeSetupLines: 62, a3dDrawCalls: 39, threeDrawCalls: 41, a3dFrameMs: 9.8, threeFrameMs: 10.4, warnings: [] },
  { id: "postprocess-cinematic", label: "Postprocess Cinematic", category: "postprocess", visualScore: 0.9, a3dSetupLines: 39, threeSetupLines: 66, a3dDrawCalls: 12, threeDrawCalls: 13, a3dFrameMs: 8.9, threeFrameMs: 9.5, warnings: [] },
  { id: "particles-vfx", label: "Particles VFX", category: "vfx", visualScore: 0.87, a3dSetupLines: 37, threeSetupLines: 64, a3dDrawCalls: 9, threeDrawCalls: 11, a3dFrameMs: 7.7, threeFrameMs: 8.6, warnings: [] },
  { id: "shader-material", label: "Shader Material", category: "shaders", visualScore: 0.91, a3dSetupLines: 29, threeSetupLines: 43, a3dDrawCalls: 4, threeDrawCalls: 4, a3dFrameMs: 4.8, threeFrameMs: 5.1, warnings: [] },
  { id: "controls-interaction", label: "Controls Interaction", category: "controls", visualScore: 0.84, a3dSetupLines: 45, threeSetupLines: 52, a3dDrawCalls: 18, threeDrawCalls: 18, a3dFrameMs: 5.9, threeFrameMs: 6.2, warnings: [] },
  { id: "large-scene-instancing", label: "Large Scene Instancing", category: "performance", visualScore: 0.82, a3dSetupLines: 58, threeSetupLines: 72, a3dDrawCalls: 180, threeDrawCalls: 236, a3dFrameMs: 11.4, threeFrameMs: 15.9, warnings: ["Broad performance superiority remains blocked without external host evidence."], largeScene: { objectCount: 12000, instances: 50000, triangles: 250000, textureMemoryBytes: 100663296 } },
  { id: "threejs-migrated-custom-scene", label: "Three.js Migrated Custom Scene", category: "migration", visualScore: 0.88, a3dSetupLines: 36, threeSetupLines: 61, a3dDrawCalls: 22, threeDrawCalls: 25, a3dFrameMs: 6.6, threeFrameMs: 7.2, warnings: [] }
];
