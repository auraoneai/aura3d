/**
 * Finite Element Method (FEM) simulation module.
 * Provides tetrahedral FEM solver with corotational formulation
 * for deformable body simulation.
 * @module simulation/fem
 */

export { TetrahedralSolver } from './TetrahedralSolver';
export type { FEMSolverConfig } from './TetrahedralSolver';
export { TetrahedralMesh } from './TetrahedralMesh';
export type {
  Tetrahedron,
  TetrahedralVertex,
  TetrahedralMaterial,
} from './TetrahedralMesh';
