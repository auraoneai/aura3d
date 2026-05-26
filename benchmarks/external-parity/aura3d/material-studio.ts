export const v4Aura3DMaterialStudioBenchmark = {
  engine: "a3d",
  scene: "v4-physical-material-matrix",
  publicApis: ["V4_PHYSICAL_MATERIAL_MATRIX", "analyzeV4MaterialMatrix", "Renderer"],
  materialLibrary: "fixtures/external-parity/materials/material-library.json",
  expectedProof: ["12 material balls", "HDR/IBL-sensitive lighting", "tone mapping", "texture-backed stone/fabric/rubber", "draw calls", "browser screenshot"]
};
