export const externalParityAura3DInteriorSceneBenchmark = {
  engine: "a3d",
  scene: "external-parity-interior-gallery",
  sceneFixture: "fixtures/external-parity/scenes/interior-gallery/manifest.json",
  publicApis: ["Renderer", "createArchitecturalMaterial", "createArchitecturalLightingFixture", "createLightingDefault"],
  expectedProof: ["multi-object interior", "architectural material categories", "lighting presets", "tone mapping", "shadow receivers", "browser screenshot"]
};
