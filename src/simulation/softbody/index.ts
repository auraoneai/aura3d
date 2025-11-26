/**
 * Soft body simulation module.
 * Provides deformable body simulation using tetrahedral meshes and Position-Based Dynamics.
 * @module simulation/softbody
 */

export { SoftBody } from './SoftBody';
export type {
  SoftBodyParticle,
  Tetrahedron,
  DistanceConstraint,
  RigidAttachment,
  SoftBodyConfig,
} from './SoftBody';

export { SoftBodySolver, MaterialModel, SolverMethod } from './SoftBodySolver';
export type { MaterialParameters, SolverConfig } from './SoftBodySolver';

export { TetMeshGenerator } from './TetMeshGenerator';
export type { TetMesh, TetGenConfig } from './TetMeshGenerator';
