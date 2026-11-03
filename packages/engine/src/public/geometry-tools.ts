export {
  computeAuraCreasedNormals,
  convertAuraTriangleTopology,
  deinterleaveAuraAttributes,
  estimateAuraGeometryMemory,
  evaluateAuraMorphPositions,
  interleaveAuraAttributes,
  mergeAuraGeometryGroups,
  remapAuraGeometryVertices,
  weldAuraGeometry
} from "../agent-api/geometry/GeometryUtilities.js";
export type {
  AuraAttributeStorage,
  AuraGeometryMemoryEstimate,
  AuraInterleavedAttributes,
  AuraWeldResult
} from "../agent-api/geometry/GeometryUtilities.js";
export {
  deformAuraMeshAlongCurve,
  simplifyAuraMesh,
  splitAuraMeshEdges,
  tessellateAuraMesh
} from "../agent-api/geometry/MeshModifiers.js";
export type {
  AuraCurveVector,
  AuraMeshCurve,
  AuraMeshDeformOptions,
  AuraMeshEdgeSplitOptions,
  AuraMeshModifierDiagnostic,
  AuraMeshModifierResult,
  AuraMeshSimplifyOptions,
  AuraMeshTessellateOptions
} from "../agent-api/geometry/MeshModifiers.js";
export { buildUVAtlas } from "../agent-api/geometry/UVAtlas.js";
export type {
  UVAtlasChart,
  UVAtlasDestination,
  UVAtlasGeometry,
  UVAtlasOptions,
  UVAtlasRect,
  UVAtlasResult,
  UVAtlasSeam
} from "../agent-api/geometry/UVAtlas.js";
export { createMeshSurfaceSampler, MeshSurfaceSampler } from "../agent-api/geometry/MeshSurfaceSampler.js";
export type { AuraMeshSurfaceSample, AuraMeshSurfaceSamplerOptions } from "../agent-api/geometry/MeshSurfaceSampler.js";
export { AuraTopologyValidationError, validateAuraGeometryTopology } from "../agent-api/geometry/TopologyValidation.js";
export type {
  AuraTopologyDegenerateFace,
  AuraTopologyEdge,
  AuraTopologyInvalidIndex,
  AuraTopologyValidationErrorCode,
  AuraTopologyValidationOptions,
  AuraTopologyValidationResult
} from "../agent-api/geometry/TopologyValidation.js";
export type { AuraCustomGeometrySpec, AuraCustomVertexAttributeSpec } from "../agent-api/RootGeometry.js";
