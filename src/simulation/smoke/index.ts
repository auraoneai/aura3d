/**
 * Smoke and gas simulation module.
 * Provides complete smoke simulation with incompressible Navier-Stokes,
 * vorticity confinement, and volume rendering.
 * @module simulation/smoke
 */

export { SmokeSimulation } from './SmokeSimulation';
export type { SmokeSimulationConfig } from './SmokeSimulation';
export { SmokeGrid } from './SmokeGrid';
export { BuoyancyForces } from './BuoyancyForces';
export type { BuoyancyConfig } from './BuoyancyForces';
export { SmokeRenderer } from './SmokeRenderer';
export type { RayMarchConfig } from './SmokeRenderer';
