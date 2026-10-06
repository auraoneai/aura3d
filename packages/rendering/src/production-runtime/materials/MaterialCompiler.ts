/**
 * E34 removal (PRD-04 P6-3): the `compilePBRMaterial`/`CompiledMaterialProgram`
 * stub — a string-concat "program key" that never compiled anything — was
 * deleted. The module stays as a thin re-export of the real program-key path
 * (`physicalFeatureSet` + `computeProgramKey`, PRD-04 P3) until Q-15-4 removes
 * this export line from the owner-01 barrel.
 */
export { computeProgramKey } from "../../contracts/program";
export type { ProgramFeatures } from "../../contracts/program";
export { physicalFeatureSet } from "../../materials/PhysicalFeatures";
