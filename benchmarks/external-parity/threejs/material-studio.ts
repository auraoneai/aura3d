export const v4ThreeMaterialStudioBenchmark = {
  engine: "threejs",
  scene: "v4-physical-material-matrix",
  materialLibrary: "fixtures/v4/materials/material-library.json",
  expectedProof: ["same 12 material targets", "same camera intent", "same HDR/IBL intent", "same texture-set intent", "browser screenshot", "visual diff"]
};
