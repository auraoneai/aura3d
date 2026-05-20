export const v4GalileoInteriorSceneBenchmark = {
  engine: "g3d",
  scene: "v4-interior-gallery",
  sceneFixture: "fixtures/v4/scenes/interior-gallery/manifest.json",
  publicApis: ["Renderer", "createArchitecturalMaterial", "createArchitecturalLightingFixture", "createLightingDefault"],
  expectedProof: ["multi-object interior", "architectural material categories", "lighting presets", "tone mapping", "shadow receivers", "browser screenshot"]
};
