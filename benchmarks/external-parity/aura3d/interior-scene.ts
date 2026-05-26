export const v4Aura3DInteriorSceneBenchmark = {
  engine: "a3d",
  scene: "v4-interior-gallery",
  sceneFixture: "fixtures/external-parity/scenes/interior-gallery/manifest.json",
  publicApis: ["Renderer", "createArchitecturalMaterial", "createArchitecturalLightingFixture", "createLightingDefault"],
  expectedProof: ["multi-object interior", "architectural material categories", "lighting presets", "tone mapping", "shadow receivers", "browser screenshot"]
};
