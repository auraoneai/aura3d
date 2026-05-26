export const externalParityAura3DMaterialStudioBenchmark = {
  engine: "a3d",
  scene: "external-parity-physical-material-matrix",
  publicApis: ["EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX", "analyzeExternalParityMaterialMatrix", "Renderer"],
  materialLibrary: "fixtures/external-parity/materials/material-library.json",
  expectedProof: ["12 material balls", "HDR/IBL-sensitive lighting", "tone mapping", "texture-backed stone/fabric/rubber", "draw calls", "browser screenshot"]
};
