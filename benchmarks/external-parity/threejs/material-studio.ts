export const externalParityThreeMaterialStudioBenchmark = {
  engine: "threejs",
  scene: "external-parity-physical-material-matrix",
  materialLibrary: "fixtures/external-parity/materials/material-library.json",
  expectedProof: ["same 12 material targets", "same camera intent", "same HDR/IBL intent", "same texture-set intent", "browser screenshot", "visual diff"]
};
