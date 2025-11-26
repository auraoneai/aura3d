/**
 * G3D 5.0 Simulation Module
 *
 * Complete simulation system for physics-based effects:
 * - MPM (Material Point Method) for fluids, snow, sand
 * - SPH (Smoothed Particle Hydrodynamics) for fluids
 * - PBD (Position Based Dynamics) for cloth
 * - FEM (Finite Element Method) for soft bodies
 * - Voronoi/Hierarchical fracture systems
 * - Fire and smoke volumetric simulation
 *
 * @module simulation
 */

// MPM Fluid Simulation
export { MPMGrid } from './mpm/Grid';
export type { GridCell } from './mpm/Grid';
export { ParticleBuffer } from './mpm/ParticleBuffer';
export type { ParticleData } from './mpm/ParticleBuffer';
export {
  MaterialModel,
  MaterialType,
  NeoHookeanModel,
  FluidModel,
  SnowModel,
  SandModel,
  createMaterial
} from './mpm/MaterialModels';
export type {
  MaterialParameters,
} from './mpm/MaterialModels';
export {
  MPMFluidSimulation,
} from './mpm/MPMFluidSimulation';
export type {
  MPMSimulationConfig
} from './mpm/MPMFluidSimulation';

// SPH Fluid Simulation
export { SPHKernels } from './sph/SPHKernels';
export { SpatialGrid } from './sph/SpatialGrid';
export {
  SPHFluidFramework,
} from './sph/SPHFluidFramework';
export type {
  SPHConfig,
  SPHParticle
} from './sph/SPHFluidFramework';
export {
  FluidRenderer,
} from './sph/FluidRenderer';
export type {
  FluidRenderingConfig
} from './sph/FluidRenderer';

// Cloth Simulation (PBD)
export { ClothSimulation } from './cloth';
export type { ClothConfig, WindConfig } from './cloth';
export {
  PBDSolver,
  DistanceConstraint as ClothDistanceConstraint,
  BendingConstraint,
  CollisionConstraint
} from './cloth';
export type { PBDSolverConfig, IPBDConstraint } from './cloth';
export { ClothCollisionSystem } from './cloth';
export type { CollisionInfo } from './cloth';
export { ClothTearingSystem } from './cloth';
export type { TearingConfig, TearEvent } from './cloth';

// Soft Body Simulation
export { SoftBody } from './softbody';
export type {
  SoftBodyParticle,
  Tetrahedron as SoftBodyTetrahedron,
  DistanceConstraint as SoftBodyDistanceConstraint,
  RigidAttachment,
  SoftBodyConfig,
} from './softbody';
export { SoftBodySolver, MaterialModel as SoftBodyMaterialModel, SolverMethod } from './softbody';
export type { MaterialParameters as SoftBodyMaterialParameters, SolverConfig } from './softbody';
export { TetMeshGenerator } from './softbody';
export type { TetMesh, TetGenConfig } from './softbody';

// Fracture Simulation
export * from './fracture';

// Fire Simulation
export * from './fire';

// Smoke Simulation
export * from './smoke';

// FEM (Finite Element Method)
export { TetrahedralSolver } from './fem';
export type { FEMSolverConfig } from './fem';
export { TetrahedralMesh } from './fem';
export type {
  Tetrahedron as FEMTetrahedron,
  TetrahedralVertex,
  TetrahedralMaterial,
} from './fem';
