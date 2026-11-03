/** Work with Aura shader graphs and materials without importing the engine root. */
export { createCustomShaderMaterial } from "../agent-api/compiler/customMaterial.js";
export type { AuraCustomMaterialSpec } from "../agent-api/nodes/types.js";
export {
  shaderGraph,
  shaderGraphMaterial,
  serializeShaderGraph,
  deserializeShaderGraph,
  migrateTslShaderGraph
} from "../agent-api/nodes/shaderGraph.js";
export type {
  ShaderGraphMaterialOptions,
  ShaderGraphStorageValue,
  LegacyShaderGraphMigration,
  ShaderGraphDocument,
  ShaderGraphNode,
  ShaderGraphResource,
  ShaderGraphMaterialOutput,
  ShaderGraphValueType,
  ShaderGraphTarget,
  ShaderGraphCompileResult,
  ShaderGraphDiagnostic,
  ShaderGraphStruct,
  ShaderGraphStructField,
  ShaderGraphFunction,
  ShaderGraphFunctionParameter
} from "../agent-api/nodes/shaderGraph.js";
export { ShaderGraphError } from "@aura3d/rendering/shader-graph";
export type {
  ShaderGraphBuiltin,
  ShaderGraphOperation,
  ShaderGraphStatement,
  ShaderGraphBinding,
  ShaderGraphStageData,
  ShaderGraphStorageStageBinding
} from "@aura3d/rendering/shader-graph";
