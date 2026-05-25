export const v4GalileoMaterialStudioBenchmark = {
  engine: "g3d",
  scene: "v4-physical-material-matrix",
  publicApis: ["V4_PHYSICAL_MATERIAL_MATRIX", "analyzeV4MaterialMatrix", "Renderer"],
  materialLibrary: "fixtures/v4/materials/material-library.json",
  expectedProof: ["12 material balls", "HDR/IBL-sensitive lighting", "tone mapping", "texture-backed stone/fabric/rubber", "draw calls", "browser screenshot"]
};
